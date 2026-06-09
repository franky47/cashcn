import { describe, expect, it } from "vitest";

import { rankTargets } from "./ranking.ts";
import type { Amount, Target } from "./types.ts";

const once: Amount = { value: 10, interval: "once" };
const monthly: Amount = { value: 10, interval: "month" };

const target = (platform: string, source = "url"): Target => ({
  platform,
  id: "x",
  source,
});

describe("rankTargets", () => {
  it("orders by pre-fill quality (Open Collective before GitHub before profile-only)", () => {
    const ranked = rankTargets(
      [target("patreon"), target("github"), target("open_collective")],
      monthly,
    );
    expect(ranked.map((t) => t.platform)).toEqual(["open_collective", "github", "patreon"]);
  });

  it("prefers FUNDING.yml-declared GitHub/OC over a higher-ranked Liberapay", () => {
    const ranked = rankTargets(
      [target("liberapay", "FUNDING.yml"), target("github", "FUNDING.yml")],
      monthly,
    );
    // Liberapay's base rank (2) beats GitHub (3), but FUNDING.yml intent wins.
    expect(ranked[0]!.platform).toBe("github");
  });

  it("demotes recurring-only Liberapay for one-time payments", () => {
    const ranked = rankTargets([target("liberapay"), target("github")], once);
    expect(ranked[0]!.platform).toBe("github");
  });

  it("keeps Liberapay ahead of GitHub for recurring payments", () => {
    const ranked = rankTargets([target("github"), target("liberapay")], monthly);
    expect(ranked[0]!.platform).toBe("liberapay");
  });

  it("does not mutate the input array", () => {
    const input = [target("github"), target("open_collective")];
    const snapshot = [...input];
    rankTargets(input, monthly);
    expect(input).toEqual(snapshot);
  });
});
