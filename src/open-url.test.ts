import { describe, expect, it } from "vitest";

import { resolveOpenCommand } from "./open-url.ts";

const SPONSORS_URL =
  "https://github.com/sponsors/franky47/sponsorships?frequency=one-time&amount=100&metadata_source=cashcn";

describe("resolveOpenCommand", () => {
  it("uses `open` with the raw URL on macOS", () => {
    expect(resolveOpenCommand("darwin", SPONSORS_URL)).toEqual(["open", [SPONSORS_URL]]);
  });

  it("uses `xdg-open` with the raw URL on Linux", () => {
    expect(resolveOpenCommand("linux", SPONSORS_URL)).toEqual(["xdg-open", [SPONSORS_URL]]);
  });

  it("escapes cmd control operators on Windows so the URL is not truncated at `&`", () => {
    const [command, args] = resolveOpenCommand("win32", SPONSORS_URL);
    expect(command).toBe("cmd");
    expect(args).toEqual([
      "/c",
      "start",
      "",
      "https://github.com/sponsors/franky47/sponsorships?frequency=one-time^&amount=100^&metadata_source=cashcn",
    ]);
    // Every `&` must be escaped — a single unescaped one truncates the rest.
    const target = args.at(-1)!;
    expect(target.match(/(?<!\^)&/)).toBeNull();
    expect(target.match(/\^&/g)).toHaveLength(2);
  });

  it("escapes the full set of cmd operators, not just `&`", () => {
    const [, args] = resolveOpenCommand("win32", "https://x.test/?a=1&b=(2)|3<4>5^6");
    expect(args.at(-1)).toBe("https://x.test/?a=1^&b=^(2^)^|3^<4^>5^^6");
  });
});
