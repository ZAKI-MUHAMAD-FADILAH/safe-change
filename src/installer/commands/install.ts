import * as fs from "node:fs";
import * as os from "node:os";
import * as readline from "node:readline";
import type { OutputFormat } from "../../types/index.js";
import { ExitCodes } from "../../types/index.js";
import { getRepositoryRoot } from "../../git/inspector.js";
import type { InstallerScope } from "../core/path-safety.js";
import { inspectCollision } from "../core/collision.js";
import { AntigravityAdapter } from "../adapters/antigravity.js";

export interface InstallCommandOptions {
  agent?: string;
  scope?: InstallerScope;
  workspaceRoot?: string;
  homeDir?: string;
  overwrite?: boolean;
  dryRun?: boolean;
  nonInteractive?: boolean;
  format?: OutputFormat;
  canonicalSkillPath?: string;
  stdin?: NodeJS.ReadableStream;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

async function askConfirmation(
  question: string,
  options?: {
    stdin?: NodeJS.ReadableStream;
    stdout?: NodeJS.WritableStream;
    nonInteractive?: boolean;
  }
): Promise<boolean> {
  if (options?.nonInteractive) {
    return false;
  }
  const stdin = options?.stdin ?? process.stdin;
  const stdout = options?.stdout ?? process.stdout;

  if (!options?.stdin && !(stdin as any).isTTY) {
    return false;
  }

  const rl = readline.createInterface({
    input: stdin,
    output: stdout,
  });

  return new Promise<boolean>((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === "y" || trimmed === "yes" || trimmed === "ya");
    });
  });
}

export async function runInstall(
  options: InstallCommandOptions
): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const format = options.format ?? "terminal";

  // 1. Agent validation
  if (!options.agent) {
    stderr.write(
      "Error: Agent name is required. Currently supported: antigravity\n"
    );
    return ExitCodes.INCOMPATIBLE_TARGET;
  }

  const agentName = options.agent.toLowerCase().trim();
  if (agentName !== "antigravity") {
    stderr.write(
      `Error: Unsupported agent '${options.agent}'. Currently supported: antigravity\n`
    );
    return ExitCodes.INCOMPATIBLE_TARGET;
  }

  // 2. Scope validation
  const scope: InstallerScope = options.scope ?? "project";
  if (scope !== "project" && scope !== "global") {
    stderr.write(
      `Error: Invalid scope '${scope}'. Valid scopes are 'project' or 'global'.\n`
    );
    return ExitCodes.CONFIG_ERROR;
  }

  // 3. Workspace root resolution for project scope
  let workspaceRoot = options.workspaceRoot;
  if (scope === "project" && !workspaceRoot) {
    try {
      workspaceRoot = await getRepositoryRoot(process.cwd());
    } catch {
      stderr.write(
        "Error: Not a Git repository. Project scope requires a Git repository.\n"
      );
      return ExitCodes.NOT_GIT_REPO;
    }
  }

  const homeDir = options.homeDir ?? os.homedir();
  const adapter = new AntigravityAdapter(options.canonicalSkillPath);

  // 4. Resolve target and inspect collisions before write
  let targetDir: string;
  try {
    targetDir = adapter.resolveTargetDir({
      scope,
      workspaceRoot,
      homeDir,
    });
  } catch (err: unknown) {
    stderr.write(
      `Error: ${err instanceof Error ? err.message : String(err)}\n`
    );
    return ExitCodes.INCOMPATIBLE_TARGET;
  }

  const collision = inspectCollision({
    targetPath: targetDir,
    expectedType: "directory",
    sourceSkillFile: adapter.canonicalSkillPath,
    relativeSkillFileName: "SKILL.md",
  });

  if (collision.state === "symlink_or_junction") {
    stderr.write(
      `Error: Target directory is a symlink or junction: '${targetDir}'.\n`
    );
    return ExitCodes.INCOMPATIBLE_TARGET;
  }

  if (collision.state === "ownership_conflict") {
    stderr.write(
      `Error: Ownership conflict at '${targetDir}'. Directory is not owned by safe-change.\n`
    );
    return ExitCodes.OWNERSHIP_CONFLICT;
  }

  let overwrite = options.overwrite ?? false;

  // Handle destructive collision when content differs
  if (collision.exists && !collision.isIdentical) {
    if (!options.dryRun) {
      if (options.nonInteractive && !overwrite) {
        stderr.write(
          `Collision detected at '${targetDir}'. Target contains differing content. In --non-interactive mode, pass --overwrite to proceed.\n`
        );
        return ExitCodes.COLLISION_DETECTED;
      }

      if (!options.nonInteractive && !overwrite) {
        const confirmed = await askConfirmation(
          `Target already exists with different content at '${targetDir}'. Overwrite? (y/N): `,
          {
            stdin: options.stdin,
            stdout: options.stdout,
            nonInteractive: options.nonInteractive,
          }
        );
        if (!confirmed) {
          stdout.write("Installation cancelled by user.\n");
          return ExitCodes.OPERATION_CANCELLED;
        }
        overwrite = true;
      }
    }
  }

  // 5. Execute adapter installation
  try {
    const result = adapter.install({
      scope,
      workspaceRoot,
      homeDir,
      overwrite,
      dryRun: options.dryRun,
      nonInteractive: options.nonInteractive,
    });

    if (format === "json") {
      stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else {
      stdout.write(`safe-change installer: ${adapter.displayName}\n`);
      stdout.write(`Scope: ${result.scope}\n`);
      stdout.write(`Target: ${result.targetDir}\n`);
      stdout.write(`${result.message}\n`);
      if (result.sha256) {
        stdout.write(`SHA-256: ${result.sha256}\n`);
      }
    }

    if (
      result.status === "installed" ||
      result.status === "updated" ||
      result.status === "up_to_date" ||
      result.status === "dry_run"
    ) {
      return ExitCodes.OK;
    }

    if (result.status === "collision_detected") {
      return ExitCodes.COLLISION_DETECTED;
    }

    if (result.status === "ownership_conflict") {
      return ExitCodes.OWNERSHIP_CONFLICT;
    }

    if (result.status === "cancelled") {
      return ExitCodes.OPERATION_CANCELLED;
    }

    return ExitCodes.INTERNAL_ERROR;
  } catch (err: unknown) {
    stderr.write(
      `Internal error: ${err instanceof Error ? err.message : String(err)}\n`
    );
    return ExitCodes.INTERNAL_ERROR;
  }
}
