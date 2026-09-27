import * as fs from "node:fs";
import * as os from "node:os";
import * as readline from "node:readline";
import type { OutputFormat } from "../../types/index.js";
import { ExitCodes } from "../../types/index.js";
import { getRepositoryRoot } from "../../git/inspector.js";
import type { InstallerScope } from "../core/path-safety.js";
import { validateOwnership } from "../core/ownership.js";
import { AntigravityAdapter } from "../adapters/antigravity.js";

export interface UninstallCommandOptions {
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

export async function runUninstall(
  options: UninstallCommandOptions
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

  // 4. Verify target exists
  if (!fs.existsSync(targetDir)) {
    stderr.write(`Error: No installation found at '${targetDir}'.\n`);
    return ExitCodes.NO_BASELINE;
  }

  // 5. Verify ownership before removal
  const ownershipCheck = validateOwnership(targetDir, {
    expectedAgent: adapter.agentName,
  });

  if (!ownershipCheck.isValid) {
    stderr.write(
      `Error: Ownership conflict at '${targetDir}'. ${ownershipCheck.errorReason ?? "Directory is not owned by safe-change."}\n`
    );
    return ExitCodes.OWNERSHIP_CONFLICT;
  }

  // 6. Handle destructive confirmation
  if (!options.dryRun) {
    if (options.nonInteractive && !options.overwrite) {
      stderr.write(
        `Uninstall is a destructive operation. In --non-interactive mode, pass --overwrite to confirm removal of '${targetDir}'.\n`
      );
      return ExitCodes.COLLISION_DETECTED;
    }

    if (!options.nonInteractive) {
      const confirmed = await askConfirmation(
        `Are you sure you want to remove safe-change skill from '${targetDir}'? (y/N): `,
        {
          stdin: options.stdin,
          stdout: options.stdout,
          nonInteractive: options.nonInteractive,
        }
      );
      if (!confirmed) {
        stdout.write("Uninstall cancelled by user.\n");
        return ExitCodes.OPERATION_CANCELLED;
      }
    }
  }

  // 7. Execute adapter uninstallation
  try {
    const result = adapter.uninstall({
      scope,
      workspaceRoot,
      homeDir,
      dryRun: options.dryRun,
      nonInteractive: options.nonInteractive,
    });

    if (format === "json") {
      stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else {
      stdout.write(`safe-change uninstaller: ${adapter.displayName}\n`);
      stdout.write(`Scope: ${result.scope}\n`);
      stdout.write(`Target: ${result.targetDir}\n`);
      stdout.write(`${result.message}\n`);
    }

    if (result.status === "uninstalled" || result.status === "dry_run") {
      return ExitCodes.OK;
    }

    if (result.status === "not_found") {
      return ExitCodes.NO_BASELINE;
    }

    if (result.status === "ownership_conflict") {
      return ExitCodes.OWNERSHIP_CONFLICT;
    }

    if (result.status === "collision_detected") {
      return ExitCodes.COLLISION_DETECTED;
    }

    return ExitCodes.INTERNAL_ERROR;
  } catch (err: unknown) {
    stderr.write(
      `Internal error: ${err instanceof Error ? err.message : String(err)}\n`
    );
    return ExitCodes.INTERNAL_ERROR;
  }
}
