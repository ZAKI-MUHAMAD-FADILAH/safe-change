import * as fs from "node:fs";
import * as os from "node:os";
import * as readline from "node:readline";
import type { OutputFormat } from "../../types/index.js";
import { ExitCodes } from "../../types/index.js";
import { getRepositoryRoot } from "../../git/inspector.js";
import type { InstallerScope } from "../core/path-safety.js";
import { validateOwnership } from "../core/ownership.js";
import {
  SUPPORTED_AGENTS,
  getAdapter,
  isSupportedAgent,
  detectInstalledAgents,
} from "../adapters/registry.js";
import type { AgentAdapter } from "../adapters/adapter.js";

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

async function updateSingleAdapter(
  adapter: AgentAdapter,
  options: UpdateCommandOptions,
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

  // Check if target directory exists
  if (!fs.existsSync(targetDir)) {
    stderr.write(
      `Error: Skill is not installed at '${targetDir}'. Cannot update non-existent installation. Run 'safe-change install' first.\n`
    );
    return ExitCodes.NO_BASELINE;
  }

  // Validate ownership
  const isSharedAmpAntigravity =
    scope === "project" &&
    (adapter.agentId === "amp" || adapter.agentId === "antigravity");

  let ownershipCheck = validateOwnership(targetDir, {
    expectedAgent: adapter.agentId ?? adapter.agentName,
  });

  if (!ownershipCheck.isValid && isSharedAmpAntigravity) {
    const altAgent = adapter.agentId === "amp" ? "antigravity" : "amp";
    const altCheck = validateOwnership(targetDir, {
      expectedAgent: altAgent,
    });
    if (altCheck.isValid) {
      ownershipCheck = altCheck;
    }
  }

  if (!ownershipCheck.isValid) {
    stderr.write(
      `Error: Ownership validation failed at '${targetDir}': ${ownershipCheck.errorReason ?? "unknown"}.\n`
    );
    return ExitCodes.OWNERSHIP_CONFLICT;
  }

  // Interactive confirmation
  if (!options.dryRun && !options.overwrite && !options.nonInteractive) {
    const confirmed = await askConfirmation(
      `Update skill at '${targetDir}'? This will overwrite the installed files. (y/N): `,
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
  }

  // Execute update
  try {
    const result = adapter.update({
      scope,
      workspaceRoot,
      homeDir,
      overwrite: true,
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

export async function runUpdate(
  options: UpdateCommandOptions
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

  if (isAll) {
    let targetAgents: readonly string[];
    if (scope === "project" && workspaceRoot) {
      const detected = detectInstalledAgents(workspaceRoot);
      targetAgents = detected.length > 0 ? detected : SUPPORTED_AGENTS;
    } else {
      targetAgents = SUPPORTED_AGENTS;
    }

    let overallExitCode: number = ExitCodes.OK;
    for (const agentId of targetAgents) {
      const adapter = getAdapter(agentId, options.canonicalSkillPath);
      if (!adapter) continue;
      const code = await updateSingleAdapter(adapter, options, context);
      if (code !== ExitCodes.OK && overallExitCode === ExitCodes.OK) {
        overallExitCode = code;
      }
    }
    return overallExitCode;
  }

  const adapter = getAdapter(agentName, options.canonicalSkillPath);
  if (!adapter) {
    stderr.write(`Error: Could not instantiate adapter for '${agentName}'.\n`);
    return ExitCodes.INCOMPATIBLE_TARGET;
  }

  return updateSingleAdapter(adapter, options, context);
}
