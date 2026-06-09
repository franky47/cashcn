import { describe, expect, it } from "vitest";

import { NpmRegistryError } from "../errors.ts";
import type { Destination } from "../types.ts";
import { resolveTargets } from "./resolve.ts";
import type { FundingSource } from "./source.ts";

// A fake source built from partial overrides; anything not overridden throws,
// so a test that hits an unexpected method fails loudly.
function fakeSource(overrides: Partial<FundingSource>): FundingSource {
  return {
    fetchNpmPackage: async () => {
      throw new Error("fetchNpmPackage not stubbed");
    },
    fetchFundingYml: async () => null,
    fetchSponsorTiers: async () => null,
    ...overrides,
  };
}

const platforms = (r: { targets: Array<{ platform: string }> }) => r.targets.map((t) => t.platform);

describe("resolveTargets", () => {
  it("maps an Open Collective destination to a single target", async () => {
    const dest: Destination = { kind: "opencollective", slug: "cashcn" };
    const result = await resolveTargets(dest, fakeSource({}));
    expect(result.targets).toEqual([
      { platform: "open_collective", id: "cashcn", source: "oc://" },
    ]);
  });

  it("enriches a bare GitHub user with their profile FUNDING.yml", async () => {
    const dest: Destination = { kind: "github-user", login: "franky47" };
    const source = fakeSource({
      fetchFundingYml: async (owner, repo) => {
        expect([owner, repo]).toEqual(["franky47", ".github"]);
        return { open_collective: "cashcn" };
      },
    });
    const result = await resolveTargets(dest, source);
    expect(platforms(result)).toEqual(["github", "open_collective"]);
  });

  it("reads a repo FUNDING.yml into targets", async () => {
    const dest: Destination = {
      kind: "github-repo",
      owner: "47ng",
      repo: "nuqs",
    };
    const source = fakeSource({
      fetchFundingYml: async () => ({
        github: ["franky47"],
        liberapay: "franky47",
      }),
    });
    const result = await resolveTargets(dest, source);
    expect(platforms(result)).toEqual(["github", "liberapay"]);
  });

  it("falls back to the repo owner when there is no FUNDING.yml", async () => {
    const dest: Destination = {
      kind: "github-repo",
      owner: "47ng",
      repo: "nuqs",
    };
    const source = fakeSource({ fetchFundingYml: async () => null });
    const result = await resolveTargets(dest, source);
    expect(result.targets).toEqual([{ platform: "github", id: "47ng", source: "repo owner" }]);
    expect(result.notes.join(" ")).toMatch(/no funding\.yml/i);
  });

  it("unions npm funding urls with the source repo FUNDING.yml and dedupes", async () => {
    const dest: Destination = { kind: "npm", pkg: "nuqs" };
    const source = fakeSource({
      fetchNpmPackage: async () => ({
        fundingUrls: ["https://github.com/sponsors/franky47"],
        repo: { owner: "47ng", repo: "nuqs" },
      }),
      // Repo FUNDING.yml repeats the same GitHub sponsor → must dedupe to one.
      fetchFundingYml: async () => ({ github: "franky47" }),
    });
    const result = await resolveTargets(dest, source);
    expect(result.targets).toEqual([{ platform: "github", id: "franky47", source: "url" }]);
  });

  it("surfaces an npm registry failure as a note", async () => {
    const dest: Destination = { kind: "npm", pkg: "ghost-pkg" };
    const source = fakeSource({
      fetchNpmPackage: async () => new NpmRegistryError({ reason: "npm registry returned 404" }),
    });
    const result = await resolveTargets(dest, source);
    expect(result.targets).toEqual([]);
    expect(result.notes.join(" ")).toMatch(/404/);
  });
});
