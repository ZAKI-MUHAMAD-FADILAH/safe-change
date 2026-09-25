// ---------------------------------------------------------------------------
// safe-change -- check command
// ---------------------------------------------------------------------------

import type { OutputFormat } from "../types/index.js";
import { ExitCodes } from "../types/index.js";
import { loadConfig } from "../config/loader.js";
import {
  getRepositoryRoot,
  getFileEntries,
} from "../git/inspector.js";
import { loadBaseline } from "../baseline/manager.js";
import { executeAllChecks } from "../runner/executor.js";
import { buildReport } from "../comparator/engine.js";
import { renderCheckReport, renderError } from "../output/renderer.js";

export interface CheckOptions {
  readonly format: OutputFormat;
}

export async function runCheck(options: CheckOptions): Promise<number> {
  const { format } = options;

  // 1. Verify Git repository
  let repoRoot: string;
  try {
    repoRoot = await getRepositoryRoot(process.cwd());
  } catch {
    process.stderr.write(
      renderError(format, "Not a Git repository. safe-change requires a Git repository.", ExitCodes.NOT_GIT_REPO)
    );
    return ExitCodes.NOT_GIT_REPO;
  }

  // 2. Load baseline
  let baseline;
  try {
    baseline = await loadBaseline(repoRoot);
  } catch (err: unknown) {
    process.stderr.write(
      renderError(
        format,
        err instanceof Error ? err.message : String(err),
        ExitCodes.NO_BASELINE
      )
    );
    return ExitCodes.NO_BASELINE;
  }

  if (baseline === null) {
    process.stderr.write(
      renderError(
        format,
        'No baseline found. Run "safe-change save" first to create a baseline.',
        ExitCodes.NO_BASELINE
      )
    );
    return ExitCodes.NO_BASELINE;
  }

  // 3. Load current configuration
  let config;
  try {
    config = await loadConfig(repoRoot);
  } catch (err: unknown) {
    process.stderr.write(
      renderError(
        format,
        err instanceof Error ? err.message : String(err),
        ExitCodes.CONFIG_ERROR
      )
    );
    return ExitCodes.CONFIG_ERROR;
  }

  // 4. Get current file state
  let currentFiles;
  try {
    currentFiles = await getFileEntries(repoRoot);
  } catch (err: unknown) {
    process.stderr.write(
      renderError(
        format,
        `Failed to read repository state: ${err instanceof Error ? err.message : String(err)}`,
        ExitCodes.INTERNAL_ERROR
      )
    );
    return ExitCodes.INTERNAL_ERROR;
  }

  // 5. Execute current checks
  let currentResults;
  try {
    currentResults = await executeAllChecks(config.checks, { cwd: repoRoot }, (name, index, total) => {
      if (format === "terminal") {
        process.stderr.write(`  Running check ${index + 1}/${total}: ${name}\r`);
      }
    });
  } catch (err: unknown) {
    process.stderr.write(
      renderError(
        format,
        `Failed to execute checks: ${err instanceof Error ? err.message : String(err)}`,
        ExitCodes.INTERNAL_ERROR
      )
    );
    return ExitCodes.INTERNAL_ERROR;
  }

  // 6. Build and render report
  const report = buildReport(baseline, currentResults, currentFiles, config);

  process.stdout.write(renderCheckReport(format, report));

  return report.exitCode;
}
