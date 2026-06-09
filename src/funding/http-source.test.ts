import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "../../test/msw.ts";
import { NpmRegistryError } from "../errors.ts";
import { createHttpFundingSource, httpFundingSource } from "./http-source.ts";

const npmLatest = (pkg: string) => `https://registry.npmjs.org/${pkg}/latest`;
const rawYml = (owner: string, repo: string, ref: string) =>
  `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/.github/FUNDING.yml`;

describe("fetchNpmPackage", () => {
  it("normalizes funding urls and the source repo", async () => {
    server.use(
      http.get(npmLatest("nuqs"), () =>
        HttpResponse.json({
          funding: "https://github.com/sponsors/franky47",
          repository: { type: "git", url: "git+https://github.com/47ng/nuqs.git" },
        }),
      ),
    );
    const result = await httpFundingSource.fetchNpmPackage("nuqs");
    expect(result).toEqual({
      fundingUrls: ["https://github.com/sponsors/franky47"],
      repo: { owner: "47ng", repo: "nuqs" },
    });
  });

  it("accepts the array-of-objects funding shape", async () => {
    server.use(
      http.get(npmLatest("pkg"), () =>
        HttpResponse.json({
          funding: [
            { type: "opencollective", url: "https://opencollective.com/pkg" },
            "https://liberapay.com/pkg",
          ],
        }),
      ),
    );
    const result = await httpFundingSource.fetchNpmPackage("pkg");
    expect(result).toMatchObject({
      fundingUrls: ["https://opencollective.com/pkg", "https://liberapay.com/pkg"],
      repo: null,
    });
  });

  it("returns NpmRegistryError on a 404", async () => {
    server.use(http.get(npmLatest("ghost"), () => new HttpResponse(null, { status: 404 })));
    const result = await httpFundingSource.fetchNpmPackage("ghost");
    expect(result).toBeInstanceOf(NpmRegistryError);
    if (result instanceof NpmRegistryError) {
      expect(result.message).toContain("404");
    }
  });

  it("returns NpmRegistryError on a network failure", async () => {
    server.use(http.get(npmLatest("down"), () => HttpResponse.error()));
    const result = await httpFundingSource.fetchNpmPackage("down");
    expect(result).toBeInstanceOf(NpmRegistryError);
  });

  it("returns NpmRegistryError on malformed JSON", async () => {
    server.use(http.get(npmLatest("bad"), () => HttpResponse.text("<!doctype html>not json")));
    const result = await httpFundingSource.fetchNpmPackage("bad");
    expect(result).toBeInstanceOf(NpmRegistryError);
  });
});

describe("fetchFundingYml", () => {
  it("parses the FUNDING.yml at HEAD", async () => {
    server.use(
      http.get(rawYml("47ng", "nuqs", "HEAD"), () =>
        HttpResponse.text("github: franky47\nopen_collective: nuqs"),
      ),
    );
    const result = await httpFundingSource.fetchFundingYml("47ng", "nuqs");
    expect(result).toEqual({ github: "franky47", open_collective: "nuqs" });
  });

  it("falls back to the main branch when HEAD is missing", async () => {
    server.use(
      http.get(rawYml("o", "r", "HEAD"), () => new HttpResponse(null, { status: 404 })),
      http.get(rawYml("o", "r", "main"), () => HttpResponse.text("github: alice")),
    );
    const result = await httpFundingSource.fetchFundingYml("o", "r");
    expect(result).toEqual({ github: "alice" });
  });

  it("returns null when no branch has a FUNDING.yml", async () => {
    for (const ref of ["HEAD", "main", "master"]) {
      server.use(http.get(rawYml("o", "r", ref), () => new HttpResponse(null, { status: 404 })));
    }
    expect(await httpFundingSource.fetchFundingYml("o", "r")).toBeNull();
  });
});

describe("fetchSponsorTiers", () => {
  it("uses the gh CLI when it returns tiers", async () => {
    const nodeId = Buffer.from("012:SponsorsTier777").toString("base64");
    const runGh = async () =>
      JSON.stringify({
        data: {
          user: {
            sponsorsListing: {
              tiers: {
                nodes: [{ monthlyPriceInDollars: 10, isOneTime: false, id: nodeId }],
              },
            },
          },
        },
      });
    const source = createHttpFundingSource({ runGh });
    const result = await source.fetchSponsorTiers("franky47", false);
    expect(result).toEqual({
      via: "gh",
      tiers: [{ dollars: 10, isOneTime: false, tierId: "777" }],
    });
  });

  it("falls back to crawling the public page when gh is unavailable", async () => {
    server.use(
      http.get("https://github.com/sponsors/franky47", () =>
        HttpResponse.text(`<h4>$10 a month</h4><a href="?tier_id%3D42">x</a>`),
      ),
    );
    const runGh = async () => {
      throw new Error("gh: not found");
    };
    const source = createHttpFundingSource({ runGh });
    const result = await source.fetchSponsorTiers("franky47", false);
    expect(result).toEqual({
      via: "crawl",
      tiers: [{ dollars: 10, isOneTime: false, tierId: "42" }],
    });
  });
});
