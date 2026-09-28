import type { OutputFormat } from "../types/index.js";
import { ExitCodes } from "../types/index.js";
import { getRepositoryRoot } from "../git/inspector.js";
import { loadConfig } from "../config/loader.js";
import { createEvidenceBundle } from "../integrity/evidence.js";

export async function runEvidence(options: {
  readonly sessionId?: string;
  readonly agentProfile?: string;
  readonly format: OutputFormat;
}): Promise<number> {
  if (!options.sessionId) {
    process.stderr.write("evidence requires a sessionId.\n");
    return ExitCodes.CONFIG_ERROR;
  }
  const repoRoot = await getRepositoryRoot(process.cwd()).catch(() => null);
  if (!repoRoot) return ExitCodes.NOT_GIT_REPO;
  try {
    const config = await loadConfig(repoRoot);
    const result = await createEvidenceBundle(
      repoRoot,
      config,
      options.sessionId,
      options.agentProfile ?? null
    );
    const output = {
      created: true,
      directory: `.safe-change/evidence/${options.sessionId}`,
      manifest: result.manifest,
    };
    process.stdout.write(
      options.format === "json"
        ? `${JSON.stringify(output, null, 2)}\n`
        : `Evidence bundle created: ${output.directory}\nDigest: ${result.manifest.evidenceDigest}\n`
    );
    return ExitCodes.OK;
  } catch (error: unknown) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    return ExitCodes.INTERNAL_ERROR;
  }
}