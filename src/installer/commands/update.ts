import * as os from "node:os";
import * as readline from "node:readline";
import type { OutputFormat } from "../../types/index.js";
import { ExitCodes } from "../../types/index.js";
import { getRepositoryRoot } from "../../git/inspector.js";
import type { InstallerScope } from "../core/path-safety.js";
import { AntigravityAdapter } from "../adapters/antigravity.js";

export interface UpdateCommandOptions {
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

export async function runUpdate(
  options: UpdateCommandOptions
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

  // 4. Check current status
  const currentStatus = adapter.status({
    scope,
    workspaceRoot,
    homeDir,
  });

  if (!currentStatus.installed) {
    stderr.write(
      `Error: Skill is not installed at '${currentStatus.targetDir}'. Run 'safe-change install' first.\n`
    );
    return ExitCodes.NO_BASELINE;
  }

  if (!currentStatus.manifest || currentStatus.manifest.owner !== "safe-change") {
    stderr.write(
      `Error: Ownership conflict at '${currentStatus.targetDir}'. Target is not owned by safe-change.\n`
    );
    return ExitCodes.OWNERSHIP_CONFLICT;
  }

  let overwrite = options.overwrite ?? false;

  // Handle destructive prompt if drift is detected
  if (currentStatus.hasDrift && !options.dryRun) {
    if (options.nonInteractive && !overwrite) {
      stderr.write(
        `Local modifications detected at '${currentStatus.targetDir}'. In --non-interactive mode, pass --overwrite to proceed.\n`
      );
      return ExitCodes.COLLISION_DETECTED;
    }

    if (!options.nonInteractive && !overwrite) {
      const confirmed = await askConfirmation(
        `Installed skill at '${currentStatus.targetDir}' has local modifications. Overwrite with canonical skill? (y/N): `,
        {
          stdin: options.stdin,
          stdout: options.stdout,
          nonInteractive: options.nonInteractive,
        }
      );
      if (!confirmed) {
        stdout.write("Update cancelled by user.\n");
        return ExitCodes.OPERATION_CANCELLED;
      }
      overwrite = true;
    }
  }

  // 5. Execute adapter update
  try {
    const result = adapter.update({
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
      stdout.write(`safe-change updater: ${adapter.displayName}\n`);
      stdout.write(`Scope: ${result.scope}\n`);
      stdout.write(`Target: ${result.targetDir}\n`);
      stdout.write(`${result.message}\n`);
      if (result.sha256) {
        stdout.write(`SHA-256: ${result.sha256}\n`);
      }
    }

    if (
      result.status === "updated" ||
      result.status === "installed" ||
      result.status === "up_to_date" ||
      result.status === "dry_run"
    ) {
      return ExitCodes.OK;
    }

    if (result.status === "ownership_conflict") {
      return ExitCodes.OWNERSHIP_CONFLICT;
    }

    if (result.status === "collision_detected") {
      return ExitCodes.COLLISION_DETECTED;
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
