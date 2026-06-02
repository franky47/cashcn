// Minimal parser for `.github/FUNDING.yml`. This is NOT a general YAML parser —
// FUNDING.yml has a flat, well-known shape (`key: scalar` or `key: [a, b]`),
// which is all we handle. Anything fancier should swap in a real YAML library.
//
// Spec: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository

/**
 * @param {string} text raw FUNDING.yml contents
 * @returns {Record<string, string | string[]>}
 */
export function parseFundingYml(text) {
  /** @type {Record<string, string | string[]>} */
  const out = {}
  for (const rawLine of text.split('\n')) {
    const line = stripComment(rawLine).trim()
    if (!line) continue

    const colon = line.indexOf(':')
    if (colon === -1) continue

    const key = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()
    if (!key) continue

    out[key] = value.startsWith('[') ? parseInlineArray(value) : unquote(value)
  }
  return out
}

function stripComment(line) {
  // Drop `#` comments, but not `#` inside a quoted string (URLs rarely need it,
  // but custom URLs with anchors do — so only strip unquoted hashes).
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === "'" && !inDouble) inSingle = !inSingle
    else if (ch === '"' && !inSingle) inDouble = !inDouble
    else if (ch === '#' && !inSingle && !inDouble) return line.slice(0, i)
  }
  return line
}

function parseInlineArray(value) {
  const inner = value.replace(/^\[/, '').replace(/\]$/, '')
  return inner
    .split(',')
    .map((item) => unquote(item.trim()))
    .filter(Boolean)
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}
