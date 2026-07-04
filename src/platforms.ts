import type { Amount, DeepLink, GithubTier, Target } from "./types.ts";

// Platform registry: how to map FUNDING.yml / npm funding entries to a target,
// how to deep-link each one, and how good that deep-link is (for ranking).
//
// Pre-fill capability per platform (from the cashcn research doc):
//   - OpenCollective: amount + interval (best)
//   - Liberapay:      amount + period, recurring only (no one-time)
//   - GitHub Sponsors: tier_id when an exact tier exists, else frequency +
//                      free-form `amount` on the /sponsorships checkout
//   - everything else: canonical profile URL only, no pre-fill

export interface Platform {
  key: string;
  label: string;
  /** Lower = preferred (better pre-fill). */
  rank: number;
  build: (id: string, amount: Amount, tier?: GithubTier | null) => DeepLink;
  /** Extract the platform id from a funding URL, if this platform owns it. */
  fromUrl?: (url: URL) => string | null;
}

const enc = encodeURIComponent;

export const PLATFORMS: Platform[] = [
  {
    key: "open_collective",
    label: "Open Collective",
    rank: 1,
    // The /donate flow defaults to one-time, so recurrence is always covered:
    // implicitly for `once`, via `interval=month|year` otherwise.
    build(slug, { value, interval }) {
      const params = new URLSearchParams();
      if (value !== null) params.set("amount", String(value));
      if (interval !== "once") params.set("interval", interval); // month | year
      const query = params.size > 0 ? `?${params}` : "";
      return {
        url: `https://opencollective.com/${enc(slug)}/donate${query}`,
        prefilled: { amount: value !== null, recurrence: true },
      };
    },
    fromUrl: (u) => segment(u, "opencollective.com", 1),
  },
  {
    key: "github",
    label: "GitHub Sponsors",
    rank: 3,
    // `tier` (optional) is a resolved match for the requested amount. When
    // present we deep-link straight into that tier. Without an amount we open
    // the public profile: /sponsorships is login-walled, while the profile
    // renders logged-out with the frequency tab pre-selected (GitHub's own
    // tab-switcher URLs) and carries it into checkout. Otherwise we pre-fill a
    // free-form `amount` on the /sponsorships checkout (works as long as the
    // maintainer has custom amounts enabled).
    build(login, { value, interval }, tier) {
      const frequency = interval === "once" ? "one-time" : "recurring";
      if (tier) {
        const params = new URLSearchParams({
          tier_id: tier.tierId,
          metadata_source: "cashcn",
        });
        return {
          url: `https://github.com/sponsors/${enc(login)}/sponsorships?${params}`,
          prefilled: { amount: true, recurrence: true },
          note: `Matched the $${tier.dollars} tier (#${tier.tierId}, via ${tier.via}).`,
        };
      }
      if (value === null) {
        const params = new URLSearchParams({
          frequency,
          metadata_source: "cashcn",
        });
        const yearly = interval === "year";
        return {
          url: `https://github.com/sponsors/${enc(login)}?${params}`,
          prefilled: { amount: false, recurrence: !yearly },
          note: yearly
            ? "GitHub Sponsors has no yearly option — the recurring (monthly) tab is pre-selected."
            : `Pick a tier on the Sponsors page — the ${frequency} tab is pre-selected.`,
        };
      }
      const params = new URLSearchParams({
        frequency,
        amount: String(value),
        metadata_source: "cashcn",
      });
      return {
        url: `https://github.com/sponsors/${enc(login)}/sponsorships?${params}`,
        prefilled: { amount: true, recurrence: true },
        note: `No exact tier — pre-filling a custom $${value} amount (needs custom amounts enabled).`,
      };
    },
    fromUrl: (u) =>
      u.hostname.endsWith("github.com") && u.pathname.startsWith("/sponsors/")
        ? (u.pathname.split("/").filter(Boolean)[1] ?? null)
        : null,
  },
  {
    key: "liberapay",
    label: "Liberapay",
    rank: 2,
    build(user, { value, interval }) {
      if (interval === "once") {
        return {
          url: `https://liberapay.com/${enc(user)}/donate`,
          prefilled: { amount: false, recurrence: false },
          note: "Liberapay is recurring-only — it cannot pre-fill a one-time donation.",
        };
      }
      const params = new URLSearchParams({
        period: interval === "year" ? "yearly" : "monthly",
      });
      if (value !== null) {
        params.set("currency", "USD"); // amount is ignored unless `currency` is set
        params.set("amount", String(value));
      }
      return {
        url: `https://liberapay.com/${enc(user)}/donate?${params}`,
        prefilled: { amount: value !== null, recurrence: true },
      };
    },
    fromUrl: (u) => segment(u, "liberapay.com", 1),
  },
  profileOnly("patreon", "Patreon", "patreon.com"),
  profileOnly("ko_fi", "Ko-fi", "ko-fi.com"),
  profileOnly("buy_me_a_coffee", "Buy Me a Coffee", "buymeacoffee.com"),
  profileOnly("polar", "Polar", "polar.sh"),
];

const BY_KEY = new Map(PLATFORMS.map((p) => [p.key, p]));

export function platformByKey(key: string): Platform | null {
  return BY_KEY.get(key) ?? null;
}

/** Map an arbitrary funding URL (npm `funding`, FUNDING.yml `custom:`) to a target. */
export function targetFromUrl(rawUrl: string): Target | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  for (const platform of PLATFORMS) {
    const id = platform.fromUrl?.(u);
    if (id) return { platform: platform.key, id, source: "url" };
  }
  // Unknown host: keep it as an openable custom link, no pre-fill.
  return { platform: "custom", id: rawUrl, source: "url", customUrl: rawUrl };
}

export function buildCustomLink(url: string): DeepLink {
  return {
    url,
    prefilled: { amount: false, recurrence: false },
    note: "Custom funding link — cashcn cannot pre-fill amount or recurrence here.",
  };
}

function profileOnly(key: string, label: string, host: string): Platform {
  return {
    key,
    label,
    rank: 9,
    build(id) {
      return {
        url: `https://${host}/${enc(id)}`,
        prefilled: { amount: false, recurrence: false },
        note: `${label} has no public pre-fill params — enter the amount on the page.`,
      };
    },
    fromUrl: (u) => segment(u, host, 1),
  };
}

// Pull the Nth path segment if the hostname matches (with/without www.).
function segment(u: URL, host: string, nth: number): string | null {
  const h = u.hostname.replace(/^www\./, "");
  if (h !== host) return null;
  return u.pathname.split("/").filter(Boolean)[nth - 1] ?? null;
}
