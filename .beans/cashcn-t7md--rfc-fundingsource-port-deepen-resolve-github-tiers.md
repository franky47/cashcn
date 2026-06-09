---
# cashcn-t7md
title: "RFC: FundingSource port - deepen resolve + github-tiers"
status: completed
type: task
priority: high
created_at: 2026-06-02T08:25:57Z
updated_at: 2026-06-02T08:37:25Z
parent: cashcn-kgks
---

## Problem

`resolve.js` and `github-tiers.js` tangle network I/O with pure logic. Resolution
(npm → repo → FUNDING.yml union + dedup), tier-matching, node-id decoding and the
HTML-crawl parser can only be exercised by hitting `registry.npmjs.org`,
`raw.githubusercontent.com`, `github.com/sponsors`, and the `gh` CLI. None of it
is unit-testable today.

## Design — ports & adapters

Push all I/O behind one injected port; keep everything else pure.

```ts
// port (interface only) — src/funding/source.ts
interface FundingSource {
  fetchNpmPackage(pkg: string): Promise<NpmPackage | NpmRegistryError>
  fetchFundingYml(owner: string, repo: string): Promise<FundingYml | null | FundingYmlError>
  fetchSponsorTiers(login: string, wantOneTime: boolean): Promise<SponsorTier[] | null>
}

// pure (testable with a fake source)
resolveTargets(destination: Destination, source: FundingSource): Promise<{ targets; notes }>
matchTier(tiers: SponsorTier[], amount: Amount): GithubTier | null
numericTierId(nodeId: string): string | null
parseCrawledTiers(html: string, wantOneTime: boolean): SponsorTier[]

// real adapter — src/funding/http-source.ts
const httpFundingSource: FundingSource  // fetch + gh CLI + zod-validated responses
```

## Dependency strategy

External JSON (npm registry, gh GraphQL) validated with **zod v4** schemas at the
adapter boundary; failures returned as **errore** tagged errors, surfaced as soft
`notes` by the resolver. The CLI constructs `httpFundingSource` and injects it.

## Test impact

- Pure: `resolveTargets` against a fake `FundingSource`, plus `matchTier` /
  `numericTierId` / `parseCrawledTiers` as direct unit tests — zero network.
- Adapter: `httpFundingSource` against **msw**-mocked HTTP, covering error states
  (404/500, network failure, malformed JSON → zod rejection, missing FUNDING.yml).
- Replaces: nothing exists today; this is net-new coverage.
