// Platform registry: how to map FUNDING.yml / npm funding entries to a target,
// how to deep-link each one, and how good that deep-link is (for ranking).
//
// Pre-fill capability per platform is taken from the cashcn research doc:
//   - OpenCollective: amount + interval (best)
//   - Liberapay:      amount + period, recurring only (no one-time)
//   - GitHub Sponsors: tier_id when an exact tier exists, else frequency +
//                      free-form `amount` on the /sponsorships checkout
//   - everything else: canonical profile URL only, no pre-fill

/**
 * @typedef {{ value: number, interval: 'once' | 'month' | 'year' }} Amount
 * @typedef {{
 *   url: string,
 *   prefilled: { amount: boolean, recurrence: boolean },
 *   note?: string,
 * }} DeepLink
 * @typedef {{
 *   key: string,
 *   label: string,
 *   rank: number,            // lower = preferred (better pre-fill)
 *   build: (id: string, amount: Amount) => DeepLink,
 *   fromUrl?: (url: URL) => string | null, // extract id from a funding URL
 * }} Platform
 */

const enc = encodeURIComponent

/** @type {Platform[]} */
export const PLATFORMS = [
  {
    key: 'open_collective',
    label: 'Open Collective',
    rank: 1,
    build(slug, { value, interval }) {
      const params = new URLSearchParams({ amount: String(value) })
      if (interval !== 'once') params.set('interval', interval) // month | year
      return {
        url: `https://opencollective.com/${enc(slug)}/donate?${params}`,
        prefilled: { amount: true, recurrence: true },
      }
    },
    fromUrl: (u) => match(u, 'opencollective.com', 1),
  },
  {
    key: 'github',
    label: 'GitHub Sponsors',
    rank: 3,
    // `tier` (optional) is a resolved {tierId, dollars, via} match for the
    // requested amount. When present we deep-link straight into that tier (so
    // the sponsor lands on its reward tier). Otherwise we pre-fill a custom
    // `amount` on the /sponsorships checkout — GitHub accepts a free-form amount
    // there, as long as the maintainer has custom amounts enabled.
    build(login, { value, interval }, tier) {
      const frequency = interval === 'once' ? 'one-time' : 'recurring'
      if (tier) {
        const params = new URLSearchParams({
          tier_id: tier.tierId,
          metadata_source: 'cashcn',
        })
        return {
          url: `https://github.com/sponsors/${enc(login)}/sponsorships?${params}`,
          prefilled: { amount: true, recurrence: true },
          note: `Matched the $${tier.dollars} tier (#${tier.tierId}, via ${tier.via}).`,
        }
      }
      const params = new URLSearchParams({
        frequency,
        amount: String(value),
        metadata_source: 'cashcn',
      })
      return {
        url: `https://github.com/sponsors/${enc(login)}/sponsorships?${params}`,
        prefilled: { amount: true, recurrence: true },
        note: `No exact tier — pre-filling a custom $${value} amount (needs custom amounts enabled).`,
      }
    },
    // github.com/sponsors/<login>
    fromUrl: (u) =>
      u.hostname.endsWith('github.com') && u.pathname.startsWith('/sponsors/')
        ? u.pathname.split('/').filter(Boolean)[1] ?? null
        : null,
  },
  {
    key: 'liberapay',
    label: 'Liberapay',
    rank: 2,
    build(user, { value, interval }) {
      if (interval === 'once') {
        return {
          url: `https://liberapay.com/${enc(user)}/donate`,
          prefilled: { amount: false, recurrence: false },
          note: 'Liberapay is recurring-only — it cannot pre-fill a one-time amount.',
        }
      }
      const params = new URLSearchParams({
        currency: 'USD',
        period: interval === 'year' ? 'yearly' : 'monthly',
        amount: String(value), // ignored by Liberapay unless `currency` is set
      })
      return {
        url: `https://liberapay.com/${enc(user)}/donate?${params}`,
        prefilled: { amount: true, recurrence: true },
      }
    },
    fromUrl: (u) => match(u, 'liberapay.com', 1),
  },
  profileOnly('patreon', 'Patreon', 'patreon.com'),
  profileOnly('ko_fi', 'Ko-fi', 'ko-fi.com'),
  profileOnly('buy_me_a_coffee', 'Buy Me a Coffee', 'buymeacoffee.com'),
  profileOnly('polar', 'Polar', 'polar.sh'),
]

const BY_KEY = new Map(PLATFORMS.map((p) => [p.key, p]))

export function platformByKey(key) {
  return BY_KEY.get(key) ?? null
}

/** Map an arbitrary funding URL (npm `funding`, FUNDING.yml `custom:`) to a target. */
export function targetFromUrl(rawUrl) {
  let u
  try {
    u = new URL(rawUrl)
  } catch {
    return null
  }
  for (const platform of PLATFORMS) {
    const id = platform.fromUrl?.(u)
    if (id) return { platform: platform.key, id, source: 'url' }
  }
  // Unknown host: keep it as an openable custom link, no pre-fill.
  return { platform: 'custom', id: rawUrl, source: 'url', customUrl: rawUrl }
}

export function buildCustomLink(url) {
  return {
    url,
    prefilled: { amount: false, recurrence: false },
    note: 'Custom funding link — cashcn cannot pre-fill amount or recurrence here.',
  }
}

function profileOnly(key, label, host) {
  return {
    key,
    label,
    rank: 9,
    build(id) {
      return {
        url: `https://${host}/${enc(id)}`,
        prefilled: { amount: false, recurrence: false },
        note: `${label} has no public pre-fill params — enter the amount on the page.`,
      }
    },
    fromUrl: (u) => match(u, host, 1),
  }
}

// Pull the Nth path segment if the hostname matches (with/without www.).
function match(u, host, segment) {
  const h = u.hostname.replace(/^www\./, '')
  if (h !== host) return null
  const seg = u.pathname.split('/').filter(Boolean)[segment - 1]
  return seg ?? null
}
