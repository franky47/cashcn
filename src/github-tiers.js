import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

// execFile (not exec): no shell is spawned, so `login` is passed as a discrete
// argv entry and shell metacharacters can't be interpreted — no injection risk.
const execFileAsync = promisify(execFile)

// Resolve a GitHub Sponsors tier whose price exactly matches the requested
// amount, so we can deep-link straight into that tier's checkout via
// `?tier_id=<n>` (GitHub has no free-form amount query param).
//
// Strategy, in order (per request):
//   1. `gh api graphql`  — authoritative, lists every tier with its node id.
//   2. crawl public HTML — token-free fallback; scrapes `tier_id` ↔ price.
//   3. give up           — caller falls back to `?frequency=` with no tier.
//
// GitHub Sponsors recurring tiers are monthly-only; there is no yearly tier,
// so we only attempt a tier match for one-time and monthly requests.
//
// @param {string} login
// @param {{ value: number, interval: 'once'|'month'|'year' }} amount
// @returns {Promise<{ tierId: string, dollars: number, via: 'gh'|'crawl' } | null>}
export async function lookupGithubTier(login, amount) {
  if (amount.interval === 'year') return null
  const wantOneTime = amount.interval === 'once'

  let tiers = await tiersViaGh(login)
  let via = 'gh'
  if (!tiers) {
    tiers = await tiersViaCrawl(login, wantOneTime)
    via = 'crawl'
  }
  if (!tiers) return null

  const match = tiers.find(
    (t) => t.isOneTime === wantOneTime && t.dollars === amount.value,
  )
  return match ? { tierId: match.tierId, dollars: match.dollars, via } : null
}

// --- 1. gh CLI / GraphQL ---

async function tiersViaGh(login) {
  // A single query can't ask for both user and organization (a miss errors out),
  // so try user first, then organization.
  for (const root of ['user', 'organization']) {
    const tiers = await ghTiersForRoot(root, login)
    if (tiers && tiers.length) return tiers
  }
  return null
}

async function ghTiersForRoot(root, login) {
  const query = `query($login:String!){ ${root}(login:$login){ sponsorsListing { tiers(first:100){ nodes { monthlyPriceInDollars isOneTime id } } } } }`
  try {
    const { stdout } = await execFileAsync(
      'gh',
      ['api', 'graphql', '-f', `query=${query}`, '-F', `login=${login}`],
      { timeout: 8000 },
    )
    const nodes = JSON.parse(stdout)?.data?.[root]?.sponsorsListing?.tiers?.nodes
    if (!Array.isArray(nodes)) return null
    return nodes
      .map((n) => ({
        dollars: n.monthlyPriceInDollars,
        isOneTime: Boolean(n.isOneTime),
        tierId: numericTierId(n.id),
      }))
      .filter((t) => t.tierId)
  } catch {
    // gh missing, unauthenticated, network error, or login not found → fall through.
    return null
  }
}

// Sponsors tier node ids are base64 of `012:SponsorsTier<n>`; the URL wants <n>.
function numericTierId(nodeId) {
  if (typeof nodeId !== 'string') return null
  let decoded
  try {
    decoded = Buffer.from(nodeId, 'base64').toString('utf8')
  } catch {
    return null
  }
  return decoded.match(/SponsorsTier(\d+)/)?.[1] ?? null
}

// --- 2. public HTML crawl ---

async function tiersViaCrawl(login, wantOneTime) {
  const url = `https://github.com/sponsors/${encodeURIComponent(login)}${
    wantOneTime ? '?frequency=one-time' : ''
  }`
  let html
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    html = await res.text()
  } catch {
    return null
  }

  // Walk price headers ($N a month / $N one time) and tier links in document
  // order, pairing each tier_id with the nearest preceding price header.
  const token = /\$([0-9,]+)\s*(?:a month|one time)|tier_id%3D(\d+)/g
  const tiers = []
  let lastDollars = null
  let m
  while ((m = token.exec(html))) {
    if (m[1] != null) {
      lastDollars = Number(m[1].replace(/,/g, ''))
    } else if (m[2] != null && lastDollars != null) {
      tiers.push({ dollars: lastDollars, isOneTime: wantOneTime, tierId: m[2] })
    }
  }
  return tiers.length ? tiers : null
}
