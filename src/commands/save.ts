import type { OutputFormat, LogCheckResult } from "../types/index.js";
import { ExitCodes } from "../types/index.js";
import { loadConfig } from "../config/loader.js";
import {
  getRepositoryRoot,
  getGitState,
  getFileEntries,
} from "../git/inspector.js";
import {
  saveBaseline,
  isStateExcludedFromGit,
} from "../baseline/manager.js";
import { executeAllChecks } from "../runner/executor.js";
import { renderSaveResult, renderError } from "../output/renderer.js";
import { appendEntry, createLogEntry } from "../log/log-manager.js";

export interface SaveOptions {
  readonly description: string;
  readonly format: OutputFormat;
  readonly trigger?: "manual" | "mcp" | "cli";
}

export async function runSave(options: SaveOptions): Promise<number> {
  const { description, format } = options;

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

  // 2. Load configuration
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

  // 3. Inspect Git state and files
  let gitState;
  let files;
  try {
    [gitState, files] = await Promise.all([
      getGitState(repoRoot),
      getFileEntries(repoRoot),
    ]);
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

  // 4. Execute verification checks
  let checkResults;
  try {
    checkResults = await executeAllChecks(config.checks, { cwd: repoRoot }, (name, index, total) => {
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

  // 5. Save baseline
  let baselinePath: string;
  try {
    baselinePath = await saveBaseline(
      repoRoot,
      description,
      gitState,
      files,
      checkResults,
      config
    );
  } catch (err: unknown) {
    process.stderr.write(
      renderError(
        format,
        `Failed to save baseline: ${err instanceof Error ? err.message : String(err)}`,
        ExitCodes.INTERNAL_ERROR
      )
    );
    return ExitCodes.INTERNAL_ERROR;
  }

  // 6. Append to safety log
  try {
    const logCheckResults: LogCheckResult[] = checkResults.map((c) => ({
      name: c.name,
      result: c.passed ? "pass-pass" : "fail-fail",
      before: c.passed ? "pass" : "fail",
      now: c.passed ? "pass" : "fail",
    }));
    const totalDurationMs = checkResults.reduce(
      (sum, r) => sum + (r.durationMs || 0),
      0
    );
    const entry = createLogEntry({
      description: description || null,
      baselineId: gitState.headCommit ?? baselinePath,
      trigger: options.trigger ?? "cli",
      checkResults: logCheckResults,
      fileSummary: {
        added: 0,
        modified: 0,
        deleted: 0,
        unchanged: Object.keys(files).length,
      },
      regressionDetected: false,
      durationMs: totalDurationMs,
    });
    await appendEntry(entry, repoRoot, config.logRetention);
  } catch {
    // Safety log write failure should not abort baseline save
  }

  // 7. Check .gitignore warning
  const gitignoreOk = await isStateExcludedFromGit(repoRoot);

  // 8. Render output
  const checksRun = checkResults.length;
  const checksPassed = checkResults.filter((r) => r.passed).length;
  const fileCount = Object.keys(files).length;

  process.stdout.write(
    renderSaveResult(
      format,
      description,
      checksRun,
      checksPassed,
      fileCount,
      baselinePath,
      !gitignoreOk
    )
  );

  return ExitCodes.OK;
}
