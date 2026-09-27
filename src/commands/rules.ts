import type { OutputFormat, SafeChangeRule } from "../types/index.js";
import { ExitCodes } from "../types/index.js";
import { getRepositoryRoot, getFileEntries } from "../git/inspector.js";
import { loadBaseline } from "../baseline/manager.js";
import { loadRules, addRule, removeRule, validateRule } from "../rules/manager.js";
import { getAllBuiltInRules } from "../rules/built-in.js";
import { evaluateRules } from "../rules/engine.js";
import { renderError } from "../output/renderer.js";

export interface RulesCommandOptions {
  readonly action: "list" | "add" | "remove" | "validate";
  readonly target?: string;
  readonly format: OutputFormat;
}

export async function runRules(options: RulesCommandOptions): Promise<number> {
  const { action, target, format } = options;

  let repoRoot: string;
  try {
    repoRoot = await getRepositoryRoot(process.cwd());
  } catch {
    process.stderr.write(
      renderError(
        format,
        "Not a Git repository. safe-change requires a Git repository.",
        ExitCodes.NOT_GIT_REPO
      )
    );
    return ExitCodes.NOT_GIT_REPO;
  }

  switch (action) {
    case "list": {
      const activeRules = await loadRules(repoRoot);
      const allBuiltIns = getAllBuiltInRules();
      const activeIds = new Set(activeRules.map((r) => r.id));
      const availableBuiltIns = allBuiltIns.filter((r) => !activeIds.has(r.id));

      if (format === "json") {
        process.stdout.write(
          JSON.stringify(
            {
              activeRules,
              availableBuiltIns,
            },
            null,
            2
          ) + "\n"
        );
        return ExitCodes.OK;
      }

      process.stdout.write("\nActive Safety Rules:\n");
      if (activeRules.length === 0) {
        process.stdout.write("  No active rules. Run \"safe-change rules add <id>\" to enable one.\n");
      } else {
        for (const r of activeRules) {
          const conditionSummary = r.condition.pattern
            ? `pattern: ${r.condition.pattern}`
            : r.condition.patterns
            ? `patterns: [${r.condition.patterns.join(", ")}]`
            : r.condition.threshold !== undefined
            ? `threshold: ${r.condition.threshold}`
            : r.condition.checkName
            ? `check: ${r.condition.checkName}`
            : r.condition.type;

          process.stdout.write(
            `  * [${r.severity.toUpperCase()}] ${r.name} (${r.id})\n` +
            `    ${r.description}\n` +
            `    Condition: ${r.condition.type} (${conditionSummary})\n\n`
          );
        }
      }

      if (availableBuiltIns.length > 0) {
        process.stdout.write("Available Built-in Rules:\n");
        for (const b of availableBuiltIns) {
          process.stdout.write(
            `  + ${b.id.padEnd(24)} [${b.severity}] ${b.name}\n` +
            `    ${b.description}\n`
          );
        }
        process.stdout.write("\n");
      }

      return ExitCodes.OK;
    }

    case "add": {
      if (!target || target.trim().length === 0) {
        process.stderr.write(
          renderError(
            format,
            'Missing rule identifier or file path. Usage: "safe-change rules add <id|file.json>"',
            ExitCodes.CONFIG_ERROR
          )
        );
        return ExitCodes.CONFIG_ERROR;
      }

      try {
        const added = await addRule(target.trim(), repoRoot);

        if (format === "json") {
          process.stdout.write(
            JSON.stringify(
              {
                success: true,
                rule: added,
              },
              null,
              2
            ) + "\n"
          );
        } else {
          process.stdout.write(
            `\nSafety rule activated:\n` +
            `  ID:          ${added.id}\n` +
            `  Name:        ${added.name}\n` +
            `  Severity:    ${added.severity.toUpperCase()}\n` +
            `  Description: ${added.description}\n\n`
          );
        }
        return ExitCodes.OK;
      } catch (err: unknown) {
        process.stderr.write(
          renderError(
            format,
            err instanceof Error ? err.message : String(err),
            ExitCodes.CONFIG_ERROR
          )
        );
        return ExitCodes.CONFIG_ERROR;
      }
    }

    case "remove": {
      if (!target || target.trim().length === 0) {
        process.stderr.write(
          renderError(
            format,
            'Missing rule identifier. Usage: "safe-change rules remove <id>"',
            ExitCodes.CONFIG_ERROR
          )
        );
        return ExitCodes.CONFIG_ERROR;
      }

      const removed = await removeRule(target.trim(), repoRoot);

      if (format === "json") {
        process.stdout.write(
          JSON.stringify(
            {
              success: removed,
              ruleId: target.trim(),
            },
            null,
            2
          ) + "\n"
        );
      } else {
        if (removed) {
          process.stdout.write(`\nRemoved safety rule "${target.trim()}".\n\n`);
        } else {
          process.stdout.write(`\nRule "${target.trim()}" is not active.\n\n`);
        }
      }

      return ExitCodes.OK;
    }

    case "validate": {
      const activeRules = await loadRules(repoRoot);
      const validationErrors: string[] = [];

      for (const rule of activeRules) {
        const val = validateRule(rule);
        if (!val.valid) {
          validationErrors.push(
            `Rule "${rule.id ?? "unknown"}": ${val.errors.join("; ")}`
          );
        }
      }

      if (validationErrors.length > 0) {
        process.stderr.write(
          renderError(
            format,
            `Rules configuration has errors:\n${validationErrors.map((e) => `  - ${e}`).join("\n")}`,
            ExitCodes.CONFIG_ERROR
          )
        );
        return ExitCodes.CONFIG_ERROR;
      }

      // Check current working tree against active rules if baseline exists
      let violations: ReturnType<typeof evaluateRules>["violations"] = [];
      try {
        const baseline = await loadBaseline(repoRoot);
        if (baseline && activeRules.length > 0) {
          const currentFiles = await getFileEntries(repoRoot);
          const baselineFiles = baseline.files;

          const added: string[] = [];
          const modified: string[] = [];
          const deleted: string[] = [];

          for (const [path, entry] of Object.entries(currentFiles)) {
            if (!(path in baselineFiles)) {
              added.push(path);
            } else if (entry.worktreeHash !== baselineFiles[path]?.worktreeHash) {
              modified.push(path);
            }
          }

          for (const path of Object.keys(baselineFiles)) {
            if (!(path in currentFiles) || currentFiles[path]?.status === "deleted") {
              deleted.push(path);
            }
          }

          const fileChanges = {
            added,
            modified,
            deleted,
            unchangedCount: Object.keys(currentFiles).length - added.length - modified.length,
          };

          const evaluation = evaluateRules(activeRules, fileChanges, baseline.checks);
          violations = evaluation.violations;
        }
      } catch {
        // Validation of file tree is auxiliary
      }

      if (format === "json") {
        process.stdout.write(
          JSON.stringify(
            {
              valid: true,
              activeRulesCount: activeRules.length,
              currentViolations: violations,
            },
            null,
            2
          ) + "\n"
        );
      } else {
        process.stdout.write(
          `\nRules configuration is valid (${activeRules.length} active rule${activeRules.length === 1 ? "" : "s"}).\n`
        );
        if (violations.length > 0) {
          process.stdout.write("\nCurrent workspace violations:\n");
          for (const v of violations) {
            process.stdout.write(
              `  [${v.severity.toUpperCase()}] ${v.ruleName} (${v.ruleId}): ${v.message}\n`
            );
          }
        }
        process.stdout.write("\n");
      }

      const hasErrorViolation = violations.some((v) => v.severity === "error");
      return hasErrorViolation ? ExitCodes.NEW_FAILURE : ExitCodes.OK;
    }

    default:
      process.stderr.write(
        renderError(
          format,
          `Unknown rules action: ${action}. Valid actions are list, add, remove, validate.`,
          ExitCodes.CONFIG_ERROR
        )
      );
      return ExitCodes.CONFIG_ERROR;
  }
}
