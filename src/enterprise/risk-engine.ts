import type {
  BudgetViolation,
  ChangeBudget,
  ChangeMetrics,
  EnterpriseAssessment,
  EnterpriseMode,
  EnterprisePolicy,
  FileChanges,
  RiskCategory,
  RiskSignal,
} from "../types/index.js";
import { maxMode } from "./policy.js";

const WEIGHTS: Readonly<Record<RiskCategory, number>> = {
  documentation: 2,
  test: 3,
  source: 10,
  dependency: 15,
  ci: 20,
  "file-deletion": 25,
  authentication: 30,
  migration: 35,
  release: 40,
  "guardrail-downgrade": 50,
};

const LOCKFILE_PATTERN =
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|Pipfile\.lock|go\.sum)$/i;
const DOC_PATTERN = /(^|\/)(docs?\/|[^/]+\.(md|mdx|rst|txt)$)/i;
const TEST_PATTERN = /(^|\/)(__tests__|tests?|specs?)\/|(\.test|\.spec)\.[^/]+$/i;
const SOURCE_PATTERN =
  /(^|\/)(src|lib|app|packages|crates)\/|\.(ts|tsx|js|jsx|mjs|cjs|rs|go|py|java|kt|swift|cs|cpp|c|h)$/i;
const DEPENDENCY_PATTERN =
  /(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.(toml|lock)|pyproject\.toml|poetry\.lock|requirements[^/]*\.txt|Pipfile(\.lock)?|go\.(mod|sum))$/i;
const CI_PATTERN = /(^|\/)(\.github\/workflows|\.gitlab-ci|Jenkinsfile|azure-pipelines|buildkite|circleci)(\/|\.|$)/i;
const AUTH_PATTERN =
  /(^|\/)(auth|authentication|authorization|permissions?|rbac|oauth|oidc|session|token)(\/|[-_.])/i;
const MIGRATION_PATTERN = /(^|\/)(migrations?|schema)(\/|[-_.])/i;
const RELEASE_PATTERN =
  /(^|\/)(release|publish|deployment|provenance|sbom)(\/|[-_.])|(^|\/)(CHANGELOG|package\.json|Cargo\.toml)$/i;

const DOWNGRADE_PATTERNS: readonly RegExp[] = [
  /^\+.*\bcontinue-on-error\s*:\s*true\b/im,
  /^\+.*\b(test|describe|it)\.(skip|todo)\b/im,
  /^\+.*\b--force\b.*\bpush\b/im,
  /^\+.*\bcoverage\b.*\b(threshold|minimum|min)\b.*(?:decreas|lower|[=:]\s*0)\b/im,
  /^-.*\b(assert|expect)\s*[\.(]/im,
  /^\+.*\b(CodeQL|security|provenance|required checks?)\b.*\b(disable|false|off|skip)\b/im,
  /^\+.*uses:\s*[^@\s]+@(main|master|latest|v\d+)\s*$/im,
];

export interface AssessChangeInput {
  readonly files: FileChanges;
  readonly linesAdded: number;
  readonly linesDeleted: number;
  readonly diffText?: string;
  readonly policy: EnterprisePolicy;
  readonly hasBaseline: boolean;
  readonly configuredCheckNames?: readonly string[];
}

export function modeForRisk(score: number): EnterpriseMode {
  if (score >= 80) return "critical-change";
  if (score >= 50) return "high-assurance";
  if (score >= 20) return "enhanced";
  return "standard";
}

function classifyPaths(
  paths: readonly string[],
  deleted: readonly string[],
  diffText: string
): RiskSignal[] {
  const signals: RiskSignal[] = [];
  const add = (
    category: RiskCategory,
    matching: readonly string[],
    reason: string
  ): void => {
    if (matching.length > 0 || category === "guardrail-downgrade") {
      signals.push({
        category,
        score: WEIGHTS[category],
        paths: [...new Set(matching)].sort(),
        reason,
      });
    }
  };

  add("documentation", paths.filter((path) => DOC_PATTERN.test(path)), "Documentation changed.");
  add("test", paths.filter((path) => TEST_PATTERN.test(path)), "Test code changed.");
  add("source", paths.filter((path) => SOURCE_PATTERN.test(path)), "Source code changed.");
  add("dependency", paths.filter((path) => DEPENDENCY_PATTERN.test(path)), "Dependency metadata or lockfiles changed.");
  add("ci", paths.filter((path) => CI_PATTERN.test(path)), "CI or build automation changed.");
  add("file-deletion", deleted, "Files were deleted.");
  add("authentication", paths.filter((path) => AUTH_PATTERN.test(path)), "Authentication, authorization, or permission boundary changed.");
  add("migration", paths.filter((path) => MIGRATION_PATTERN.test(path)), "Migration or schema path changed.");
  add("release", paths.filter((path) => RELEASE_PATTERN.test(path)), "Release or publication surface changed.");

  if (DOWNGRADE_PATTERNS.some((pattern) => pattern.test(diffText))) {
    add(
      "guardrail-downgrade",
      paths.filter((path) => CI_PATTERN.test(path) || TEST_PATTERN.test(path)),
      "Diff contains a potential test, CI, coverage, provenance, or immutable-reference downgrade."
    );
  }

  return signals;
}

function countPublicApiChanges(diffText: string): number {
  const matches = diffText.match(
    /^[+-]\s*(export\s+(default\s+)?(async\s+)?(class|function|const|let|var|interface|type|enum)|pub\s+(fn|struct|enum|trait|mod)|public\s+)/gm
  );
  return matches?.length ?? 0;
}

export function evaluateChangeBudget(
  metrics: ChangeMetrics,
  budget: ChangeBudget
): BudgetViolation[] {
  const violations: BudgetViolation[] = [];
  const compare = (
    field: keyof ChangeBudget,
    actual: number,
    allowed: number
  ): void => {
    if (actual > allowed) {
      violations.push({
        field,
        actual,
        allowed,
        message: `${field} is ${actual}; allowed maximum is ${allowed}.`,
      });
    }
  };

  compare("maxFilesChanged", metrics.filesChanged, budget.maxFilesChanged);
  compare("maxLinesAdded", metrics.linesAdded, budget.maxLinesAdded);
  compare("maxLinesDeleted", metrics.linesDeleted, budget.maxLinesDeleted);
  compare("maxPublicApisChanged", metrics.publicApisChanged, budget.maxPublicApisChanged);
  compare("maxDeletedFiles", metrics.filesDeleted, budget.maxDeletedFiles);
  if (!budget.allowLockfileChanges && metrics.lockfilesChanged.length > 0) {
    violations.push({
      field: "allowLockfileChanges",
      actual: true,
      allowed: false,
      message: `Lockfile changes are not allowed: ${metrics.lockfilesChanged.join(", ")}.`,
    });
  }

  return violations;
}

export function assessChange(input: AssessChangeInput): EnterpriseAssessment {
  const paths = [
    ...input.files.added,
    ...input.files.modified,
    ...input.files.deleted,
  ];
  const diffText = input.diffText ?? "";
  const signals = classifyPaths(paths, input.files.deleted, diffText);
  const riskScore = Math.min(
    100,
    signals.reduce((total, signal) => total + signal.score, 0)
  );
  const automaticMode = modeForRisk(riskScore);
  const requiredMode = maxMode(automaticMode, input.policy.minimumMode);
  const metrics: ChangeMetrics = {
    filesChanged: paths.length,
    filesDeleted: input.files.deleted.length,
    linesAdded: input.linesAdded,
    linesDeleted: input.linesDeleted,
    publicApisChanged: countPublicApiChanges(diffText),
    lockfilesChanged: paths.filter((path) => LOCKFILE_PATTERN.test(path)).sort(),
  };
  const budgetViolations = evaluateChangeBudget(
    metrics,
    input.policy.changeBudget
  );
  const configuredChecks = input.configuredCheckNames ?? [];
  const blockers: string[] = [];

  if (input.policy.requireBaseline && !input.hasBaseline) {
    blockers.push("A baseline is required but none is available.");
  }
  if (
    input.policy.requireTests &&
    !configuredChecks.some((name) => /test|spec/i.test(name))
  ) {
    blockers.push("A test check is required but no test-like check is configured.");
  }
  if (
    input.policy.requireCoverage &&
    !configuredChecks.some((name) => /coverage/i.test(name))
  ) {
    blockers.push("Coverage is required but no coverage-like check is configured.");
  }
  if (
    input.policy.requireDependencyAudit &&
    !configuredChecks.some((name) => /audit|depend|supply|sbom/i.test(name))
  ) {
    blockers.push("Dependency audit is required but no audit-like check is configured.");
  }
  if (signals.some((signal) => signal.category === "guardrail-downgrade")) {
    blockers.push("Potential policy downgrade requires explicit approval and high-assurance review.");
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    riskScore,
    automaticMode,
    requiredMode,
    signals,
    metrics,
    budgetPassed: budgetViolations.length === 0,
    budgetViolations,
    policyBlockers: blockers,
    approvalRequired:
      budgetViolations.length > 0 ||
      blockers.length > 0 ||
      requiredMode === "critical-change",
    verificationState: "not-verified",
    evidenceLimitations: [
      "Assessment classifies change risk and policy conformance; it does not execute verification checks.",
      "Line and public API metrics cover Git diff text and may exclude untracked file contents.",
    ],
  };
}