#!/usr/bin/env node
import { run } from "../src/cli.ts";

run(process.argv.slice(2))
  .then((code) => process.exit(code ?? 0))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`error: ${message}`);
    process.exit(1);
  });
