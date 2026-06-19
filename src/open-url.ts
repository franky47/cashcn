import { spawn } from "node:child_process";

// cmd.exe treats & | < > ( ) ^ as control operators, even inside the argument we
// hand to `start`. Our funding URLs carry several `&` query separators (e.g.
// `?frequency=one-time&amount=100&metadata_source=cashcn`), so without escaping
// cmd splits the line at the first `&` and `start` only ever sees the truncated
// `…?frequency=one-time` — which 404s. Prefix each operator with `^` so cmd
// passes it through literally. (Node leaves the arg unquoted since it has no
// spaces, so the `^` escapes reach cmd intact.)
function escapeForCmd(url: string): string {
  return url.replace(/[&|<>^()]/g, (char) => `^${char}`);
}

// Resolve the [command, args] to open a URL in the default browser for a given
// platform. Pure and exported so the platform-specific escaping is unit-testable
// without actually spawning a process.
export function resolveOpenCommand(platform: NodeJS.Platform, url: string): [string, string[]] {
  if (platform === "darwin") return ["open", [url]];
  if (platform === "win32") return ["cmd", ["/c", "start", "", escapeForCmd(url)]];
  return ["xdg-open", [url]];
}

// Open a URL in the user's default browser, cross-platform.
export function openUrl(url: string): void {
  const [command, args] = resolveOpenCommand(process.platform, url);

  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", (error) => {
    console.error(`Could not open the browser (${error.message}). URL:\n  ${url}`);
  });
  child.unref();
}
