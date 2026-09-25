// ---------------------------------------------------------------------------
// safe-change -- Core type definitions
// ---------------------------------------------------------------------------

// -- Configuration -----------------------------------------------------------

export interface CheckDefinition {
  readonly name: string;
  readonly executable: string;
  readonly args: readonly string[];
  readonly timeout: number; // seconds
}

export interface SafeChangeConfig {
  readonly version: number;
  readonly checks: readonly CheckDefinition[];
}

// -- Git state ---------------------------------------------------------------

export type FileStatus =
  | "clean"
  | "modified"
  | "staged"
  | "untracked"
  | "deleted";

export interface FileEntry {
  readonly tracked: boolean;
  readonly status: FileStatus;
  readonly worktreeHash: string | null; // sha256 hex, null if deleted
  readonly indexHash: string | null; // sha256 hex, null if untracked or deleted from index
}

export interface GitState {
  readonly repositoryRoot: string;
  readonly headCommit: string | null;
  readonly headBranch: string | null;
  readonly isClean: boolean;
}

// -- Check execution result --------------------------------------------------

export interface CheckResult {
  readonly name: string;
  readonly executable: string;
  readonly args: readonly string[];
  readonly exitCode: number | null; // null if killed/timeout before exit
  readonly passed: boolean;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly outputBytes: number;
  readonly outputTruncated: boolean;
  readonly stdout: string; // bounded capture for diagnostic display
  readonly stderr: string; // bounded capture for diagnostic display
}

// -- Baseline ----------------------------------------------------------------

export interface Baseline {
  readonly schemaVersion: 2;
  readonly createdAt: string; // ISO-8601
  readonly description: string;
  readonly git: GitState;
  readonly files: Readonly<Record<string, FileEntry>>;
  readonly excludedPaths: readonly string[];
  readonly checks: readonly CheckResult[];
  readonly checksConfigHash: string;
}

// -- Comparison results ------------------------------------------------------

export type CheckComparisonResult =
  | "pass-pass"
  | "pass-fail"
  | "pass-timeout"
  | "fail-pass"
  | "fail-fail"
  | "fail-timeout"
  | "timeout-pass"
  | "timeout-fail"
  | "timeout-timeout"
  | "config-removed"
  | "config-added"
  | "definition-changed";

export interface CheckComparison {
  readonly name: string;
  readonly before: "pass" | "fail" | "timeout" | null;
  readonly now: "pass" | "fail" | "timeout" | null;
  readonly result: CheckComparisonResult;
  readonly durationMs: number | null;
  readonly timedOut: boolean;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode?: number | null;
}

export interface ConfigDrift {
  readonly detected: boolean;
  readonly removedChecks: readonly string[];
  readonly addedChecks: readonly string[];
  readonly changedChecks: readonly string[];
  readonly message: string;
}

export interface FileChanges {
  readonly added: readonly string[];
  readonly modified: readonly string[];
  readonly deleted: readonly string[];
  readonly unchangedCount: number;
}

export interface CheckReportSummary {
  readonly newFailures: number;
  readonly fixed: number;
  readonly stillFailing: number;
  readonly stillPassing: number;
  readonly configDrift: boolean;
  readonly definitionChanged: number;
}

export interface CheckReport {
  readonly schemaVersion: 2;
  readonly generatedAt: string;
  readonly baseline: {
    readonly createdAt: string;
    readonly description: string;
  };
  readonly configDrift: ConfigDrift;
  readonly results: readonly CheckComparison[];
  readonly files: FileChanges;
  readonly summary: CheckReportSummary;
  readonly exitCode: number;
}

// -- Diff output -------------------------------------------------------------

export interface DiffSummary {
  readonly files: FileChanges;
  readonly hasBaseline: boolean;
  readonly totalLinesAdded: number;
  readonly totalLinesRemoved: number;
  readonly truncated: boolean;
  readonly diffText: string;
}

// -- Exit codes --------------------------------------------------------------

export const ExitCodes = {
  OK: 0,
  NEW_FAILURE: 1,
  NO_BASELINE: 2,
  CONFIG_ERROR: 3,
  NOT_GIT_REPO: 4,
  INTERNAL_ERROR: 5,
} as const;

export type ExitCode = (typeof ExitCodes)[keyof typeof ExitCodes];

// -- Output format -----------------------------------------------------------

export type OutputFormat = "terminal" | "json";
