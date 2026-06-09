import { spawn } from "node:child_process";

// Open a URL in the user's default browser, cross-platform.
export function openUrl(url: string): void {
  const [command, args]: [string, string[]] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];

  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", (error) => {
    console.error(`Could not open the browser (${error.message}). URL:\n  ${url}`);
  });
  child.unref();
}
