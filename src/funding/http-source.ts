import { execFile } from "node:child_process";
import { promisify } from "node:util";

import * as errore from "errore";

import { FundingYmlError, NpmRegistryError } from "../errors.ts";
import {
  npmPackageResponse,
  sponsorsGraphqlResponse,
  type NpmPackageResponse,
} from "../schemas.ts";
import type { NpmPackage, SponsorTier } from "../types.ts";
import type { FundingSource } from "./source.ts";
import { numericTierId, parseCrawledTiers } from "./tiers.ts";
import { parseFundingYml } from "./yml.ts";

const execFileAsync = promisify(execFile);

/** Runs `gh` with the given args and returns stdout (throws if gh is absent). */
export type GhRunner = (args: string[]) => Promise<string>;

const defaultRunGh: GhRunner = async (args) => {
  const { stdout } = await execFileAsync("gh", args, { timeout: 8000 });
  return stdout;
};

function isTruthy<T>(value: T): value is NonNullable<T> {
  return Boolean(value);
}

// The gh CLI → page-crawl chain is an expected fallback (gh is often absent), so
// failures are swallowed on the happy path. Set CASHCN_DEBUG to surface them.
function debugWarn(message: string, cause?: unknown): void {
  if (process.env.CASHCN_DEBUG) console.warn(`[cashcn] ${message}`, cause ?? "");
}

// The production FundingSource. `runGh` is injectable so tests can drive the
// gh-CLI path without spawning a process; HTTP is left to the real `fetch` and
// mocked with msw in tests.
export function createHttpFundingSource({
  runGh = defaultRunGh,
}: { runGh?: GhRunner } = {}): FundingSource {
  return {
    async fetchNpmPackage(pkg) {
      const url = `https://registry.npmjs.org/${encodeURIComponent(pkg).replace("%40", "@")}/latest`;
      const res = await fetch(url).catch(
        (e) =>
          new NpmRegistryError({
            reason: `Could not reach the npm registry: ${e.message}`,
            cause: e,
          }),
      );
      if (res instanceof NpmRegistryError) return res;
      if (!res.ok) {
        return new NpmRegistryError({
          reason: `npm registry returned ${res.status} for "${pkg}".`,
        });
      }

      const json = await (res.json() as Promise<unknown>).catch(
        (e) =>
          new NpmRegistryError({
            reason: `npm registry returned invalid JSON for "${pkg}".`,
            cause: e,
          }),
      );
      if (json instanceof NpmRegistryError) return json;

      const parsed = npmPackageResponse.safeParse(json);
      if (!parsed.success) {
        return new NpmRegistryError({
          reason: `Unexpected npm registry response for "${pkg}".`,
        });
      }
      return normalizeNpmPackage(parsed.data);
    },

    async fetchFundingYml(owner, repo) {
      // Try refs in order and stop at the first that exists — the awaits are
      // intentionally sequential, so the parallel-await lint doesn't apply.
      for (const ref of ["HEAD", "main", "master"]) {
        const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/.github/FUNDING.yml`;
        // oxlint-disable-next-line no-await-in-loop
        const res = await fetch(url).catch(
          (e) =>
            new FundingYmlError({
              reason: `Could not fetch FUNDING.yml (${ref}): ${e.message}`,
              cause: e,
            }),
        );
        if (res instanceof FundingYmlError) return res;
        // oxlint-disable-next-line no-await-in-loop
        if (res.ok) return parseFundingYml(await res.text());
      }
      return null;
    },

    async fetchSponsorTiers(login, wantOneTime) {
      const viaGh = await tiersViaGh(login, runGh);
      if (viaGh) return { tiers: viaGh, via: "gh" };

      const viaCrawl = await tiersViaCrawl(login, wantOneTime);
      if (viaCrawl) return { tiers: viaCrawl, via: "crawl" };

      return null;
    },
  };
}

export const httpFundingSource = createHttpFundingSource();

// --- helpers ---

function normalizeNpmPackage(data: NpmPackageResponse): NpmPackage {
  const funding = data.funding;
  const list = funding == null ? [] : Array.isArray(funding) ? funding : [funding];
  const fundingUrls = list
    .map((entry) => (typeof entry === "string" ? entry : entry.url))
    .filter(isTruthy);

  const repoUrl = typeof data.repository === "string" ? data.repository : data.repository?.url;
  const repoMatch = repoUrl?.match(/github\.com[/:]([^/]+)\/([^/.]+)/i);
  const repo = repoMatch?.[1] && repoMatch[2] ? { owner: repoMatch[1], repo: repoMatch[2] } : null;

  return { fundingUrls, repo };
}

// A single GraphQL query can't ask for both user and organization (a miss
// errors out), so try user first, then organization. gh being missing /
// unauthenticated is an expected fallback to the crawl; failures are traced
// only under CASHCN_DEBUG (see debugWarn).
async function tiersViaGh(login: string, runGh: GhRunner): Promise<SponsorTier[] | null> {
  for (const root of ["user", "organization"] as const) {
    const query = `query($login:String!){ ${root}(login:$login){ sponsorsListing { tiers(first:100){ nodes { monthlyPriceInDollars isOneTime id } } } } }`;
    // Roots are tried in order (user, then organization); sequential is intended.
    // `-f` (raw field) sends `login` as a plain string variable — unlike `-F`,
    // it never interprets a leading `@` as "read from this file".
    // oxlint-disable-next-line no-await-in-loop
    const stdout = await runGh([
      "api",
      "graphql",
      "-f",
      `query=${query}`,
      "-f",
      `login=${login}`,
    ]).catch((e) => {
      debugWarn(`gh tier lookup failed for ${login} (${root})`, e);
      return null;
    });
    if (stdout == null) continue;

    const json = errore.try(() => JSON.parse(stdout) as unknown);
    if (json instanceof Error) {
      debugWarn("gh returned non-JSON output", json);
      continue;
    }

    const parsed = sponsorsGraphqlResponse.safeParse(json);
    if (!parsed.success) {
      debugWarn("gh GraphQL response failed validation", parsed.error);
      continue;
    }

    const nodes = parsed.data.data?.[root]?.sponsorsListing?.tiers.nodes;
    const tiers = (nodes ?? [])
      .map((n): SponsorTier | null => {
        const tierId = numericTierId(n.id);
        return tierId
          ? {
              dollars: n.monthlyPriceInDollars,
              isOneTime: Boolean(n.isOneTime),
              tierId,
            }
          : null;
      })
      .filter(isTruthy);
    if (tiers.length) return tiers;
  }
  return null;
}

async function tiersViaCrawl(login: string, wantOneTime: boolean): Promise<SponsorTier[] | null> {
  const url = `https://github.com/sponsors/${encodeURIComponent(login)}${
    wantOneTime ? "?frequency=one-time" : ""
  }`;
  const res = await fetch(url).catch((e) => {
    debugWarn(`crawling the Sponsors page failed for ${login}`, e);
    return null;
  });
  if (!res || !res.ok) return null;

  const tiers = parseCrawledTiers(await res.text(), wantOneTime);
  return tiers.length ? tiers : null;
}
