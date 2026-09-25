// ---------------------------------------------------------------------------
// safe-change -- Comparator engine
// ---------------------------------------------------------------------------

import type {
  Baseline,
  CheckComparison,
  CheckComparisonResult,
  CheckReport,
  CheckReportSummary,
  CheckResult,
  ConfigDrift,
  FileChanges,
  FileEntry,
  SafeChangeConfig,
  ExitCode,
} from "../types/index.js";
import { ExitCodes } from "../types/index.js";
import { computeConfigHash } from "../baseline/manager.js";

type CheckState = "pass" | "fail" | "timeout";

function checkResultToState(result: CheckResult): CheckState {
  if (result.timedOut) return "timeout";
  return result.passed ? "pass" : "fail";
}

/**
 * Detect configuration drift between the baseline and the current config.
 */
export function detectConfigDrift(
  baseline: Baseline,
  config: SafeChangeConfig
): ConfigDrift {
  const currentHash = computeConfigHash(config);
  const driftDetected = currentHash !== baseline.checksConfigHash;

  const baselineNames = new Set(baseline.checks.map((c) => c.name));
  const currentNames = new Set(config.checks.map((c) => c.name));

  const removedChecks = [...baselineNames].filter((n) => !currentNames.has(n));
  const addedChecks = [...currentNames].filter((n) => !baselineNames.has(n));

  let message = "";
  if (driftDetected) {
    const parts: string[] = [];
    if (removedChecks.length > 0) {
      parts.push(
        `Removed checks: ${removedChecks.join(", ")}. Results for these cannot be compared.`
      );
    }
    if (addedChecks.length > 0) {
      parts.push(
        `Added checks: ${addedChecks.join(", ")}. These have no baseline to compare against.`
      );
    }
    if (parts.length === 0) {
      parts.push(
        "Check definitions changed (executable, args, or timeout) since baseline."
      );
    }
    message = parts.join(" ");
  }

  return { detected: driftDetected, removedChecks, addedChecks, message };
}

/**
 * Compare current check results against the baseline.
 */
export function compareChecks(
  baseline: Baseline,
  currentResults: readonly CheckResult[],
  config: SafeChangeConfig
): { comparisons: CheckComparison[]; drift: ConfigDrift } {
  const drift = detectConfigDrift(baseline, config);
  const comparisons: CheckComparison[] = [];

  const baselineByName = new Map(baseline.checks.map((c) => [c.name, c]));
  const currentByName = new Map(currentResults.map((c) => [c.name, c]));

  // Compare checks present in both baseline and current
  for (const current of currentResults) {
    const before = baselineByName.get(current.name);

    if (!before) {
      // New check, not in baseline
      comparisons.push({
        name: current.name,
        before: null,
        now: checkResultToState(current),
        result: "config-added",
        durationMs: current.durationMs,
        timedOut: current.timedOut,
      });
      continue;
    }

    const beforeState = checkResultToState(before);
    const nowState = checkResultToState(current);
    const result = classifyResult(beforeState, nowState);

    comparisons.push({
      name: current.name,
      before: beforeState,
      now: nowState,
      result,
      durationMs: current.durationMs,
      timedOut: current.timedOut,
    });
  }

  // Checks removed from config
  for (const name of drift.removedChecks) {
    const before = baselineByName.get(name);
    comparisons.push({
      name,
      before: before ? checkResultToState(before) : null,
      now: null,
      result: "config-removed",
      durationMs: null,
      timedOut: false,
    });
  }

  return { comparisons, drift };
}

/**
 * Compare file entries between baseline and current state.
 */
export function compareFiles(
  baselineFiles: Readonly<Record<string, FileEntry>>,
  currentFiles: Readonly<Record<string, FileEntry>>
): FileChanges {
  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];
  let unchangedCount = 0;

  const allPaths = new Set([
    ...Object.keys(baselineFiles),
    ...Object.keys(currentFiles),
  ]);

  for (const path of allPaths) {
    const before = baselineFiles[path];
    const now = currentFiles[path];

    if (!before && now) {
      added.push(path);
    } else if (before && !now) {
      deleted.push(path);
    } else if (before && now) {
      if (now.status === "deleted" && before.status !== "deleted") {
        deleted.push(path);
      } else if (
        before.worktreeHash !== now.worktreeHash ||
        before.indexHash !== now.indexHash ||
        before.status !== now.status
      ) {
        modified.push(path);
      } else {
        unchangedCount++;
      }
    }
  }

  added.sort();
  modified.sort();
  deleted.sort();

  return { added, modified, deleted, unchangedCount };
}

/**
 * Build a complete check report.
 */
export function buildReport(
  baseline: Baseline,
  currentResults: readonly CheckResult[],
  currentFiles: Readonly<Record<string, FileEntry>>,
  config: SafeChangeConfig
): CheckReport {
  const { comparisons, drift } = compareChecks(
    baseline,
    currentResults,
    config
  );
  const files = compareFiles(baseline.files, currentFiles);
  const summary = buildSummary(comparisons, drift);

  const hasNewFailure = comparisons.some(
    (c) =>
      c.result === "pass-fail" ||
      c.result === "pass-timeout"
  );

  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    baseline: {
      createdAt: baseline.createdAt,
      description: baseline.description,
    },
    configDrift: drift,
    results: comparisons,
    files,
    summary,
    exitCode: hasNewFailure ? ExitCodes.NEW_FAILURE : ExitCodes.OK,
  };
}

// -- Helpers -----------------------------------------------------------------

function classifyResult(
  before: CheckState,
  now: CheckState
): CheckComparisonResult {
  const key = `${before}-${now}` as CheckComparisonResult;
  const valid: ReadonlySet<string> = new Set([
    "pass-pass",
    "pass-fail",
    "pass-timeout",
    "fail-pass",
    "fail-fail",
    "fail-timeout",
    "timeout-pass",
    "timeout-fail",
    "timeout-timeout",
  ]);
  if (valid.has(key)) return key;
  // Fallback -- should not happen with correct inputs
  return "fail-fail";
}

function buildSummary(
  comparisons: readonly CheckComparison[],
  drift: ConfigDrift
): CheckReportSummary {
  let newFailures = 0;
  let fixed = 0;
  let stillFailing = 0;
  let stillPassing = 0;

  for (const c of comparisons) {
    switch (c.result) {
      case "pass-pass":
        stillPassing++;
        break;
      case "pass-fail":
      case "pass-timeout":
        newFailures++;
        break;
      case "fail-pass":
      case "timeout-pass":
        fixed++;
        break;
      case "fail-fail":
      case "fail-timeout":
      case "timeout-fail":
      case "timeout-timeout":
        stillFailing++;
        break;
      // config-added and config-removed do not count in these categories
    }
  }

  return {
    newFailures,
    fixed,
    stillFailing,
    stillPassing,
    configDrift: drift.detected,
  };
}
