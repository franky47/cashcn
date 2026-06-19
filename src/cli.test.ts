import { describe, expect, it } from "vitest";

import { run } from "./cli.ts";
import type { FundingSource } from "./funding/source.ts";

function fakeSource(overrides: Partial<FundingSource> = {}): FundingSource {
  return {
    fetchNpmPackage: async () => {
      throw new Error("fetchNpmPackage not stubbed");
    },
    fetchFundingYml: async () => null,
    fetchSponsorTiers: async () => null,
    ...overrides,
  };
}

// Capture stdout/stderr and never open a real browser.
function harness(source: FundingSource) {
  const out: string[] = [];
  const err: string[] = [];
  const opened: string[] = [];
  const deps = {
    source,
    log: (m: string) => out.push(m),
    errorLog: (m: string) => err.push(m),
    open: (url: string) => opened.push(url),
  };
  return { deps, out, err, opened, text: () => out.join("\n"), errText: () => err.join("\n") };
}

describe("run", () => {
  it("resolves and prints an Open Collective deep-link without opening a browser", async () => {
    const h = harness(fakeSource());
    const code = await run(["sponsor", "oc://cashcn", "10/m", "--print"], h.deps);
    expect(code).toBe(0);
    expect(h.opened).toEqual([]);
    expect(h.text()).toContain("opencollective.com/cashcn/donate");
    expect(h.text()).toContain("amount=10");
    expect(h.text()).toContain("interval=month");
  });

  it("opens the browser by default", async () => {
    const h = harness(fakeSource());
    const code = await run(["donate", "oc://cashcn", "25/y"], h.deps);
    expect(code).toBe(0);
    expect(h.opened).toHaveLength(1);
    expect(h.opened[0]).toContain("interval=year");
  });

  it("resolves a matching GitHub tier end-to-end", async () => {
    const source = fakeSource({
      fetchSponsorTiers: async () => ({
        via: "gh",
        tiers: [{ dollars: 10, isOneTime: false, tierId: "555" }],
      }),
    });
    const h = harness(source);
    const code = await run(["sponsor", "gh://franky47", "10/m", "--print"], h.deps);
    expect(code).toBe(0);
    expect(h.text()).toContain("tier_id=555");
  });

  it("defaults the verb when omitted", async () => {
    const h = harness(fakeSource());
    const code = await run(["oc://cashcn", "10/m", "--print"], h.deps);
    expect(code).toBe(0);
    expect(h.text()).toContain("opencollective.com/cashcn/donate");
    expect(h.text()).toContain("sponsor $10 monthly");
  });

  it("rejects an unknown verb", async () => {
    const h = harness(fakeSource());
    const code = await run(["yeet", "oc://cashcn", "10"], h.deps);
    expect(code).toBe(1);
    expect(h.errText()).toMatch(/unknown verb/i);
  });

  it("errors when no funding destinations are found", async () => {
    // npm package with no funding and no source repo → zero targets.
    const source = fakeSource({
      fetchNpmPackage: async () => ({ fundingUrls: [], repo: null }),
    });
    const h = harness(source);
    const code = await run(["tip", "npm://lonely", "5"], h.deps);
    expect(code).toBe(1);
    expect(h.errText()).toMatch(/no funding destinations/i);
  });

  it("prints the version", async () => {
    const h = harness(fakeSource());
    const code = await run(["--version"], h.deps);
    expect(code).toBe(0);
    expect(h.text()).toMatch(/^cashcn \d/);
  });
});
