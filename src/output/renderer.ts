// ---------------------------------------------------------------------------
// safe-change -- Output renderer (terminal + JSON, no emoji)
// ---------------------------------------------------------------------------

import type {
  Baseline,
  CheckComparison,
  CheckReport,
  ConfigDrift,
  DiffSummary,
  FileChanges,
  OutputFormat,
} from "../types/index.js";

// -- Terminal color helpers (ANSI) -------------------------------------------

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const WHITE = "\x1b[37m";

function useColor(): boolean {
  if (process.env["NO_COLOR"] !== undefined) return false;
  if (process.env["FORCE_COLOR"] !== undefined) return true;
  return process.stdout.isTTY === true;
}

function c(code: string, text: string): string {
  return useColor() ? `${code}${text}${RESET}` : text;
}

// -- Safe text ---------------------------------------------------------------

/**
 * Strip control characters from untrusted text to prevent terminal injection.
 */
export function sanitize(text: string): string {
  // Keep newlines, tabs, and carriage returns; strip other control chars
  return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

// -- Render save output ------------------------------------------------------

export function renderSaveResult(
  format: OutputFormat,
  description: string,
  checksRun: number,
  checksPassed: number,
  fileCount: number,
  baselinePath: string,
  gitignoreWarning: boolean
): string {
  if (format === "json") {
    return JSON.stringify(
      {
        action: "save",
        description,
        checksRun,
        checksPassed,
        fileCount,
        baselinePath,
        gitignoreWarning,
      },
      null,
      2
    );
  }

  const lines: string[] = [];
  lines.push("");
  lines.push(c(BOLD, "Baseline saved"));
  lines.push("");
  lines.push(`  Description:  ${sanitize(description)}`);
  lines.push(`  Files:        ${fileCount}`);
  lines.push(`  Checks run:   ${checksRun}`);
  lines.push(
    `  Checks passed: ${checksPassed}/${checksRun}${
      checksPassed < checksRun
        ? c(YELLOW, " (pre-existing failures recorded)")
        : ""
    }`
  );
  lines.push(`  Stored at:    ${baselinePath}`);

  if (gitignoreWarning) {
    lines.push("");
    lines.push(
      c(
        YELLOW,
        "  Warning: .safe-change/ is not in .gitignore. Consider adding it to avoid committing tool state."
      )
    );
  }

  lines.push("");
  return lines.join("\n");
}

// -- Render check report -----------------------------------------------------

export function renderCheckReport(
  format: OutputFormat,
  report: CheckReport
): string {
  if (format === "json") {
    return JSON.stringify(report, null, 2);
  }

  const lines: string[] = [];
  lines.push("");
  lines.push(
    c(BOLD, `Baseline: ${sanitize(report.baseline.description)}`)
  );
  lines.push(
    c(DIM, `  Created: ${report.baseline.createdAt}`)
  );
  lines.push("");

  // Config drift warning
  if (report.configDrift.detected) {
    lines.push(c(YELLOW, "  Configuration drift detected:"));
    lines.push(c(YELLOW, `  ${sanitize(report.configDrift.message)}`));
    lines.push("");
  }

  // Check results table
  if (report.results.length > 0) {
    const nameWidth = Math.max(
      ...report.results.map((r) => r.name.length),
      5
    );
    const header = `  ${"Check".padEnd(nameWidth)}  ${"Before".padEnd(
      8
    )}  ${"Now".padEnd(8)}  Result`;
    lines.push(c(BOLD, header));
    lines.push(`  ${"─".repeat(nameWidth + 30)}`);

    for (const r of report.results) {
      const resultText = formatResultLabel(r.result);
      const beforeText = r.before ?? "n/a";
      const nowText = r.now ?? "n/a";
      const line = `  ${sanitize(r.name).padEnd(nameWidth)}  ${beforeText.padEnd(
        8
      )}  ${nowText.padEnd(8)}  ${resultText}`;
      lines.push(colorizeResultLine(line, r.result));
    }

    lines.push("");
  } else {
    lines.push(c(DIM, "  No checks configured."));
    lines.push("");
  }

  // File changes
  lines.push(c(BOLD, "  Files:"));
  const fc = report.files;
  if (fc.added.length > 0) {
    lines.push(c(GREEN, `    Added:     ${fc.added.length}`));
  }
  if (fc.modified.length > 0) {
    lines.push(c(YELLOW, `    Modified:  ${fc.modified.length}`));
  }
  if (fc.deleted.length > 0) {
    lines.push(c(RED, `    Deleted:   ${fc.deleted.length}`));
  }
  lines.push(c(DIM, `    Unchanged: ${fc.unchangedCount}`));
  lines.push("");

  // Summary
  const s = report.summary;
  if (s.newFailures > 0) {
    lines.push(
      c(
        RED,
        `  NEW FAILURES: ${s.newFailures} check(s) that previously passed now fail.`
      )
    );
  }
  if (s.fixed > 0) {
    lines.push(
      c(GREEN, `  Fixed: ${s.fixed} check(s) that previously failed now pass.`)
    );
  }
  if (s.stillFailing > 0) {
    lines.push(
      c(
        YELLOW,
        `  Still failing: ${s.stillFailing} check(s) failed before and still fail.`
      )
    );
  }
  if (s.stillPassing > 0) {
    lines.push(
      c(DIM, `  Still passing: ${s.stillPassing} check(s) continue to pass.`)
    );
  }
  if (report.results.length === 0) {
    lines.push(
      c(
        YELLOW,
        "  No verification checks were configured. File changes were tracked but no behavior was verified."
      )
    );
  }

  lines.push("");
  lines.push(
    c(
      DIM,
      `  Exit code: ${report.exitCode} (${
        report.exitCode === 0 ? "no new regressions" : "new regressions detected"
      })`
    )
  );
  lines.push(
    c(
      DIM,
      "  Note: a passing check proves only that its configured command succeeded. Unchecked behavior remains unverified."
    )
  );
  lines.push("");

  return lines.join("\n");
}

// -- Render diff output ------------------------------------------------------

export function renderDiffSummary(
  format: OutputFormat,
  diff: DiffSummary,
  baseline: Baseline | null
): string {
  if (format === "json") {
    return JSON.stringify(
      {
        baseline: baseline
          ? {
              createdAt: baseline.createdAt,
              description: baseline.description,
            }
          : null,
        files: diff.files,
        linesAdded: diff.totalLinesAdded,
        linesRemoved: diff.totalLinesRemoved,
        truncated: diff.truncated,
      },
      null,
      2
    );
  }

  const lines: string[] = [];
  lines.push("");

  if (baseline) {
    lines.push(
      c(BOLD, `Baseline: ${sanitize(baseline.description)}`)
    );
    lines.push(c(DIM, `  Created: ${baseline.createdAt}`));
    lines.push("");
  }

  // File changes
  const fc = diff.files;
  lines.push(c(BOLD, "  Change summary:"));
  if (fc.added.length > 0) {
    lines.push(c(GREEN, `    Added:     ${fc.added.length}`));
    for (const f of fc.added.slice(0, 20)) {
      lines.push(c(GREEN, `      + ${sanitize(f)}`));
    }
    if (fc.added.length > 20) {
      lines.push(c(DIM, `      ... and ${fc.added.length - 20} more`));
    }
  }
  if (fc.modified.length > 0) {
    lines.push(c(YELLOW, `    Modified:  ${fc.modified.length}`));
    for (const f of fc.modified.slice(0, 20)) {
      lines.push(c(YELLOW, `      ~ ${sanitize(f)}`));
    }
    if (fc.modified.length > 20) {
      lines.push(c(DIM, `      ... and ${fc.modified.length - 20} more`));
    }
  }
  if (fc.deleted.length > 0) {
    lines.push(c(RED, `    Deleted:   ${fc.deleted.length}`));
    for (const f of fc.deleted.slice(0, 20)) {
      lines.push(c(RED, `      - ${sanitize(f)}`));
    }
    if (fc.deleted.length > 20) {
      lines.push(c(DIM, `      ... and ${fc.deleted.length - 20} more`));
    }
  }

  lines.push("");
  lines.push(
    `  Lines: ${c(GREEN, `+${diff.totalLinesAdded}`)} ${c(
      RED,
      `-${diff.totalLinesRemoved}`
    )}`
  );

  if (diff.truncated) {
    lines.push("");
    lines.push(
      c(
        YELLOW,
        "  Output truncated. Run 'git diff HEAD' for the complete diff."
      )
    );
  } else {
    lines.push("");
    lines.push(
      c(DIM, "  Run 'git diff HEAD' for the complete patch output.")
    );
  }

  lines.push("");

  return lines.join("\n");
}

// -- Render errors -----------------------------------------------------------

export function renderError(
  format: OutputFormat,
  message: string,
  exitCode: number
): string {
  if (format === "json") {
    return JSON.stringify({ error: message, exitCode }, null, 2);
  }
  return `\n${c(RED, `  Error: ${sanitize(message)}`)}\n`;
}

// -- Helpers -----------------------------------------------------------------

function formatResultLabel(result: string): string {
  switch (result) {
    case "pass-pass":
      return "unchanged";
    case "pass-fail":
      return "NEW FAILURE";
    case "pass-timeout":
      return "NEW TIMEOUT";
    case "fail-pass":
      return "fixed";
    case "fail-fail":
      return "still failing";
    case "fail-timeout":
      return "still failing (timeout)";
    case "timeout-pass":
      return "fixed (was timeout)";
    case "timeout-fail":
      return "still failing (was timeout)";
    case "timeout-timeout":
      return "still timing out";
    case "config-removed":
      return "removed from config";
    case "config-added":
      return "new check (no baseline)";
    default:
      return result;
  }
}

function colorizeResultLine(
  line: string,
  result: string
): string {
  switch (result) {
    case "pass-pass":
      return c(DIM, line);
    case "pass-fail":
    case "pass-timeout":
      return c(RED, line);
    case "fail-pass":
    case "timeout-pass":
      return c(GREEN, line);
    case "fail-fail":
    case "fail-timeout":
    case "timeout-fail":
    case "timeout-timeout":
      return c(YELLOW, line);
    case "config-removed":
    case "config-added":
      return c(CYAN, line);
    default:
      return line;
  }
}
