import { platformByKey } from "./platforms.ts";
import type { Amount, Target } from "./types.ts";

// Choose which funding checkout to open. Lower score = opened first.
//
// When a project declares funding via FUNDING.yml, treat that as the
// maintainer's curated intent and prefer the two first-party platforms GitHub
// surfaces (GitHub Sponsors & Open Collective) over everything else, regardless
// of raw pre-fill capability. Otherwise rank purely by pre-fill quality.
const FUNDING_YML_PREFERRED = new Set(["github", "open_collective"]);

const UNKNOWN_RANK = 8;
const FUNDING_YML_DEMOTION = 100;
const ONE_TIME_LIBERAPAY_DEMOTION = 10;

export function rankTargets(targets: Target[], amount: Amount): Target[] {
  const fromFundingYml = targets.some((t) => t.source.includes("FUNDING.yml"));

  const scoreOf = (t: Target): number => {
    let score = platformByKey(t.platform)?.rank ?? UNKNOWN_RANK;
    if (fromFundingYml && !FUNDING_YML_PREFERRED.has(t.platform)) {
      score += FUNDING_YML_DEMOTION;
    }
    // Liberapay can't pre-fill a one-time amount, so demote it for those.
    if (amount.interval === "once" && t.platform === "liberapay") {
      score += ONE_TIME_LIBERAPAY_DEMOTION;
    }
    return score;
  };

  return [...targets].sort((a, b) => scoreOf(a) - scoreOf(b));
}
