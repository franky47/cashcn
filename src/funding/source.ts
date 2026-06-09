import type { FundingYmlError, NpmRegistryError } from "../errors.ts";
import type { FundingYml, NpmPackage, SponsorTier } from "../types.ts";

/** Tiers discovered for a Sponsors listing, tagged with how they were found. */
interface SponsorTiers {
  tiers: SponsorTier[];
  via: "gh" | "crawl";
}

// The single seam between funding resolution and the outside world. Everything
// behind this port does real I/O (HTTP, the `gh` CLI); everything that consumes
// it is pure and testable with a fake implementation. See http-source.ts for the
// production adapter.
export interface FundingSource {
  fetchNpmPackage(pkg: string): Promise<NpmPackage | NpmRegistryError>;
  fetchFundingYml(owner: string, repo: string): Promise<FundingYml | null | FundingYmlError>;
  fetchSponsorTiers(login: string, wantOneTime: boolean): Promise<SponsorTiers | null>;
}
