import { InvalidDestinationError } from "./errors.ts";
import type { Destination } from "./types.ts";

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

const SCHEME_ALIASES: Record<string, "github" | "npm" | "opencollective"> = {
  gh: "github",
  github: "github",
  npm: "npm",
  oc: "opencollective",
  opencollective: "opencollective",
};

export function parseDestination(token: string): Destination | InvalidDestinationError {
  if (!token) {
    return new InvalidDestinationError({
      reason: "Missing destination (e.g. `gh://franky47`, `47ng/nuqs`, `npm://nuqs`).",
    });
  }

  const schemeMatch = token.match(/^([a-z]+):\/\/(.+)$/i);
  if (schemeMatch) {
    const rawScheme = schemeMatch[1]!;
    const scheme = SCHEME_ALIASES[rawScheme.toLowerCase()];
    const rest = schemeMatch[2]!.replace(/^\/+|\/+$/g, "");
    if (!scheme) {
      return new InvalidDestinationError({
        reason: `Unknown scheme "${rawScheme}://". Supported: gh://, npm://, oc://.`,
      });
    }
    if (scheme === "opencollective") return { kind: "opencollective", slug: rest };
    if (scheme === "npm") return { kind: "npm", pkg: rest };
    return parseGithubPath(rest);
  }

  // No scheme: shorthand. A single `@scope/pkg` would be ambiguous, so scoped
  // packages must use the npm:// scheme; bare slugs/paths are treated as GitHub.
  return parseGithubPath(token);
}

// GitHub logins are alphanumeric + single hyphens; repo names also allow `.` and
// `_`. Validating here keeps junk out of the URLs and the `gh` arguments — e.g. a
// leading `@`, which `gh -F` would otherwise treat as a "read from file" prefix.
const LOGIN = /^[a-zA-Z0-9-]+$/;
const REPO = /^[a-zA-Z0-9._-]+$/;

function parseGithubPath(path: string): Destination | InvalidDestinationError {
  const parts = path.split("/").filter(Boolean);
  const invalid = (what: string) =>
    new InvalidDestinationError({
      reason: `Invalid GitHub ${what} in "${path}".`,
    });

  if (parts.length === 1) {
    const login = parts[0]!;
    if (!LOGIN.test(login)) return invalid("user");
    return { kind: "github-user", login };
  }
  if (parts.length === 2) {
    const owner = parts[0]!;
    const repo = parts[1]!;
    if (!LOGIN.test(owner)) return invalid("owner");
    if (!REPO.test(repo)) return invalid("repo");
    return { kind: "github-repo", owner, repo };
  }
  return new InvalidDestinationError({
    reason: `Cannot parse GitHub destination "${path}". Use <user> or <owner>/<repo>.`,
  });
}
