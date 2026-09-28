import type { EnterpriseAssessment, OutputFormat } from "../types/index.js";
import { ExitCodes } from "../types/index.js";
import { getRepositoryRoot, getFileEntries, getDiffText } from "../git/inspector.js";
import { loadBaseline } from "../baseline/manager.js";
import { compareFiles } from "../comparator/engine.js";
import { loadConfig, ConfigError } from "../config/loader.js";
import { DEFAULT_ENTERPRISE_POLICY } from "../enterprise/policy.js";
import { assessChange } from "../enterprise/risk-engine.js";

export interface AssessOptions {
  readonly format: OutputFormat;
}

function renderTerminal(assessment: EnterpriseAssessment): string {
  const lines = [
    "",
    "  Enterprise Change Assessment",
    `  Risk: ${assessment.riskScore}/100`,
    `  Automatic mode: ${assessment.automaticMode}`,
    `  Required mode: ${assessment.requiredMode}`,
    `  Change budget: ${assessment.budgetPassed ? "PASS" : "EXCEEDED"}`,
    `  Approval required: ${assessment.approvalRequired ? "YES" : "NO"}`,
    "  Verification state: NOT VERIFIED (assessment does not run checks)",
  ];
  if (assessment.signals.length > 0) {
    lines.push("", "  Risk signals:");
    for (const signal of assessment.signals) {
      lines.push(
        `    +${signal.score} ${signal.category}: ${signal.reason} (${signal.paths.length} path(s))`
      );
    }
  }
  if (assessment.budgetViolations.length > 0) {
    lines.push("", "  Budget violations:");
    for (const violation of assessment.budgetViolations) {
      lines.push(`    - ${violation.message}`);
    }
  }
  if (assessment.policyBlockers.length > 0) {
    lines.push("", "  Policy blockers:");
    for (const blocker of assessment.policyBlockers) {
      lines.push(`    - ${blocker}`);
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export async function runAssess(options: AssessOptions): Promise<number> {
  let repoRoot: string;
  try {
    repoRoot = await getRepositoryRoot(process.cwd());
  } catch {
    process.stderr.write("Not a Git repository. safe-change requires a Git repository.\n");
    return ExitCodes.NOT_GIT_REPO;
  }

  let config;
  try {
    config = await loadConfig(repoRoot);
  } catch (error: unknown) {
    const message =
      error instanceof ConfigError ? error.message : `Failed to load configuration: ${String(error)}`;
    process.stderr.write(
      options.format === "json"
        ? `${JSON.stringify({ error: message, exitCode: ExitCodes.CONFIG_ERROR }, null, 2)}\n`
        : `${message}\n`
    );
    return ExitCodes.CONFIG_ERROR;
  }

  const [currentFiles, diff, baseline] = await Promise.all([
    getFileEntries(repoRoot),
    getDiffText(repoRoot),
    loadBaseline(repoRoot).catch(() => null),
  ]);
  const files = baseline
    ? compareFiles(baseline.files, currentFiles)
    : {
        added: Object.entries(currentFiles)
          .filter(([, entry]) => entry.status === "untracked")
          .map(([path]) => path),
        modified: Object.entries(currentFiles)
          .filter(([, entry]) => entry.status === "modified" || entry.status === "staged")
          .map(([path]) => path),
        deleted: Object.entries(currentFiles)
          .filter(([, entry]) => entry.status === "deleted")
          .map(([path]) => path),
        unchangedCount: 0,
      };

  const assessment = assessChange({
    files,
    linesAdded: diff.linesAdded,
    linesDeleted: diff.linesRemoved,
    diffText: diff.text,
    policy: config.enterprisePolicy ?? DEFAULT_ENTERPRISE_POLICY,
    hasBaseline: baseline !== null,
    configuredCheckNames: config.checks.map((check) => check.name),
  });
  process.stdout.write(
    options.format === "json"
      ? `${JSON.stringify(assessment, null, 2)}\n`
      : renderTerminal(assessment)
  );

  return assessment.approvalRequired
    ? ExitCodes.NEW_FAILURE
    : ExitCodes.OK;
}