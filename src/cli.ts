import { readFileSync } from "node:fs";

import { parseAmount } from "./amount.ts";
import { parseDestination } from "./destination.ts";
import { NoFundingTargetsError, UnknownVerbError, UsageError } from "./errors.ts";
import { httpFundingSource } from "./funding/http-source.ts";
import { resolveTargets } from "./funding/resolve.ts";
import type { FundingSource } from "./funding/source.ts";
import { resolveSponsorTier } from "./funding/tiers.ts";
import { openUrl } from "./open-url.ts";
import { buildCustomLink, PLATFORMS, platformByKey, type Platform } from "./platforms.ts";
import { rankTargets } from "./ranking.ts";
import type { Amount, DeepLink, Interval, Target } from "./types.ts";

// Read the version from package.json so `--version` never drifts.
const { version: VERSION } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

// All verbs are synonyms for the same action (open a funding deep-link). They
// exist purely so the command reads like a sentence; recurrence comes from the
// amount suffix, not the verb.
const VERBS = new Set([
  "pay",
  "donate",
  "sponsor",
  "gift",
  "send",
  "tip",
  "back",
  "fund",
  "thank",
  "support",
]);

const INTERVAL_LABEL: Record<Interval, string> = {
  once: "one-time",
  month: "monthly",
  year: "yearly",
};

// Injectable seams so the whole pipeline is testable without touching the
// network or spawning a browser.
export interface RunDeps {
  source: FundingSource;
  open: (url: string) => void;
  log: (message: string) => void;
  errorLog: (message: string) => void;
}

const defaultDeps: RunDeps = {
  source: httpFundingSource,
  open: openUrl,
  log: (m) => console.log(m),
  errorLog: (m) => console.error(m),
};

export async function run(argv: string[], deps: Partial<RunDeps> = {}): Promise<number> {
  const { source, open, log, errorLog } = { ...defaultDeps, ...deps };
  const fail = (message: string) => errorLog(`error: ${message}`);

  const { positionals, flags } = parseArgv(argv);

  if (flags.version) {
    log(`cashcn ${VERSION}`);
    return 0;
  }
  if (flags.help || positionals.length === 0) {
    log(helpText());
    return 0;
  }

  const [verb, destinationToken, amountToken] = positionals;
  if (!verb || !VERBS.has(verb)) {
    fail(new UnknownVerbError({ verb: verb ?? "", verbs: [...VERBS].join(", ") }).message);
    return 1;
  }
  if (!destinationToken || !amountToken) {
    fail(
      new UsageError({
        reason: "Usage: cashcn <verb> <destination> <amount>[/{m,y}]",
      }).message,
    );
    return 1;
  }

  const destination = parseDestination(destinationToken);
  if (destination instanceof Error) {
    fail(destination.message);
    return 1;
  }
  const amount = parseAmount(amountToken);
  if (amount instanceof Error) {
    fail(amount.message);
    return 1;
  }

  const { targets, notes } = await resolveTargets(destination, source);
  for (const note of notes) errorLog(dim(`note: ${note}`));
  if (targets.length === 0) {
    fail(new NoFundingTargetsError({ destination: destinationToken }).message);
    return 1;
  }

  const ranked = rankTargets(targets, amount);
  const chosen = ranked[0]!;
  const link = await buildLink(chosen, amount, source);

  printPlan({ verb, destinationToken, amount, ranked, chosen, link, log });

  if (flags.print || flags.dryRun) {
    log(`\n${link.url}`);
    return 0;
  }

  log(`\nOpening ${bold(labelOf(chosen.platform))} in your browser…`);
  open(link.url);
  return 0;
}

async function buildLink(target: Target, amount: Amount, source: FundingSource): Promise<DeepLink> {
  if (target.platform === "custom") {
    return buildCustomLink(target.customUrl ?? target.id);
  }
  const platform: Platform | null = platformByKey(target.platform);
  if (!platform) return buildCustomLink(target.id);
  // GitHub has no free-form amount param, so try to resolve a matching tier_id
  // (gh CLI → public-page crawl → give up) before building the link.
  if (target.platform === "github") {
    const tier = await resolveSponsorTier(source, target.id, amount);
    return platform.build(target.id, amount, tier);
  }
  return platform.build(target.id, amount);
}

function labelOf(key: string): string {
  return platformByKey(key)?.label ?? key;
}

interface PlanView {
  verb: string;
  destinationToken: string;
  amount: Amount;
  ranked: Target[];
  chosen: Target;
  link: DeepLink;
  log: (message: string) => void;
}

function printPlan({ verb, destinationToken, amount, ranked, chosen, link, log }: PlanView): void {
  const money = `$${amount.value} ${INTERVAL_LABEL[amount.interval]}`;
  log(`\n${bold(`${verb} ${money}`)} → ${destinationToken}`);

  log(`\nResolved ${ranked.length} funding destination(s):`);
  for (const target of ranked) {
    const marker = target === chosen ? green("▸") : " ";
    const id = target.platform === "custom" ? (target.customUrl ?? target.id) : target.id;
    log(
      `  ${marker} ${labelOf(target.platform).padEnd(18)} ${dim(id)}  ${dim(`[${target.source}]`)}`,
    );
  }

  log(`\nDeep-link (${bold(labelOf(chosen.platform))}):`);
  log(`  ${link.url}`);
  log(
    `  pre-filled: amount ${check(link.prefilled.amount)}  ·  recurrence ${check(link.prefilled.recurrence)}`,
  );
  if (link.note) log(dim(`  ${link.note}`));
  log(dim("\n  cashcn never touches your money — it just opens the right checkout."));
}

interface ParsedArgv {
  positionals: string[];
  flags: { help?: boolean; version?: boolean; print?: boolean; dryRun?: boolean };
}

function parseArgv(argv: string[]): ParsedArgv {
  const positionals: string[] = [];
  const flags: ParsedArgv["flags"] = {};
  for (const arg of argv) {
    switch (arg) {
      case "-h":
      case "--help":
        flags.help = true;
        break;
      case "-v":
      case "--version":
        flags.version = true;
        break;
      case "--print":
        flags.print = true;
        break;
      case "--dry-run":
        flags.dryRun = true;
        break;
      default:
        positionals.push(arg);
    }
  }
  return { positionals, flags };
}

function helpText(): string {
  const platformList = PLATFORMS.map((p) => p.label).join(", ");
  return `cashcn — open the right OSS funding checkout, pre-filled.

Usage:
  npx cashcn <verb> <destination> <amount>[/{m,y}]

Verbs (all synonyms):
  ${[...VERBS].join(", ")}

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
cashcn routes payments to hosted checkouts; it never custodies money.`;
}

// --- tiny tty helpers (no deps) ---
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code: string) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = wrap("1");
const dim = wrap("2");
const green = wrap("32");
const check = (ok: boolean) => (ok ? green("yes") : dim("no"));
