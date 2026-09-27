import type {
  SafeChangeRule,
  FileChanges,
  CheckComparison,
  CheckResult,
  RuleViolation,
  RuleEvaluationResult,
} from "../types/index.js";

/**
 * Convert a glob pattern to a regular expression.
 * Handles **, *, and ? with platform-aware or configurable case-sensitivity.
 */
export function globToRegex(pattern: string, caseSensitive?: boolean): RegExp {
  const isCaseSensitive = caseSensitive ?? process.platform !== "win32";
  const normalized = pattern.replace(/\\/g, "/");

  let regexStr = "^";
  let i = 0;

  if (normalized.startsWith("**/")) {
    regexStr += "(?:.*\\/)?";
    i = 3;
  }

  while (i < normalized.length) {
    const char = normalized[i];
    if (char === undefined) break;

    if (char === "*" && normalized[i + 1] === "*") {
      if (normalized[i + 2] === "/") {
        regexStr += "(?:.*\\/)?";
        i += 3;
      } else {
        regexStr += ".*";
        i += 2;
      }
    } else if (char === "*") {
      regexStr += "[^\\/]*";
      i++;
    } else if (char === "?") {
      regexStr += "[^\\/]";
      i++;
    } else if (["[", "]", "(", ")", "{", "}", "+", ".", "^", "$", "|"].includes(char)) {
      regexStr += "\\" + char;
      i++;
    } else {
      regexStr += char;
      i++;
    }
  }

  regexStr += "$";
  return new RegExp(regexStr, isCaseSensitive ? "" : "i");
}

/**
 * Match a file path against a glob pattern.
 */
export function matchGlob(
  filePath: string,
  pattern: string,
  caseSensitive?: boolean
): boolean {
  const normalizedPath = filePath.replace(/\\/g, "/").replace(/^\.\//, "");
  const regex = globToRegex(pattern, caseSensitive);
  return regex.test(normalizedPath);
}

/**
 * Evaluate safety rules against repository changes and check results.
 */
export function evaluateRules(
  rules: readonly SafeChangeRule[],
  files: FileChanges,
  checkResults: readonly (CheckComparison | CheckResult)[] = []
): RuleEvaluationResult {
  const violations: RuleViolation[] = [];

  for (const rule of rules) {
    const { condition } = rule;

    switch (condition.type) {
      case "file-not-deleted": {
        const patterns = condition.patterns ?? (condition.pattern ? [condition.pattern] : []);
        const matchedDeletions = files.deleted.filter((deletedFile) =>
          patterns.some((pat) => matchGlob(deletedFile, pat))
        );

        if (matchedDeletions.length > 0) {
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            message: `Deleted protected file(s): ${matchedDeletions.join(", ")}`,
            details: matchedDeletions,
          });
        }
        break;
      }

      case "file-not-modified": {
        const patterns = condition.patterns ?? (condition.pattern ? [condition.pattern] : []);
        const matchedModifications = files.modified.filter((modFile) =>
          patterns.some((pat) => matchGlob(modFile, pat))
        );

        if (matchedModifications.length > 0) {
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            message: `Modified protected file(s): ${matchedModifications.join(", ")}`,
            details: matchedModifications,
          });
        }
        break;
      }

      case "max-files-changed": {
        const threshold = condition.threshold ?? 50;
        const totalChanged = files.added.length + files.modified.length + files.deleted.length;

        if (totalChanged > threshold) {
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            message: `Total changed files (${totalChanged}) exceeds configured limit of ${threshold}`,
            details: [
              `Added: ${files.added.length}`,
              `Modified: ${files.modified.length}`,
              `Deleted: ${files.deleted.length}`,
            ],
          });
        }
        break;
      }

      case "max-deleted-files": {
        const threshold = condition.threshold ?? 10;
        const deletedCount = files.deleted.length;

        if (deletedCount > threshold) {
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            message: `Deleted files count (${deletedCount}) exceeds limit of ${threshold}`,
            details: files.deleted,
          });
        }
        break;
      }

      case "require-check-pass": {
        const requiredName = (condition.checkName ?? "test").toLowerCase();
        const matchedCheck = checkResults.find((c) =>
          c.name.toLowerCase().includes(requiredName)
        );

        if (!matchedCheck) {
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            message: `Required check "${condition.checkName ?? "test"}" was not found in verification checks`,
          });
        } else {
          let passed = false;
          if ("result" in matchedCheck) {
            // CheckComparison
            passed =
              matchedCheck.result === "pass-pass" ||
              matchedCheck.result === "fail-pass";
          } else if ("passed" in matchedCheck) {
            // CheckResult
            passed = matchedCheck.passed === true;
          }

          if (!passed) {
            violations.push({
              ruleId: rule.id,
              ruleName: rule.name,
              severity: rule.severity,
              message: `Required check "${matchedCheck.name}" did not pass verification`,
            });
          }
        }
        break;
      }
    }
  }

  const errorCount = violations.filter((v) => v.severity === "error").length;
  const warningCount = violations.filter((v) => v.severity === "warn").length;

  return {
    passed: errorCount === 0,
    violations,
    errorCount,
    warningCount,
  };
}
