import { NpmRegistryError } from "../errors.ts";
import { targetFromUrl } from "../platforms.ts";
import type { Destination, FundingYml, Target } from "../types.ts";
import type { FundingSource } from "./source.ts";

// Resolve a parsed destination into a deduplicated list of funding targets,
// unioning (per the cashcn research doc, in priority order):
//   1. npm registry `funding` field            (for npm packages)
//   2. .github/FUNDING.yml                      (for repos / the user profile repo)
//   3. GitHub Sponsors directly                 (for a bare GitHub user)
// All I/O goes through the injected FundingSource, so this is testable offline.

const FUNDING_KEYS = new Set([
  "github",
  "open_collective",
  "liberapay",
  "patreon",
  "ko_fi",
  "buy_me_a_coffee",
  "polar",
]);

export interface Resolution {
  targets: Target[];
  notes: string[];
}

export async function resolveTargets(
  destination: Destination,
  source: FundingSource,
): Promise<Resolution> {
  const notes: string[] = [];
  const targets = new Map<string, Target>();
  const add = (t: Target | null) => {
    if (!t) return;
    const key = `${t.platform}:${t.id}`;
    if (!targets.has(key)) targets.set(key, t);
  };

  switch (destination.kind) {
    case "opencollective": {
      add({ platform: "open_collective", id: destination.slug, source: "oc://" });
      break;
    }

    case "github-user": {
      add({ platform: "github", id: destination.login, source: "gh:// handle" });
      // Enrich from the user's profile repo (<login>/.github), best-effort.
      const yml = await source.fetchFundingYml(destination.login, ".github");
      if (yml instanceof Error) notes.push(yml.message);
      else if (yml) fundingYmlToTargets(yml, "FUNDING.yml").forEach(add);
      break;
    }

    case "github-repo": {
      const yml = await source.fetchFundingYml(destination.owner, destination.repo);
      if (yml instanceof Error) {
        notes.push(yml.message);
      } else if (yml) {
        fundingYmlToTargets(yml, "FUNDING.yml").forEach(add);
      } else {
        notes.push(
          `No FUNDING.yml found for ${destination.owner}/${destination.repo} — falling back to the repo owner's GitHub Sponsors.`,
        );
        add({ platform: "github", id: destination.owner, source: "repo owner" });
      }
      break;
    }

    case "npm": {
      const pkg = await source.fetchNpmPackage(destination.pkg);
      if (pkg instanceof NpmRegistryError) {
        notes.push(pkg.message);
        break;
      }
      for (const url of pkg.fundingUrls) add(targetFromUrl(url));
      // If the package points at a GitHub repo, union its FUNDING.yml too.
      if (pkg.repo) {
        const yml = await source.fetchFundingYml(pkg.repo.owner, pkg.repo.repo);
        if (yml instanceof Error) notes.push(yml.message);
        else if (yml) fundingYmlToTargets(yml, "FUNDING.yml (via repo)").forEach(add);
      }
      break;
    }
  }

  return { targets: [...targets.values()], notes };
}

function fundingYmlToTargets(yml: FundingYml, source: string): Target[] {
  const out: Target[] = [];
  for (const [key, value] of Object.entries(yml)) {
    const values = Array.isArray(value) ? value : [value];
    if (FUNDING_KEYS.has(key)) {
      for (const id of values) if (id) out.push({ platform: key, id, source });
    } else if (key === "custom") {
      for (const url of values) {
        const target = targetFromUrl(url);
        if (target) out.push({ ...target, source });
      }
    }
    // Other keys (tidelift, thanks_dev, community_bridge, …) are intentionally
    // skipped — they don't deep-link to a per-amount checkout.
  }
  return out;
}
