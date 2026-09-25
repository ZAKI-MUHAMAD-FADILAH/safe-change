#!/usr/bin/env node
// ---------------------------------------------------------------------------
// safe-change -- CLI entry point
// ---------------------------------------------------------------------------


import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { OutputFormat } from "./types/index.js";
import { ExitCodes } from "./types/index.js";
import { runSave } from "./commands/save.js";
import { runCheck } from "./commands/check.js";
import { runDiff } from "./commands/diff.js";

// -- Version -----------------------------------------------------------------

function getVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(
      readFileSync(join(__dirname, "..", "package.json"), "utf-8")
    ) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

// -- Argument parsing --------------------------------------------------------

interface ParsedArgs {
  command: string | null;
  positional: string[];
  flags: {
    json: boolean;
    help: boolean;
    version: boolean;
    verbose: boolean;
  };
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // skip node and script path
  const result: ParsedArgs = {
    command: null,
    positional: [],
    flags: {
      json: false,
      help: false,
      version: false,
      verbose: false,
    },
  };

  for (const arg of args) {
    if (arg === "--json") {
      result.flags.json = true;
    } else if (arg === "--help" || arg === "-h") {
      result.flags.help = true;
    } else if (arg === "--version" || arg === "-v") {
      result.flags.version = true;
    } else if (arg === "--verbose") {
      result.flags.verbose = true;
    } else if (arg.startsWith("-")) {
      process.stderr.write(`Unknown flag: ${arg}\n`);
      process.stderr.write('Run "safe-change --help" for usage.\n');
      process.exit(ExitCodes.CONFIG_ERROR);
    } else if (result.command === null) {
      result.command = arg;
    } else {
      result.positional.push(arg);
    }
  }

  return result;
}

// -- Help text ---------------------------------------------------------------

const HELP_TEXT = `
safe-change -- A safety net for AI-assisted coding.

Usage:
  safe-change save [description]   Record a baseline of the repository and verification results.
  safe-change check                Compare current state against the baseline.
  safe-change diff                 Show a summary of changes since the baseline.

Options:
  --json       Output in JSON format.
  --help, -h   Show this help message.
  --version    Show version.
  --verbose    Show additional detail.

Exit codes:
  0  No new regressions detected.
  1  At least one previously passing check now fails.
  2  No baseline found or baseline is corrupt.
  3  Configuration error.
  4  Not a Git repository.
  5  Internal error.

Configuration:
  Create a .safe-change.json file in your project root:

  {
    "version": 1,
    "checks": [
      { "name": "build", "executable": "npm", "args": ["run", "build"], "timeout": 60 },
      { "name": "test", "executable": "npx", "args": ["vitest", "run"], "timeout": 120 }
    ]
  }

Documentation: https://github.com/ZAKI-MUHAMAD-FADILAH/safe-change
`;

// -- Main --------------------------------------------------------------------

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);
  const format: OutputFormat = parsed.flags.json ? "json" : "terminal";

  if (parsed.flags.version) {
    process.stdout.write(`safe-change ${getVersion()}\n`);
    process.exit(ExitCodes.OK);
  }

  if (parsed.flags.help || parsed.command === null) {
    process.stdout.write(HELP_TEXT);
    process.exit(ExitCodes.OK);
  }

  let exitCode: number;

  switch (parsed.command) {
    case "save": {
      const description = parsed.positional.join(" ") || "unnamed baseline";
      exitCode = await runSave({ description, format });
      break;
    }

    case "check": {
      exitCode = await runCheck({ format });
      break;
    }

    case "diff": {
      exitCode = await runDiff({ format });
      break;
    }

    default:
      process.stderr.write(`Unknown command: ${parsed.command}\n`);
      process.stderr.write('Run "safe-change --help" for usage.\n');
      exitCode = ExitCodes.CONFIG_ERROR;
  }

  process.exit(exitCode);
}

main().catch((err: unknown) => {
  process.stderr.write(
    `Internal error: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(ExitCodes.INTERNAL_ERROR);
});
