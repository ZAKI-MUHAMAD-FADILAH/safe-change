import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";
import type { OutputFormat } from "../../types/index.js";
import { ExitCodes } from "../../types/index.js";
import { getRepositoryRoot } from "../../git/inspector.js";
import type { InstallerScope } from "../core/path-safety.js";
import { inspectCollision } from "../core/collision.js";
import {
  SUPPORTED_AGENTS,
  getAdapter,
  isSupportedAgent,
  detectInstalledAgents,
} from "../adapters/registry.js";
import type { AgentAdapter } from "../adapters/adapter.js";

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

async function installSingleAdapter(
  adapter: AgentAdapter,
  options: InstallCommandOptions,
  context: {
    scope: InstallerScope;
    workspaceRoot?: string;
    homeDir: string;
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
    format: OutputFormat;
  }
): Promise<number> {
  const { scope, workspaceRoot, homeDir, stdout, stderr, format } = context;

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

  // Detect Amp / Antigravity collision on .agents/skills/safe-change
  const isSharedAmpAntigravity =
    scope === "project" &&
    (adapter.agentId === "amp" || adapter.agentId === "antigravity");

  if (isSharedAmpAntigravity && fs.existsSync(targetDir)) {
    if (format !== "json") {
      stdout.write(
        "Peringatan: amp dan antigravity berbagi direktori .agents/skills/. Keduanya akan membaca skill yang sama.\n"
      );
    }
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

  // For shared Amp/Antigravity, do not block on ownership if owned by companion
  let isSharedCollision = false;
  if (isSharedAmpAntigravity && collision.state === "ownership_conflict") {
    const existingAgent = collision.ownership.agent;
    if (existingAgent === "amp" || existingAgent === "antigravity") {
      isSharedCollision = true;
    }
  }

  if (collision.state === "ownership_conflict" && !isSharedCollision) {
    stderr.write(
      `Error: Ownership conflict at '${targetDir}'. Directory is not owned by safe-change.\n`
    );
    return ExitCodes.OWNERSHIP_CONFLICT;
  }

  let overwrite = options.overwrite ?? false;

  // Handle destructive collision when content differs
  if (collision.exists && !collision.isIdentical && !isSharedCollision) {
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

  // Execute adapter installation
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

export async function runInstall(
  options: InstallCommandOptions
): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const format = options.format ?? "terminal";

  // 1. Agent validation
  if (!options.agent) {
    stderr.write(
      `Error: Agent name is required. Supported agents: ${SUPPORTED_AGENTS.join(", ")}, all\n`
    );
    return ExitCodes.INCOMPATIBLE_TARGET;
  }

  const agentName = options.agent.toLowerCase().trim();
  const isAll = agentName === "all";

  if (!isAll && !isSupportedAgent(agentName)) {
    stderr.write(
      `Error: Unsupported agent '${options.agent}'. Supported agents: ${SUPPORTED_AGENTS.join(", ")}, all\n`
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
  const context = {
    scope,
    workspaceRoot,
    homeDir,
    stdout,
    stderr,
    format,
  };

  // 4. Handle "all" subcommand
  if (isAll) {
    let targetAgents: readonly string[];
    if (scope === "project" && workspaceRoot) {
      const detected = detectInstalledAgents(workspaceRoot);
      if (detected.length > 0) {
        targetAgents = detected;
        if (format !== "json") {
          stdout.write(
            `Detected agents in project: ${detected.join(", ")}\n`
          );
        }
      } else {
        targetAgents = SUPPORTED_AGENTS;
        if (format !== "json") {
          stdout.write(
            "No specific agents detected; installing for all supported agents.\n"
          );
        }
      }
    } else {
      targetAgents = SUPPORTED_AGENTS;
    }

    let overallExitCode: number = ExitCodes.OK;
    for (const agentId of targetAgents) {
      const adapter = getAdapter(agentId, options.canonicalSkillPath);
      if (!adapter) continue;
      const code = await installSingleAdapter(adapter, options, context);
      if (code !== ExitCodes.OK && overallExitCode === ExitCodes.OK) {
        overallExitCode = code;
      }
    }
    return overallExitCode;
  }

  // Single agent installation
  const adapter = getAdapter(agentName, options.canonicalSkillPath);
  if (!adapter) {
    stderr.write(`Error: Could not instantiate adapter for '${agentName}'.\n`);
    return ExitCodes.INCOMPATIBLE_TARGET;
  }

  return installSingleAdapter(adapter, options, context);
}
