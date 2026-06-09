import { describe, expect, it } from "vitest";

import { parseFundingYml } from "./yml.ts";

describe("parseFundingYml", () => {
  it("parses a scalar key: value pair", () => {
    expect(parseFundingYml("github: franky47")).toEqual({ github: "franky47" });
  });

  it("parses an inline array value", () => {
    expect(parseFundingYml("github: [alice, bob]")).toEqual({
      github: ["alice", "bob"],
    });
  });

  it("unquotes single- and double-quoted values", () => {
    expect(parseFundingYml(`custom: "https://example.com"`)).toEqual({
      custom: "https://example.com",
    });
  });

  it("strips unquoted trailing comments", () => {
    expect(parseFundingYml("github: franky47 # my handle")).toEqual({
      github: "franky47",
    });
  });

  it("keeps a # that lives inside a quoted value", () => {
    expect(parseFundingYml(`custom: "https://x.com/donate#now"`)).toEqual({
      custom: "https://x.com/donate#now",
    });
  });

  it("ignores blank lines and lines without a colon", () => {
    const yml = `
github: franky47

just-a-comment-line
open_collective: cashcn
`;
    expect(parseFundingYml(yml)).toEqual({
      github: "franky47",
      open_collective: "cashcn",
    });
  });
});
