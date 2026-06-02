import { parseAmount } from './amount.js'
import { parseDestination } from './destination.js'
import { resolve } from './resolve.js'
import {
  buildCustomLink,
  platformByKey,
  PLATFORMS,
} from './platforms.js'
import { readFileSync } from 'node:fs'
import { openUrl } from './open-url.js'
import { lookupGithubTier } from './github-tiers.js'

// Read the version from package.json so `--version` never drifts from the
// published version.
const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
)

// All verbs are synonyms for the same action (open a funding deep-link). They
// exist purely so the command reads like a sentence. `cashcn pay …` ==
// `cashcn sponsor …`; recurrence comes from the amount suffix, not the verb.
const VERBS = new Set([
  'pay',
  'donate',
  'sponsor',
  'gift',
  'send',
  'tip',
  'back',
  'fund',
  'thank',
  'support',
])

const INTERVAL_LABEL = { once: 'one-time', month: 'monthly', year: 'yearly' }

export async function run(argv) {
  const { positionals, flags } = parseArgv(argv)

  if (flags.version) {
    console.log(`cashcn ${VERSION}`)
    return 0
  }
  if (flags.help || positionals.length === 0) {
    printHelp()
    return 0
  }

  const [verb, destinationToken, amountToken] = positionals
  if (!VERBS.has(verb)) {
    fail(`Unknown verb "${verb}". Try one of: ${[...VERBS].join(', ')}.`)
    return 1
  }
  if (!destinationToken || !amountToken) {
    fail('Usage: cashcn <verb> <destination> <amount>[/{m,y}]')
    return 1
  }

  let destination
  let amount
  try {
    destination = parseDestination(destinationToken)
    amount = parseAmount(amountToken)
  } catch (error) {
    fail(error.message)
    return 1
  }

  const { targets, notes } = await resolve(destination)
  for (const note of notes) console.error(dim(`note: ${note}`));

  if (targets.length === 0) {
    fail(`No funding destinations found for "${destinationToken}".`)
    return 1
  }

  const ranked = rankTargets(targets, amount)
  const chosen = ranked[0]
  const link = await linkFor(chosen, amount)

  printPlan({ verb, destinationToken, amount, ranked, chosen, link })

  if (flags.print || flags.dryRun) {
    console.log(`\n${link.url}`)
    return 0
  }

  console.log(`\nOpening ${bold(platformLabel(chosen.platform))} in your browser…`)
  openUrl(link.url)
  return 0
}

// When a project declares funding via FUNDING.yml, treat that as the
// maintainer's curated intent and prefer the two first-party platforms GitHub
// surfaces (GitHub Sponsors & Open Collective) over everything else, regardless
// of raw pre-fill capability. Outside that case we fall back to ranking purely
// by pre-fill quality (see PLATFORMS ranks).
const FUNDING_YML_PREFERRED = new Set(['github', 'open_collective'])

function rankTargets(targets, amount) {
  const fromFundingYml = targets.some((t) => t.source.includes('FUNDING.yml'))

  const rankOf = (t) => {
    const platform = platformByKey(t.platform)
    let score = platform ? platform.rank : 8
    // FUNDING.yml present → demote anything that isn't GH Sponsors / OC.
    if (fromFundingYml && !FUNDING_YML_PREFERRED.has(t.platform)) score += 100
    // Demote recurring-only platforms when a one-time payment was requested.
    if (amount.interval === 'once' && t.platform === 'liberapay') score += 10
    return score
  }
  return [...targets].sort((a, b) => rankOf(a) - rankOf(b))
}

async function linkFor(target, amount) {
  if (target.platform === 'custom') return buildCustomLink(target.customUrl ?? target.id)
  const platform = platformByKey(target.platform)
  if (!platform) return buildCustomLink(target.id)
  // GitHub has no free-form amount param, so try to resolve a matching tier_id
  // (gh CLI → public-page crawl → give up) before building the link.
  if (target.platform === 'github') {
    const tier = await lookupGithubTier(target.id, amount)
    return platform.build(target.id, amount, tier)
  }
  return platform.build(target.id, amount)
}

function platformLabel(key) {
  return platformByKey(key)?.label ?? key
}

function printPlan({ verb, destinationToken, amount, ranked, chosen, link }) {
  const money = `$${amount.value} ${INTERVAL_LABEL[amount.interval]}`
  console.log(`\n${bold(`${verb} ${money}`)} → ${destinationToken}`)

  console.log(`\nResolved ${ranked.length} funding destination(s):`)
  for (const target of ranked) {
    const marker = target === chosen ? green('▸') : ' '
    const id = target.platform === 'custom' ? target.customUrl ?? target.id : target.id
    console.log(`  ${marker} ${platformLabel(target.platform).padEnd(18)} ${dim(id)}  ${dim(`[${target.source}]`)}`)
  }

  console.log(`\nDeep-link (${bold(platformLabel(chosen.platform))}):`)
  console.log(`  ${link.url}`)
  console.log(
    `  pre-filled: amount ${check(link.prefilled.amount)}  ·  recurrence ${check(link.prefilled.recurrence)}`,
  )
  if (link.note) console.log(dim(`  ${link.note}`))
  console.log(dim('\n  cashcn never touches your money — it just opens the right checkout.'))
}

function parseArgv(argv) {
  const positionals = []
  const flags = {}
  for (const arg of argv) {
    switch (arg) {
      case '-h':
      case '--help':
        flags.help = true
        break
      case '-v':
      case '--version':
        flags.version = true
        break
      case '--print':
        flags.print = true
        break
      case '--dry-run':
        flags.dryRun = true
        break
      default:
        positionals.push(arg)
    }
  }
  return { positionals, flags }
}

function printHelp() {
  const platformList = PLATFORMS.map((p) => p.label).join(', ')
  console.log(`cashcn — open the right OSS funding checkout, pre-filled.

Usage:
  npx cashcn <verb> <destination> <amount>[/{m,y}]

Verbs (all synonyms):
  ${[...VERBS].join(', ')}

Destinations:
  gh://<user>            GitHub user        (e.g. gh://franky47)
  gh://<owner>/<repo>    GitHub repository  (reads .github/FUNDING.yml)
  npm://<pkg>            npm package        (reads its funding field)
  oc://<slug>            Open Collective    (e.g. oc://antfu)
  <user>                 shorthand for gh://<user>
  <owner>/<repo>         shorthand for gh://<owner>/<repo>

Amount:
  100      one-time $100   (no $ prefix — it triggers shell expansion)
  10/m     $10 monthly
  25/y     $25 yearly

Flags:
  --print, --dry-run   resolve + build the link but don't open the browser
  -h, --help           show this help
  -v, --version        show version

Examples:
  npx cashcn pay gh://franky47 100
  npx cashcn sponsor 47ng/nuqs 10/m
  npx cashcn donate oc://antfu 25/y
  npx cashcn tip npm://nuqs 5/m --print

Supported deep-link platforms: ${platformList}.
cashcn routes payments to hosted checkouts; it never custodies money.`)
}

// --- tiny tty helpers (no deps) ---
const useColor = process.stdout.isTTY && !process.env.NO_COLOR
const wrap = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s)
const bold = wrap('1')
const dim = wrap('2')
const green = wrap('32')
const check = (ok) => (ok ? green('yes') : dim('no'))

function fail(message) {
  console.error(`error: ${message}`)
}
