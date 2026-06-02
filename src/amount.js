// Parse the amount token: `100`, `10/m`, `25/y`, `10/month`, `5/yr`.
// The leading `$` is intentionally dropped by the user to dodge shell expansion,
// but we tolerate it (and a leading currency word) if it sneaks through quoting.

const INTERVAL_ALIASES = {
  m: 'month',
  mo: 'month',
  month: 'month',
  monthly: 'month',
  y: 'year',
  yr: 'year',
  year: 'year',
  yearly: 'year',
}

/**
 * @param {string} token
 * @returns {{ value: number, interval: 'once' | 'month' | 'year' }}
 */
export function parseAmount(token) {
  if (!token) {
    throw new Error('Missing amount (e.g. `100`, `10/m`, `25/y`).')
  }
  const cleaned = token.trim().replace(/^\$/, '')
  const match = cleaned.match(/^(\d+(?:\.\d+)?)(?:\/([a-z]+))?$/i)
  if (!match) {
    throw new Error(
      `Invalid amount "${token}". Use a number, optionally suffixed with /m or /y (e.g. 10/m).`,
    )
  }
  const value = Number(match[1])
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Amount must be a positive number, got "${token}".`)
  }
  let interval = 'once'
  if (match[2]) {
    const resolved = INTERVAL_ALIASES[match[2].toLowerCase()]
    if (!resolved) {
      throw new Error(
        `Unknown recurrence "/${match[2]}". Use /m (monthly) or /y (yearly).`,
      )
    }
    interval = resolved
  }
  return { value, interval }
}
