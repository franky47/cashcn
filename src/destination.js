// Parse a destination token into a structured target.
//
// Explicit schemes:
//   gh://<user>            -> GitHub user (Sponsors)
//   gh://<owner>/<repo>    -> GitHub repository (read its FUNDING.yml)
//   github://...           -> alias of gh://
//   npm://<pkg>            -> npm package (read its `funding` field)
//   npm://@scope/<pkg>     -> scoped npm package
//   oc://<slug>            -> OpenCollective collective
//
// Shorthands (no scheme):
//   <slug>                 -> GitHub user
//   <owner>/<repo>         -> GitHub repository

const SCHEME_ALIASES = {
  gh: 'github',
  github: 'github',
  npm: 'npm',
  oc: 'opencollective',
  opencollective: 'opencollective',
}

/**
 * @param {string} token
 * @returns {
 *   | { kind: 'github-user', login: string }
 *   | { kind: 'github-repo', owner: string, repo: string }
 *   | { kind: 'opencollective', slug: string }
 *   | { kind: 'npm', pkg: string }
 * }
 */
export function parseDestination(token) {
  if (!token) {
    throw new Error('Missing destination (e.g. `gh://franky47`, `47ng/nuqs`, `npm://nuqs`).')
  }

  const schemeMatch = token.match(/^([a-z]+):\/\/(.+)$/i)
  if (schemeMatch) {
    const scheme = SCHEME_ALIASES[schemeMatch[1].toLowerCase()]
    const rest = schemeMatch[2].replace(/^\/+|\/+$/g, '')
    if (!scheme) {
      throw new Error(
        `Unknown scheme "${schemeMatch[1]}://". Supported: gh://, npm://, oc://.`,
      )
    }
    if (scheme === 'github') return parseGithubPath(rest)
    if (scheme === 'opencollective') return { kind: 'opencollective', slug: rest }
    if (scheme === 'npm') return { kind: 'npm', pkg: rest }
  }

  // No scheme: shorthand. A single `@scope/pkg` would be ambiguous, so scoped
  // packages must use the npm:// scheme; bare slugs/paths are treated as GitHub.
  return parseGithubPath(token)
}

function parseGithubPath(path) {
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 1) {
    return { kind: 'github-user', login: parts[0] }
  }
  if (parts.length === 2) {
    return { kind: 'github-repo', owner: parts[0], repo: parts[1] }
  }
  throw new Error(
    `Cannot parse GitHub destination "${path}". Use <user> or <owner>/<repo>.`,
  )
}
