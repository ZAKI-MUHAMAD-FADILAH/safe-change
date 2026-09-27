import type { OutputFormat, LogCheckResult, CheckLogState } from "../types/index.js";
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
import { updateLastEntry } from "../log/log-manager.js";
import { loadRules } from "../rules/manager.js";
import { evaluateRules } from "../rules/engine.js";

export interface CheckOptions {
  readonly format: OutputFormat;
  readonly trigger?: "manual" | "mcp" | "cli";
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
  let report = buildReport(baseline, currentResults, currentFiles, config);

  // Evaluate safety rules
  try {
    const rules = await loadRules(repoRoot);
    if (rules.length > 0) {
      const ruleEvaluation = evaluateRules(rules, report.files, report.results);
      if (ruleEvaluation.violations.length > 0) {
        const exitCode =
          ruleEvaluation.errorCount > 0 ? ExitCodes.NEW_FAILURE : report.exitCode;
        report = {
          ...report,
          exitCode,
          ruleViolations: ruleEvaluation.violations,
        };
      }
    }
  } catch {
    // Safety rules evaluation error should not prevent check report
  }

  // 7. Update safety log
  try {
    const logCheckResults: LogCheckResult[] = report.results.map((r) => ({
      name: r.name,
      result: r.result,
      before: (r.before ?? "unverified") as CheckLogState,
      now: (r.now ?? "unverified") as CheckLogState,
    }));
    const totalDurationMs = currentResults.reduce(
      (sum, r) => sum + (r.durationMs || 0),
      0
    );
    const hasErrorViolations =
      report.ruleViolations?.some((v) => v.severity === "error") ?? false;
    const regressionDetected = report.summary.newFailures > 0 || hasErrorViolations;

    await updateLastEntry(
      {
        baselineId: baseline.git.headCommit ?? "baseline",
        trigger: options.trigger ?? "cli",
        checkResults: logCheckResults,
        fileSummary: {
          added: report.files.added.length,
          modified: report.files.modified.length,
          deleted: report.files.deleted.length,
          unchanged: report.files.unchangedCount,
        },
        regressionDetected,
        durationMs: totalDurationMs,
      },
      repoRoot
    );
  } catch {
    // Safety log update failure should not break check execution
  }

  process.stdout.write(renderCheckReport(format, report));

  return report.exitCode;
}
