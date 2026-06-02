// Resolve a parsed destination into a deduplicated list of funding targets.
//
// Sources, in rough priority order (per the cashcn research doc):
//   1. npm registry `funding` field            (for npm packages)
//   2. .github/FUNDING.yml                      (for GitHub repos / user profile repo)
//   3. GitHub Sponsors directly                 (for a bare GitHub user)
// ecosyste.ms would be the aggregator backstop; left out of this POC.

import { parseFundingYml } from './funding-yml.js'
import { targetFromUrl } from './platforms.js'

const FUNDING_KEYS = new Set([
  'github',
  'open_collective',
  'liberapay',
  'patreon',
  'ko_fi',
  'buy_me_a_coffee',
  'polar',
])

/**
 * @returns {Promise<{ targets: Array<{platform: string, id: string, source: string, customUrl?: string}>, notes: string[] }>}
 */
export async function resolve(destination) {
  const notes = []
  /** @type {Map<string, any>} */
  const targets = new Map()
  const add = (t) => {
    if (!t) return
    const dedupeKey = `${t.platform}:${t.id}`
    if (!targets.has(dedupeKey)) targets.set(dedupeKey, t)
  }

  switch (destination.kind) {
    case 'opencollective':
      add({ platform: 'open_collective', id: destination.slug, source: 'oc://' })
      break

    case 'github-user': {
      add({ platform: 'github', id: destination.login, source: 'gh:// handle' })
      // Enrich from the user's profile repo (<login>/.github), best-effort.
      const yml = await fetchFundingYml(destination.login, '.github', notes, {
        silent: true,
      })
      if (yml) fundingYmlToTargets(yml, 'FUNDING.yml').forEach(add)
      break
    }

    case 'github-repo': {
      const yml = await fetchFundingYml(destination.owner, destination.repo, notes)
      if (yml) {
        fundingYmlToTargets(yml, 'FUNDING.yml').forEach(add)
      } else {
        notes.push(
          `No FUNDING.yml found for ${destination.owner}/${destination.repo} — falling back to the repo owner's GitHub Sponsors.`,
        )
        add({ platform: 'github', id: destination.owner, source: 'repo owner' })
      }
      break
    }

    case 'npm': {
      const meta = await fetchNpmFunding(destination.pkg, notes)
      if (meta) {
        for (const url of meta.fundingUrls) add(targetFromUrl(url))
        // If the package points at a GitHub repo, union its FUNDING.yml too.
        if (meta.repo) {
          const yml = await fetchFundingYml(meta.repo.owner, meta.repo.repo, notes, {
            silent: true,
          })
          if (yml) fundingYmlToTargets(yml, 'FUNDING.yml (via repo)').forEach(add)
        }
      }
      break
    }
  }

  return { targets: [...targets.values()], notes }
}

function fundingYmlToTargets(yml, source) {
  const out = []
  for (const [key, value] of Object.entries(yml)) {
    const values = Array.isArray(value) ? value : [value]
    if (FUNDING_KEYS.has(key)) {
      for (const id of values) if (id) out.push({ platform: key, id, source })
    } else if (key === 'custom') {
      for (const url of values) {
        const target = targetFromUrl(url)
        if (target) out.push({ ...target, source })
      }
    }
    // Other keys (tidelift, thanks_dev, community_bridge, …) are intentionally
    // skipped in this POC — they don't deep-link to a per-amount checkout.
  }
  return out
}

async function fetchFundingYml(owner, repo, notes, { silent = false } = {}) {
  for (const ref of ['HEAD', 'main', 'master']) {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/.github/FUNDING.yml`
    try {
      const res = await fetch(url)
      if (res.ok) return parseFundingYml(await res.text())
    } catch (error) {
      if (!silent) notes.push(`Could not fetch FUNDING.yml (${ref}): ${error.message}`)
      return null
    }
  }
  return null
}

async function fetchNpmFunding(pkg, notes) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(pkg).replace('%40', '@')}/latest`
  let data
  try {
    const res = await fetch(url)
    if (!res.ok) {
      notes.push(`npm registry returned ${res.status} for "${pkg}".`)
      return null
    }
    data = await res.json()
  } catch (error) {
    notes.push(`Could not reach the npm registry: ${error.message}`)
    return null
  }

  const fundingUrls = normalizeFunding(data.funding)
  if (fundingUrls.length === 0) {
    notes.push(`"${pkg}" has no \`funding\` field; trying its source repository.`)
  }
  return { fundingUrls, repo: extractGithubRepo(data.repository) }
}

// npm `funding` is a string, { type, url }, or an array of either.
function normalizeFunding(funding) {
  if (!funding) return []
  const list = Array.isArray(funding) ? funding : [funding]
  return list
    .map((entry) => (typeof entry === 'string' ? entry : entry?.url))
    .filter(Boolean)
}

function extractGithubRepo(repository) {
  const url = typeof repository === 'string' ? repository : repository?.url
  if (!url) return null
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/i)
  return match ? { owner: match[1], repo: match[2] } : null
}
