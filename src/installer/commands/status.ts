import * as os from "node:os";
import type { OutputFormat } from "../../types/index.js";
import { ExitCodes } from "../../types/index.js";
import { getRepositoryRoot } from "../../git/inspector.js";
import type { InstallerScope } from "../core/path-safety.js";
import {
  SUPPORTED_AGENTS,
  getAdapter,
  isSupportedAgent,
  detectInstalledAgents,
} from "../adapters/registry.js";
import type { AdapterStatus } from "../adapters/adapter.js";

export interface StatusCommandOptions {
  agent?: string;
  scope?: InstallerScope;
  workspaceRoot?: string;
  homeDir?: string;
  format?: OutputFormat;
  canonicalSkillPath?: string;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

export async function runStatus(
  options: StatusCommandOptions
): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const format = options.format ?? "terminal";

  // 1. Scope validation
  const scope: InstallerScope = options.scope ?? "project";
  if (scope !== "project" && scope !== "global") {
    stderr.write(
      `Error: Invalid scope '${scope}'. Valid scopes are 'project' or 'global'.\n`
    );
    return ExitCodes.CONFIG_ERROR;
  }

  // 2. Workspace root resolution for project scope
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

  // 3. Check if specific agent was requested
  const rawAgent = options.agent?.toLowerCase().trim();
  const isAll = !rawAgent || rawAgent === "all";

  if (!isAll) {
    if (!isSupportedAgent(rawAgent)) {
      stderr.write(
        `Error: Unsupported agent '${options.agent}'. Supported agents: ${SUPPORTED_AGENTS.join(", ")}, all\n`
      );
      return ExitCodes.INCOMPATIBLE_TARGET;
    }

    const adapter = getAdapter(rawAgent, options.canonicalSkillPath);
    if (!adapter) {
      stderr.write(`Error: Could not instantiate adapter for '${rawAgent}'.\n`);
      return ExitCodes.INCOMPATIBLE_TARGET;
    }

    const status = adapter.status({
      scope,
      workspaceRoot,
      homeDir,
    });

    if (format === "json") {
      stdout.write(JSON.stringify(status, null, 2) + "\n");
    } else {
      stdout.write(`safe-change adapter status: ${adapter.displayName}\n`);
      stdout.write(`Scope: ${status.scope}\n`);
      stdout.write(`Target: ${status.targetDir}\n`);
      stdout.write(`Installed: ${status.installed ? "yes" : "no"}\n`);

      if (status.installed && status.manifest) {
        stdout.write(`Version: ${status.manifest.version}\n`);
        stdout.write(`Owner: ${status.manifest.owner}\n`);
        stdout.write(`Installed at: ${status.manifest.installedAt}\n`);
      }

      if (status.canonicalSha256) {
        stdout.write(`Canonical SHA-256: ${status.canonicalSha256}\n`);
      }
      if (status.installedSha256) {
        stdout.write(`Installed SHA-256: ${status.installedSha256}\n`);
      }

      if (!status.installed) {
        stdout.write("Status: Not installed\n");
      } else if (status.hasDrift) {
        stdout.write("Status: Drift detected (content modified)\n");
        if (status.driftDetails) {
          if (status.driftDetails.modifiedFiles.length > 0) {
            stdout.write(
              `  Modified: ${status.driftDetails.modifiedFiles.join(", ")}\n`
            );
          }
          if (status.driftDetails.missingFiles.length > 0) {
            stdout.write(
              `  Missing: ${status.driftDetails.missingFiles.join(", ")}\n`
            );
          }
        }
      } else {
        stdout.write("Status: Up to date\n");
      }
    }
    return ExitCodes.OK;
  }

  // 4. Multi-agent comprehensive status report (TASK 7)
  const detectedAgents = (scope === "project" && workspaceRoot)
    ? detectInstalledAgents(workspaceRoot)
    : [];

  const statuses: Array<{
    agentId: string;
    displayName: string;
    verificationStatus: string;
    detected: boolean;
    status: AdapterStatus;
  }> = [];

  const recommendations: string[] = [];

  for (const agentId of SUPPORTED_AGENTS) {
    const adapter = getAdapter(agentId, options.canonicalSkillPath)!;
    const isDetected = detectedAgents.includes(agentId);
    const s = adapter.status({
      scope,
      workspaceRoot,
      homeDir,
    });

    statuses.push({
      agentId,
      displayName: adapter.displayName,
      verificationStatus: adapter.verificationStatus ?? "filesystem-validated",
      detected: isDetected,
      status: s,
    });

    if (isDetected && !s.installed) {
      recommendations.push(
        `Agent '${agentId}' (${adapter.displayName}) detected in project but not protected. Run: safe-change install ${agentId}`
      );
    }
  }

  if (detectedAgents.length === 0 && scope === "project") {
    recommendations.push(
      "No specific AI coding agent directories detected. Run 'safe-change install all' to install across all supported agents."
    );
  }

  if (format === "json") {
    stdout.write(
      JSON.stringify(
        {
          scope,
          detectedAgents,
          agents: statuses,
          recommendations,
        },
        null,
        2
      ) + "\n"
    );
  } else {
    stdout.write("safe-change status report\n");
    stdout.write("========================\n");
    stdout.write(`Scope: ${scope}\n`);
    stdout.write(
      `Detected agents in project: ${
        detectedAgents.length > 0 ? detectedAgents.join(", ") : "none detected"
      }\n\n`
    );

    stdout.write("Agent Skill Status:\n");
    for (const item of statuses) {
      const mark = item.status.installed ? "[installed]" : "[not installed]";
      const driftMark = item.status.hasDrift ? " (drift detected)" : "";
      stdout.write(`  ${mark} ${item.displayName} (${item.verificationStatus})${driftMark}\n`);
      stdout.write(`      Target: ${item.status.targetDir}\n`);
    }

    if (recommendations.length > 0) {
      stdout.write("\nRecommendations:\n");
      for (const rec of recommendations) {
        stdout.write(`  - ${rec}\n`);
      }
    }
  }

  return ExitCodes.OK;
}
