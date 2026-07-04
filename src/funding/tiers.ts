import type { Amount, GithubTier, SponsorTier } from "../types.ts";
import type { FundingSource } from "./source.ts";

// GitHub has no free-form amount query param — you can only deep-link to a
// specific tier via `?tier_id=<n>`. These helpers find the tier whose price
// exactly matches the requested amount. The I/O (gh CLI / page crawl) lives in
// the FundingSource adapter; everything here is pure except resolveSponsorTier,
// which only orchestrates the injected source.

/** Sponsors tier node ids are base64 of `012:SponsorsTier<n>`; the URL wants <n>. */
export function numericTierId(nodeId: string): string | null {
  let decoded: string;
  try {
    decoded = Buffer.from(nodeId, "base64").toString("utf8");
  } catch {
    return null;
  }
  return decoded.match(/SponsorsTier(\d+)/)?.[1] ?? null;
}

// Walk price headers ($N a month / $N one time) and tier links in document
// order, pairing each tier_id with the nearest preceding price header.
export function parseCrawledTiers(html: string, wantOneTime: boolean): SponsorTier[] {
  const token = /\$([0-9,]+)\s*(?:a month|one time)|tier_id%3D(\d+)/g;
  const tiers: SponsorTier[] = [];
  let lastDollars: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = token.exec(html))) {
    if (m[1] != null) {
      lastDollars = Number(m[1].replace(/,/g, ""));
    } else if (m[2] != null && lastDollars != null) {
      tiers.push({ dollars: lastDollars, isOneTime: wantOneTime, tierId: m[2] });
    }
  }
  return tiers;
}

/** Find the tier matching the requested amount and one-time/recurring kind. */
export function matchTier(tiers: SponsorTier[], amount: Amount): SponsorTier | null {
  const wantOneTime = amount.interval === "once";
  return tiers.find((t) => t.isOneTime === wantOneTime && t.dollars === amount.value) ?? null;
}

/** Resolve a Sponsors tier for `login` matching `amount`, via the given source. */
export async function resolveSponsorTier(
  source: FundingSource,
  login: string,
  amount: Amount,
): Promise<GithubTier | null> {
  // Amountless — nothing to match.
  if (amount.value === null) return null;
  // GitHub Sponsors recurring tiers are monthly-only — there is no yearly tier.
  if (amount.interval === "year") return null;

  const found = await source.fetchSponsorTiers(login, amount.interval === "once");
  if (!found) return null;

  const match = matchTier(found.tiers, amount);
  if (!match) return null;
  return { tierId: match.tierId, dollars: match.dollars, via: found.via };
}
