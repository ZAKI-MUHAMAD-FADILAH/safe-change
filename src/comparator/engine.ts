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
 * Accurately detects added checks, removed checks, and checks whose definitions
 * (executable, args, or timeout) have changed since the baseline was recorded.
 */
export function detectConfigDrift(
  baseline: Baseline,
  config: SafeChangeConfig
): ConfigDrift {
  const currentHash = computeConfigHash(config);
  const driftDetected = currentHash !== baseline.checksConfigHash;

  const baselineByName = new Map(baseline.checks.map((c) => [c.name, c]));
  const currentByName = new Map(config.checks.map((c) => [c.name, c]));

  const removedChecks = [...baselineByName.keys()].filter((n) => !currentByName.has(n));
  const addedChecks = [...currentByName.keys()].filter((n) => !baselineByName.has(n));
  const changedChecks: string[] = [];

  for (const [name, currentCheck] of currentByName) {
    const baselineCheck = baselineByName.get(name);
    if (!baselineCheck) continue;

    const argsChanged =
      currentCheck.args.length !== baselineCheck.args.length ||
      currentCheck.args.some((arg, idx) => arg !== baselineCheck.args[idx]);
    const timeoutChanged = currentCheck.timeout !== baselineCheck.timeout;
    const executableChanged = currentCheck.executable !== baselineCheck.executable;

    if (executableChanged || argsChanged || timeoutChanged) {
      changedChecks.push(name);
    }
  }

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
    if (changedChecks.length > 0) {
      parts.push(
        `Changed check definitions: ${changedChecks.join(", ")}. Commands or parameters changed since baseline and are not comparable.`
      );
    }
    if (parts.length === 0) {
      parts.push(
        "Check definitions or configuration changed since baseline."
      );
    }
    message = parts.join(" ");
  }

  return { detected: driftDetected, removedChecks, addedChecks, changedChecks, message };
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

  // Compare checks present in current results
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
        stdout: current.stdout,
        stderr: current.stderr,
        exitCode: current.exitCode,
      });
      continue;
    }

    // Check if definition changed (executable, args, or timeout differ)
    const argsChanged =
      current.args.length !== before.args.length ||
      current.args.some((arg, idx) => arg !== before.args[idx]);
    const timeoutChanged = current.timeout !== before.timeout;
    const definitionChanged =
      current.executable !== before.executable || argsChanged || timeoutChanged;

    if (definitionChanged) {
      comparisons.push({
        name: current.name,
        before: checkResultToState(before),
        now: checkResultToState(current),
        result: "definition-changed",
        durationMs: current.durationMs,
        timedOut: current.timedOut,
        stdout: current.stdout,
        stderr: current.stderr,
        exitCode: current.exitCode,
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
      stdout: current.stdout,
      stderr: current.stderr,
      exitCode: current.exitCode,
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
 * Uses safe property lookup to support arbitrary file names (like '__proto__').
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
    const before = Object.prototype.hasOwnProperty.call(baselineFiles, path)
      ? baselineFiles[path]
      : undefined;
    const now = Object.prototype.hasOwnProperty.call(currentFiles, path)
      ? currentFiles[path]
      : undefined;

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
  let definitionChanged = 0;

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
      case "definition-changed":
        definitionChanged++;
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
    definitionChanged,
  };
}
