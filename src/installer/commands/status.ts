import * as os from "node:os";
import type { OutputFormat } from "../../types/index.js";
import { ExitCodes } from "../../types/index.js";
import { getRepositoryRoot } from "../../git/inspector.js";
import type { InstallerScope } from "../core/path-safety.js";
import { AntigravityAdapter } from "../adapters/antigravity.js";

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

  // 1. Agent validation (default to antigravity if not specified)
  const agentRaw = options.agent ?? "antigravity";
  const agentName = agentRaw.toLowerCase().trim();
  if (agentName !== "antigravity") {
    stderr.write(
      `Error: Unsupported agent '${agentRaw}'. Currently supported: antigravity\n`
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

  // 4. Query status
  try {
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
  } catch (err: unknown) {
    stderr.write(
      `Internal error: ${err instanceof Error ? err.message : String(err)}\n`
    );
    return ExitCodes.INTERNAL_ERROR;
  }
}
