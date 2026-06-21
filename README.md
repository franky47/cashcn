# cashcn

> Ultra-simple payments to OSS maintainers via the CLI — a smarter `npm fund`.

`cashcn` resolves a maintainer / repo / package to its funding destinations and
opens the **right hosted checkout, pre-filled with your amount and recurrence**.

```bash
npx cashcn <destination> <amount>[/{m,y}]
```

It is a **discovery + deep-link** tool. Money never touches `cashcn` — it routes
you to GitHub Sponsors / Open Collective / Liberapay / etc. with the amount and
recurrence already filled in. That is the one shape of this idea that is
shippable today with zero PCI/KYC burden (see `cashcn.md` research for why
actually _moving_ the money requires becoming a regulated payment platform).

## Why a POC, and what it proves

The research found that **reading** funding data is easy everywhere but
**initiating a payment via API is gated on every fiat platform** (GitHub
`createSponsorship` is recurring-only and charges the _caller's_ card; Open
Collective blocks external Stripe/PayPal charges; thanks.dev / Liberapay have no
payment API). What _is_ fully feasible is deep-linking into the hosted checkout
with the recipient, amount and recurrence prefilled. This POC demonstrates that
end-to-end.

## Usage

```bash
npx cashcn gh://franky47   100      # one-time $100
npx cashcn 47ng/nuqs       10/m     # $10 / month
npx cashcn oc://antfu      25/y     # $25 / year
npx cashcn npm://nuqs      5/m      # resolve npm pkg funding
```

> The `$` prefix is intentionally dropped — it triggers shell variable
> expansion. Amounts are plain numbers with an optional `/m` or `/y` suffix.

Add `--print` (or `--dry-run`) to resolve and build the link **without** opening
a browser — handy for scripting and for seeing what got resolved.

### Destinations

| Form                  | Meaning                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| `gh://<user>`         | GitHub user → GitHub Sponsors (+ their profile `FUNDING.yml`)          |
| `gh://<owner>/<repo>` | GitHub repo → reads `.github/FUNDING.yml`                              |
| `npm://<pkg>`         | npm package → reads its `funding` field, then the repo's `FUNDING.yml` |
| `oc://<slug>`         | Open Collective collective                                             |
| `<user>`              | shorthand for `gh://<user>`                                            |
| `<owner>/<repo>`      | shorthand for `gh://<owner>/<repo>`                                    |

Scoped npm packages need the explicit scheme: `npm://@scope/pkg`.

## How it works

1. **Parse** the destination (`src/destination.js`) and amount (`src/amount.js`).
2. **Resolve** funding targets (`src/resolve.js`) by unioning:
   - the npm registry `funding` field,
   - `.github/FUNDING.yml` (`src/funding-yml.js`, a minimal parser),
   - GitHub Sponsors directly for a bare user.
3. **Rank** targets by how well each can be pre-filled (`src/platforms.js`):
   `Open Collective > Liberapay > GitHub Sponsors > profile-only`. Liberapay is
   recurring-only, so it's demoted for one-time payments.
4. **Build** the deep-link with `amount` / `interval` / `frequency` injected
   where the platform supports it, and **open** it (`src/open-url.js`).

### GitHub Sponsors tier resolution

GitHub has no free-form `amount` query param — you can only deep-link to a
specific **tier**, identified by a numeric `tier_id`. `cashcn` resolves the tier
whose price exactly matches your amount (`src/github-tiers.js`), trying in order:

1. **`gh` CLI** — `gh api graphql` lists every tier with its node id (decoded to
   the numeric `tier_id`). Authoritative; used when `gh` is installed + authed.
   An exact match deep-links to that tier (so the sponsor lands on its rewards).
2. **Public-page crawl** — scrapes `github.com/sponsors/<login>` for the
   `tier_id` ↔ price pairs. Token-free fallback when `gh` isn't available.
3. **Custom amount** — if no exact tier matches, pre-fill a free-form `amount` on
   the `/sponsorships` checkout (`?frequency=…&amount=…`). GitHub honours this as
   long as the maintainer has custom amounts enabled.

One-time and monthly tiers have different ids, so `… 10` and `… 10/m` resolve to
different tiers. GitHub has no yearly tier, so `/y` skips the lookup.

### Pre-fill capability (per research)

| Platform                                  | Amount | Recurrence | Notes                                                           |
| ----------------------------------------- | ------ | ---------- | --------------------------------------------------------------- |
| Open Collective                           | ✅     | ✅         | `?amount=&interval=month\|year`                                 |
| Liberapay                                 | ✅     | ✅         | recurring-only; `currency` required or amount is dropped        |
| GitHub Sponsors                           | ✅     | ✅         | exact-amount tier → `tier_id`, else custom `amount` (see below) |
| Patreon / Ko-fi / Buy Me a Coffee / Polar | ❌     | ❌         | opens the profile page only                                     |

## Limitations (it's a POC)

- `FUNDING.yml` parser handles the flat `key: value` / `key: [a, b]` shape only —
  not arbitrary YAML. Swap in a real parser for production.
- No ecosyste.ms aggregator backstop, no `funding.json` (floss.fund) source yet —
  both are noted in the research as worthwhile additions.
- GitHub tier resolution matches the amount **exactly**; it doesn't snap to the
  nearest tier (that would silently change what you pay). Tier lookups aren't
  cached, so each GitHub deep-link makes one `gh`/HTTP call.
- The tier lookup shells out to `gh` only if it's already on your PATH; otherwise
  it falls back to crawling the public Sponsors page.

## Architecture

All network/`gh` I/O sits behind one injected `FundingSource` port
(`src/funding/source.ts`); resolution, ranking and tier-matching are pure
functions over it. That keeps the whole pipeline testable offline with a fake
source, while the production `httpFundingSource` adapter validates every external
response with zod and returns failures as [`errore`](https://errore.org) values.

## Development

```bash
pnpm install
pnpm dev 47ng/nuqs 10/m --print           # run from source (node strips TS types)
pnpm test                                 # vitest (msw mocks the network)
pnpm validate                             # typecheck · lint · format · deadcode · test
pnpm build                                # tsdown -> dist/cashcn.js
```

Toolchain: `tsgo` (typecheck), `oxlint` + `oxfmt` (lint/format), `knip`
(dead-code), `vitest` + `msw` (tests), `tsdown` (bundle), `pnpm` 11 with a 24h
release-age cooldown on runtime deps.
