import { defineConfig } from "tsdown";

// Bundle the CLI entry (which carries the shebang) into a single executable
// dist/cashcn.js. No .d.ts: cashcn is a binary, not a library import.
export default defineConfig({
  entry: ["bin/cashcn.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  dts: false,
  // `type: module` makes a plain .js the ESM bin, which is the conventional
  // shape for a published CLI (matches package.json "bin").
  outExtensions: () => ({ js: ".js" }),
});
