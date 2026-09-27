#!/usr/bin/env node
// ---------------------------------------------------------------------------
// safe-change -- CLI entry point
// ---------------------------------------------------------------------------


import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { OutputFormat } from "./types/index.js";
import { ExitCodes } from "./types/index.js";
import type { InstallerScope } from "./installer/core/path-safety.js";
import { runSave } from "./commands/save.js";
import { runCheck } from "./commands/check.js";
import { runDiff } from "./commands/diff.js";
import { runInstall } from "./installer/commands/install.js";
import { runUpdate } from "./installer/commands/update.js";
import { runUninstall } from "./installer/commands/uninstall.js";
import { runStatus } from "./installer/commands/status.js";

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
  scope: InstallerScope;
  flags: {
    json: boolean;
    help: boolean;
    version: boolean;
    verbose: boolean;
    overwrite: boolean;
    dryRun: boolean;
    nonInteractive: boolean;
  };
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // skip node and script path
  const result: ParsedArgs = {
    command: null,
    positional: [],
    scope: "project",
    flags: {
      json: false,
      help: false,
      version: false,
      verbose: false,
      overwrite: false,
      dryRun: false,
      nonInteractive: false,
    },
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) {
      continue;
    }

    if (arg === "--json") {
      result.flags.json = true;
    } else if (arg === "--help" || arg === "-h") {
      result.flags.help = true;
    } else if (arg === "--version" || arg === "-v") {
      result.flags.version = true;
    } else if (arg === "--verbose") {
      result.flags.verbose = true;
    } else if (arg === "--overwrite") {
      result.flags.overwrite = true;
    } else if (arg === "--dry-run") {
      result.flags.dryRun = true;
    } else if (
      arg === "--non-interactive" ||
      arg === "-y" ||
      arg === "--yes"
    ) {
      result.flags.nonInteractive = true;
    } else if (arg === "--global" || arg === "-g") {
      result.scope = "global";
    } else if (arg === "--project" || arg === "-p") {
      result.scope = "project";
    } else if (arg === "--scope") {
      const nextArg = args[i + 1];
      if (nextArg !== undefined && !nextArg.startsWith("-")) {
        i++;
        const nextVal = nextArg.toLowerCase();
        if (nextVal === "global" || nextVal === "project") {
          result.scope = nextVal;
        } else {
          process.stderr.write(`Unknown scope: ${nextArg}\n`);
          process.stderr.write('Valid scopes are "project" or "global".\n');
          process.exit(ExitCodes.CONFIG_ERROR);
        }
      } else {
        process.stderr.write(
          "Option --scope requires an argument (project or global).\n"
        );
        process.exit(ExitCodes.CONFIG_ERROR);
      }
    } else if (arg.startsWith("--scope=")) {
      const nextVal = arg.slice("--scope=".length).toLowerCase();
      if (nextVal === "global" || nextVal === "project") {
        result.scope = nextVal;
      } else {
        process.stderr.write(`Unknown scope: ${nextVal}\n`);
        process.stderr.write('Valid scopes are "project" or "global".\n');
        process.exit(ExitCodes.CONFIG_ERROR);
      }
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
  safe-change install <agent|all>  Install agent skill (or 'all' for all detected/supported agents).
  safe-change update <agent|all>   Update agent skill with latest canonical version.
  safe-change uninstall <agent|all> Remove agent skill from target directory.
  safe-change status [agent]       Show installation, auto-detection, and drift status.
  safe-change mcp                  Start MCP server (stdio transport).

Supported agents:
  all             Install for all detected agents
  antigravity     Google Antigravity (filesystem-validated)
  claude-code     Anthropic Claude Code (filesystem-validated)
  cursor          Cursor by Anysphere (filesystem-validated)
  codex           OpenAI Codex (filesystem-validated)
  cline           Cline (filesystem-validated)
  kimi-code       Kimi Code by Moonshot AI (filesystem-validated)
  amp             Amp by Sourcegraph (filesystem-validated)
  opencode        OpenCode (filesystem-validated)
  gemini-cli      Google Gemini CLI (filesystem-validated)
  github-copilot  GitHub Copilot (filesystem-validated)

Options:
  --scope <project|global>  Installation scope (default: project).
  --global, -g              Shorthand for --scope global.
  --project, -p             Shorthand for --scope project.
  --overwrite               Overwrite existing files or confirm destructive action.
  --dry-run                 Preview without writing to disk.
  --non-interactive, -y     Run without interactive confirmation prompts.
  --json                    Output in JSON format.
  --help, -h                Show this help message.
  --version, -v             Show version.
  --verbose                 Show additional detail.

Exit codes:
  0  Success / No regressions detected.
  1  At least one previously passing check now fails.
  2  State error / No baseline found.
  3  Configuration error.
  4  Not a Git repository.
  5  Internal error.
  6  Operation cancelled by user.
  7  Collision detected; explicit --overwrite required.
  8  Ownership conflict.
  9  Incompatible target or unsupported agent.

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

    case "install": {
      const agent = parsed.positional[0];
      exitCode = await runInstall({
        agent,
        scope: parsed.scope,
        overwrite: parsed.flags.overwrite,
        dryRun: parsed.flags.dryRun,
        nonInteractive: parsed.flags.nonInteractive,
        format,
      });
      break;
    }

    case "update": {
      const agent = parsed.positional[0];
      exitCode = await runUpdate({
        agent,
        scope: parsed.scope,
        overwrite: parsed.flags.overwrite,
        dryRun: parsed.flags.dryRun,
        nonInteractive: parsed.flags.nonInteractive,
        format,
      });
      break;
    }

    case "uninstall": {
      const agent = parsed.positional[0];
      exitCode = await runUninstall({
        agent,
        scope: parsed.scope,
        overwrite: parsed.flags.overwrite,
        dryRun: parsed.flags.dryRun,
        nonInteractive: parsed.flags.nonInteractive,
        format,
      });
      break;
    }

    case "status": {
      const agent = parsed.positional[0];
      exitCode = await runStatus({
        agent,
        scope: parsed.scope,
        format,
      });
      break;
    }

    case "mcp": {
      // Dynamic import to avoid loading MCP SDK for non-mcp commands
      const { startServer } = await import("./mcp/server.js");
      await startServer();
      // MCP server runs until stdin closes; do not exit
      return;
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
