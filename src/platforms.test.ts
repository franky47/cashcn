import { describe, expect, it } from "vitest";

import { buildCustomLink, platformByKey, targetFromUrl } from "./platforms.ts";
import type { Amount } from "./types.ts";

const once: Amount = { value: 50, interval: "once" };
const monthly: Amount = { value: 10, interval: "month" };
const yearly: Amount = { value: 25, interval: "year" };

describe("Open Collective", () => {
  const oc = platformByKey("open_collective")!;

  it("pre-fills amount only for a one-time donation", () => {
    const link = oc.build("cashcn", once);
    expect(link.url).toContain("opencollective.com/cashcn/donate");
    expect(link.url).toContain("amount=50");
    expect(link.url).not.toContain("interval=");
    expect(link.prefilled).toEqual({ amount: true, recurrence: true });
  });

  it("adds interval=month / interval=year for recurring donations", () => {
    expect(oc.build("cashcn", monthly).url).toContain("interval=month");
    expect(oc.build("cashcn", yearly).url).toContain("interval=year");
  });
});

describe("GitHub Sponsors", () => {
  const gh = platformByKey("github")!;

  it("deep-links straight to a matched tier id", () => {
    const link = gh.build("franky47", monthly, {
      tierId: "12345",
      dollars: 10,
      via: "gh",
    });
    expect(link.url).toContain("/sponsors/franky47/sponsorships");
    expect(link.url).toContain("tier_id=12345");
    expect(link.note).toContain("12345");
    expect(link.prefilled).toEqual({ amount: true, recurrence: true });
  });

  it("falls back to a custom amount with the right frequency", () => {
    expect(gh.build("franky47", once).url).toContain("frequency=one-time");
    expect(gh.build("franky47", monthly).url).toContain("frequency=recurring");
    expect(gh.build("franky47", once).url).toContain("amount=50");
  });
});

describe("Liberapay", () => {
  const lp = platformByKey("liberapay")!;

  it("cannot pre-fill a one-time amount (recurring-only)", () => {
    const link = lp.build("user", once);
    expect(link.prefilled).toEqual({ amount: false, recurrence: false });
    expect(link.note).toMatch(/recurring-only/i);
  });

  it("pre-fills amount, period and currency for recurring donations", () => {
    const link = lp.build("user", monthly);
    expect(link.url).toContain("currency=USD");
    expect(link.url).toContain("period=monthly");
    expect(link.url).toContain("amount=10");
    expect(link.prefilled).toEqual({ amount: true, recurrence: true });
  });
});

describe("profile-only platforms", () => {
  it("opens the bare profile with no pre-fill", () => {
    const link = platformByKey("patreon")!.build("someone", monthly);
    expect(link.url).toBe("https://patreon.com/someone");
    expect(link.prefilled).toEqual({ amount: false, recurrence: false });
  });
});

describe("targetFromUrl", () => {
  it("maps a known host to its platform", () => {
    expect(targetFromUrl("https://opencollective.com/cashcn")).toMatchObject({
      platform: "open_collective",
      id: "cashcn",
    });
    expect(targetFromUrl("https://github.com/sponsors/franky47")).toMatchObject({
      platform: "github",
      id: "franky47",
    });
    expect(targetFromUrl("https://www.liberapay.com/user")).toMatchObject({
      platform: "liberapay",
      id: "user",
    });
  });

  it("keeps an unknown host as an openable custom link", () => {
    const target = targetFromUrl("https://example.com/donate");
    expect(target).toMatchObject({
      platform: "custom",
      customUrl: "https://example.com/donate",
    });
  });

  it("returns null for a non-URL string", () => {
    expect(targetFromUrl("not a url")).toBeNull();
  });
});

describe("buildCustomLink", () => {
  it("wraps a raw url with no pre-fill", () => {
    const link = buildCustomLink("https://example.com");
    expect(link.url).toBe("https://example.com");
    expect(link.prefilled).toEqual({ amount: false, recurrence: false });
  });
});
