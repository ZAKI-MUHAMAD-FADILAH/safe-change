// safe-change -- A local-first safety net for AI-assisted coding.
// Copyright (c) 2026 ZACK.PRATAMA PT ZYNTRIX ARTIFICIAL INTELIGENCE INDONESIA (SAFE-CHANGE)
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.


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
