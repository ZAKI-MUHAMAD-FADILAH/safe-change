// ---------------------------------------------------------------------------
// safe-change -- Public API entry point
// ---------------------------------------------------------------------------


export type {
  SafeChangeConfig,
  CheckDefinition,
  FileStatus,
  FileEntry,
  GitState,
  CheckResult,
  Baseline,
  CheckComparisonResult,
  CheckComparison,
  ConfigDrift,
  FileChanges,
  CheckReportSummary,
  CheckReport,
  DiffSummary,
  ExitCode,
  OutputFormat,
} from "./types/index.js";

export { ExitCodes } from "./types/index.js";
export { loadConfig, ConfigError } from "./config/loader.js";
export { loadBaseline, saveBaseline, computeConfigHash, BaselineError } from "./baseline/manager.js";
export { getRepositoryRoot, getGitState, getFileEntries, getDiffText, GitError } from "./git/inspector.js";
export { executeCheck, executeAllChecks } from "./runner/executor.js";
export { compareChecks, compareFiles, buildReport, detectConfigDrift } from "./comparator/engine.js";
