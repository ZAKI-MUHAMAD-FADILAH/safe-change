import type { OutputFormat } from "../types/index.js";
import { ExitCodes } from "../types/index.js";
import { getRepositoryRoot } from "../git/inspector.js";
import { loadConfig } from "../config/loader.js";
import { loadBaseline } from "../baseline/manager.js";
import {
  captureWorkspaceFingerprint,
  compareWorkspaceFingerprints,
} from "../integrity/fingerprint.js";

export async function runFingerprint(options: {
  readonly format: OutputFormat;
  readonly compare: boolean;
  readonly agentProfile?: string;
}): Promise<number> {
  const repoRoot = await getRepositoryRoot(process.cwd()).catch(() => null);
  if (!repoRoot) return ExitCodes.NOT_GIT_REPO;
  const config = await loadConfig(repoRoot);
  const current = await captureWorkspaceFingerprint(
    repoRoot,
    config,
    options.agentProfile ?? null
  );
  if (!options.compare) {
    process.stdout.write(
      options.format === "json"
        ? `${JSON.stringify(current, null, 2)}\n`
        : `Workspace fingerprint: ${current.digest}\n`
    );
    return ExitCodes.OK;
  }
  const baseline = await loadBaseline(repoRoot);
  if (!baseline?.workspaceFingerprint) {
    process.stderr.write("Baseline does not contain a workspace fingerprint.\n");
    return ExitCodes.NO_BASELINE;
  }
  const drift = compareWorkspaceFingerprints(
    baseline.workspaceFingerprint,
    current
  );
  process.stdout.write(
    options.format === "json"
      ? `${JSON.stringify(drift, null, 2)}\n`
      : drift.detected
        ? `Workspace drift: ${drift.categories.join(", ")}\n`
        : "Workspace fingerprint matches baseline.\n"
  );
  return drift.detected ? ExitCodes.NEW_FAILURE : ExitCodes.OK;
}