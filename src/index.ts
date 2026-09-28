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
  LogEntry,
  LogCheckResult,
  LogFileSummary,
  CheckLogResult,
  CheckLogState,
  SafeChangeRule,
  RuleSeverity,
  RuleCondition,
  RuleConditionType,
  RulesConfigFile,
  RuleViolation,
  RuleEvaluationResult,
  EnterpriseMode,
  ChangeBudget,
  EnterprisePolicy,
  RiskCategory,
  RiskSignal,
  ChangeMetrics,
  BudgetViolation,
  EnterpriseAssessment,
} from "./types/index.js";

export { ExitCodes } from "./types/index.js";
export { loadConfig, ConfigError } from "./config/loader.js";
export { loadBaseline, saveBaseline, computeConfigHash, BaselineError } from "./baseline/manager.js";
export { getRepositoryRoot, getGitState, getFileEntries, getDiffText, GitError } from "./git/inspector.js";
export { executeCheck, executeAllChecks } from "./runner/executor.js";
export { compareChecks, compareFiles, buildReport, detectConfigDrift } from "./comparator/engine.js";
export {
  appendEntry,
  readEntries,
  pruneToRetention,
  clearLog,
  exportLog,
  createLogEntry,
  updateLastEntry,
} from "./log/log-manager.js";
export {
  startDashboardServer,
  createDashboardServer,
  openBrowser,
  type DashboardServerOptions,
  type DashboardServerInstance,
} from "./dashboard/server.js";
export {
  BUILT_IN_RULES,
  getBuiltInRule,
  getAllBuiltInRules,
} from "./rules/built-in.js";
export {
  loadRules,
  saveRules,
  addRule,
  removeRule,
  validateRule,
} from "./rules/manager.js";
export {
  matchGlob,
  globToRegex,
  evaluateRules,
} from "./rules/engine.js";
export {
  DEFAULT_CHANGE_BUDGET,
  DEFAULT_ENTERPRISE_POLICY,
  ENTERPRISE_MODES,
  maxMode,
} from "./enterprise/policy.js";
export {
  assessChange,
  evaluateChangeBudget,
  modeForRisk,
  type AssessChangeInput,
} from "./enterprise/risk-engine.js";
