import { describe, expect, it } from "vitest";

import { parseDestination } from "./destination.ts";
import { InvalidDestinationError } from "./errors.ts";

describe("parseDestination", () => {
  it("parses gh://<user> as a GitHub user", () => {
    expect(parseDestination("gh://franky47")).toEqual({
      kind: "github-user",
      login: "franky47",
    });
  });

  it("parses gh://<owner>/<repo> as a GitHub repo", () => {
    expect(parseDestination("gh://47ng/nuqs")).toEqual({
      kind: "github-repo",
      owner: "47ng",
      repo: "nuqs",
    });
  });

  it("treats github:// as an alias of gh://", () => {
    expect(parseDestination("github://franky47")).toEqual({
      kind: "github-user",
      login: "franky47",
    });
  });

  it("parses npm://<pkg>", () => {
    expect(parseDestination("npm://nuqs")).toEqual({ kind: "npm", pkg: "nuqs" });
  });

  it("parses a scoped npm package via the explicit scheme", () => {
    expect(parseDestination("npm://@scope/pkg")).toEqual({
      kind: "npm",
      pkg: "@scope/pkg",
    });
  });

  it("parses oc://<slug> as Open Collective", () => {
    expect(parseDestination("oc://antfu")).toEqual({
      kind: "opencollective",
      slug: "antfu",
    });
  });

  it("treats a bare slug as a GitHub user", () => {
    expect(parseDestination("franky47")).toEqual({
      kind: "github-user",
      login: "franky47",
    });
  });

  it("treats <owner>/<repo> shorthand as a GitHub repo", () => {
    expect(parseDestination("47ng/nuqs")).toEqual({
      kind: "github-repo",
      owner: "47ng",
      repo: "nuqs",
    });
  });

  it("returns an error for an unknown scheme", () => {
    const result = parseDestination("gitlab://foo");
    expect(result).toBeInstanceOf(InvalidDestinationError);
  });

  it("returns an error for a too-deep GitHub path", () => {
    expect(parseDestination("a/b/c")).toBeInstanceOf(InvalidDestinationError);
  });

  it("rejects a login with an @ prefix (would be a gh file-read vector)", () => {
    expect(parseDestination("@/etc/passwd")).toBeInstanceOf(InvalidDestinationError);
    expect(parseDestination("gh://@-")).toBeInstanceOf(InvalidDestinationError);
  });

  it("rejects logins/owners with illegal characters", () => {
    expect(parseDestination("foo bar")).toBeInstanceOf(InvalidDestinationError);
    expect(parseDestination("a b/repo")).toBeInstanceOf(InvalidDestinationError);
  });

  it("accepts dots and underscores in repo names", () => {
    expect(parseDestination("47ng/my_repo.js")).toEqual({
      kind: "github-repo",
      owner: "47ng",
      repo: "my_repo.js",
    });
  });

  it("returns an error for an empty token", () => {
    expect(parseDestination("")).toBeInstanceOf(InvalidDestinationError);
  });
});
