// Shared domain types. Inferred-from-schema types live in schemas.ts; these are
// the hand-written domain shapes the modules pass around.

export type Interval = "once" | "month" | "year";

export interface Amount {
  value: number;
  interval: Interval;
}

export type Destination =
  | { kind: "github-user"; login: string }
  | { kind: "github-repo"; owner: string; repo: string }
  | { kind: "opencollective"; slug: string }
  | { kind: "npm"; pkg: string };

export interface Target {
  platform: string;
  id: string;
  source: string;
  customUrl?: string;
}

export interface DeepLink {
  url: string;
  prefilled: { amount: boolean; recurrence: boolean };
  note?: string;
}

/** A GitHub Sponsors tier as discovered from the gh CLI or the public page. */
export interface SponsorTier {
  dollars: number;
  isOneTime: boolean;
  tierId: string;
}

/** A tier resolved to match a requested amount, with provenance. */
export interface GithubTier {
  tierId: string;
  dollars: number;
  via: "gh" | "crawl";
}

/** npm package funding metadata, normalized. */
export interface NpmPackage {
  fundingUrls: string[];
  repo: { owner: string; repo: string } | null;
}

/** Parsed `.github/FUNDING.yml` — a flat map of platform key to id(s). */
export type FundingYml = Record<string, string | string[]>;
