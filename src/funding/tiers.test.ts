import { describe, expect, it } from "vitest";

import type { Amount, SponsorTier } from "../types.ts";
import type { FundingSource } from "./source.ts";
import { matchTier, numericTierId, parseCrawledTiers, resolveSponsorTier } from "./tiers.ts";

describe("numericTierId", () => {
  it("decodes the numeric id from a Sponsors tier node id", () => {
    const nodeId = Buffer.from("012:SponsorsTier12345").toString("base64");
    expect(numericTierId(nodeId)).toBe("12345");
  });

  it("returns null for a node id that is not a Sponsors tier", () => {
    const nodeId = Buffer.from("012:Repository42").toString("base64");
    expect(numericTierId(nodeId)).toBeNull();
  });
});

describe("parseCrawledTiers", () => {
  it("pairs each tier_id with the nearest preceding price header", () => {
    const html = `
      <h4>$5 a month</h4>
      <a href="/sponsors/x/sponsorships?tier_id%3D111">Select</a>
      <h4>$10 a month</h4>
      <a href="/sponsors/x/sponsorships?tier_id%3D222">Select</a>
    `;
    expect(parseCrawledTiers(html, false)).toEqual([
      { dollars: 5, isOneTime: false, tierId: "111" },
      { dollars: 10, isOneTime: false, tierId: "222" },
    ]);
  });

  it("handles thousands separators in prices", () => {
    const html = `$1,000 one time<a href="tier_id%3D999">x</a>`;
    expect(parseCrawledTiers(html, true)).toEqual([
      { dollars: 1000, isOneTime: true, tierId: "999" },
    ]);
  });
});

const tiers: SponsorTier[] = [
  { dollars: 5, isOneTime: false, tierId: "1" },
  { dollars: 10, isOneTime: false, tierId: "2" },
  { dollars: 10, isOneTime: true, tierId: "3" },
];

describe("matchTier", () => {
  it("matches on both amount and one-time/recurring kind", () => {
    expect(matchTier(tiers, { value: 10, interval: "month" })).toMatchObject({
      tierId: "2",
    });
    expect(matchTier(tiers, { value: 10, interval: "once" })).toMatchObject({
      tierId: "3",
    });
  });

  it("returns null when no tier price matches", () => {
    expect(matchTier(tiers, { value: 7, interval: "month" })).toBeNull();
  });
});

// A fake source lets us test the I/O orchestration without any network.
function fakeSource(
  result: Awaited<ReturnType<FundingSource["fetchSponsorTiers"]>>,
  spy?: (login: string, wantOneTime: boolean) => void,
): FundingSource {
  return {
    fetchNpmPackage: async () => {
      throw new Error("unused");
    },
    fetchFundingYml: async () => null,
    fetchSponsorTiers: async (login, wantOneTime) => {
      spy?.(login, wantOneTime);
      return result;
    },
  };
}

describe("resolveSponsorTier", () => {
  it("never queries tiers for a yearly amount (GitHub has no yearly tier)", async () => {
    let called = false;
    const source = fakeSource(null, () => {
      called = true;
    });
    const amount: Amount = { value: 10, interval: "year" };
    expect(await resolveSponsorTier(source, "x", amount)).toBeNull();
    expect(called).toBe(false);
  });

  it("returns the matched tier with its provenance", async () => {
    const source = fakeSource({ tiers, via: "gh" });
    const result = await resolveSponsorTier(source, "x", {
      value: 10,
      interval: "month",
    });
    expect(result).toEqual({ tierId: "2", dollars: 10, via: "gh" });
  });

  it("returns null when the source has no tiers", async () => {
    const source = fakeSource(null);
    const result = await resolveSponsorTier(source, "x", {
      value: 10,
      interval: "month",
    });
    expect(result).toBeNull();
  });
});
