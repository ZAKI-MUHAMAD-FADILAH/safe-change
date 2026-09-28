import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { matchGlob, globToRegex, evaluateRules } from "../../src/rules/engine.js";
import {
  loadRules,
  saveRules,
  addRule,
  removeRule,
  validateRule,
  getRulesFilePath,
} from "../../src/rules/manager.js";
import { BUILT_IN_RULES, getBuiltInRule } from "../../src/rules/built-in.js";
import type { SafeChangeRule, FileChanges, CheckComparison } from "../../src/types/index.js";

describe("Rule engine & manager unit tests", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "safe-change-rules-unit-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("matchGlob matches simple filename and wildcard patterns", () => {
    expect(matchGlob("package.json", "package.json")).toBe(true);
    expect(matchGlob("package.json", "*.json")).toBe(true);
    expect(matchGlob("src/index.ts", "*.ts")).toBe(false);
    expect(matchGlob("test.js", "*.ts")).toBe(false);
  });

  it("matchGlob matches **/ prefix across root and arbitrary subdirectories", () => {
    expect(matchGlob("migrations/001.sql", "**/migrations/**")).toBe(true);
    expect(matchGlob("db/migrations/2026/001_init.sql", "**/migrations/**")).toBe(true);
    expect(matchGlob("src/components/button.tsx", "**/migrations/**")).toBe(false);
    expect(matchGlob(".env", "**/.env*")).toBe(true);
    expect(matchGlob(".env.local", "**/.env*")).toBe(true);
    expect(matchGlob("apps/backend/.env.production", "**/.env*")).toBe(true);
    expect(matchGlob("package-lock.json", "**/package-lock.json")).toBe(true);
    expect(matchGlob("sub/pkg/package-lock.json", "**/package-lock.json")).toBe(true);
  });

  it("globToRegex handles Windows vs Unix case-sensitivity properly", () => {
    const caseSensitiveRegex = globToRegex("**/README.md", true);
    const caseInsensitiveRegex = globToRegex("**/README.md", false);

    expect(caseSensitiveRegex.test("readme.md")).toBe(false);
    expect(caseSensitiveRegex.test("README.md")).toBe(true);
    expect(caseInsensitiveRegex.test("readme.md")).toBe(true);
  });

  it("evaluateRules detects violations for file-not-deleted", () => {
    const rule: SafeChangeRule = {
      id: "no-delete-migrations",
      name: "No Delete Migrations",
      description: "Prevent deletion of migrations",
      severity: "error",
      condition: {
        type: "file-not-deleted",
        pattern: "**/migrations/**",
      },
    };

    const files: FileChanges = {
      added: [],
      modified: [],
      deleted: ["db/migrations/001_init.sql", "src/temp.ts"],
      unchangedCount: 10,
    };

    const result = evaluateRules([rule], files);
    expect(result.passed).toBe(false);
    expect(result.errorCount).toBe(1);
    expect(result.warningCount).toBe(0);
    expect(result.violations[0]?.ruleId).toBe("no-delete-migrations");
    expect(result.violations[0]?.details).toContain("db/migrations/001_init.sql");
  });

  it("evaluateRules detects violations for file-not-modified with multiple patterns", () => {
    const rule: SafeChangeRule = {
      id: "no-modify-lockfile",
      name: "No Modify Lockfile",
      description: "Do not touch lockfile directly",
      severity: "warn",
      condition: {
        type: "file-not-modified",
        patterns: ["**/package-lock.json", "**/yarn.lock", "**/pnpm-lock.yaml"],
      },
    };

    const files: FileChanges = {
      added: [],
      modified: ["src/index.ts", "package-lock.json"],
      deleted: [],
      unchangedCount: 20,
    };

    const result = evaluateRules([rule], files);
    expect(result.passed).toBe(true); // Warnings do not fail overall passed state
    expect(result.warningCount).toBe(1);
    expect(result.errorCount).toBe(0);
    expect(result.violations[0]?.ruleId).toBe("no-modify-lockfile");
    expect(result.violations[0]?.severity).toBe("warn");
  });

  it("evaluateRules checks threshold for max-files-changed", () => {
    const rule: SafeChangeRule = {
      id: "max-files-changed",
      name: "Max Files Changed",
      description: "Limit changes",
      severity: "warn",
      condition: {
        type: "max-files-changed",
        threshold: 3,
      },
    };

    const compliantFiles: FileChanges = {
      added: ["a.ts"],
      modified: ["b.ts"],
      deleted: [],
      unchangedCount: 10,
    };

    const violatingFiles: FileChanges = {
      added: ["a.ts", "b.ts"],
      modified: ["c.ts"],
      deleted: ["d.ts"],
      unchangedCount: 10,
    };

    const okResult = evaluateRules([rule], compliantFiles);
    expect(okResult.passed).toBe(true);
    expect(okResult.violations).toHaveLength(0);

    const badResult = evaluateRules([rule], violatingFiles);
    expect(badResult.violations).toHaveLength(1);
    expect(badResult.violations[0]?.ruleId).toBe("max-files-changed");
    expect(badResult.warningCount).toBe(1);
  });

  it("evaluateRules checks threshold for max-deleted-files", () => {
    const rule: SafeChangeRule = {
      id: "max-deleted-files",
      name: "Max Deleted Files",
      description: "Limit deletions",
      severity: "error",
      condition: {
        type: "max-deleted-files",
        threshold: 2,
      },
    };

    const files: FileChanges = {
      added: [],
      modified: [],
      deleted: ["file1.txt", "file2.txt", "file3.txt"],
      unchangedCount: 5,
    };

    const result = evaluateRules([rule], files);
    expect(result.passed).toBe(false);
    expect(result.errorCount).toBe(1);
    expect(result.violations[0]?.message).toContain("exceeds limit of 2");
  });

  it("evaluateRules verifies check result for require-check-pass", () => {
    const rule: SafeChangeRule = {
      id: "require-tests-pass",
      name: "Require Tests Pass",
      description: "Must pass tests",
      severity: "error",
      condition: {
        type: "require-check-pass",
        checkName: "unit-tests",
      },
    };

    const files: FileChanges = {
      added: [],
      modified: ["src/index.ts"],
      deleted: [],
      unchangedCount: 5,
    };

    const checksPassing: CheckComparison[] = [
      {
        name: "unit-tests",
        before: "pass",
        now: "pass",
        result: "pass-pass",
        durationMs: 100,
        timedOut: false,
      },
    ];

    const checksFailing: CheckComparison[] = [
      {
        name: "unit-tests",
        before: "pass",
        now: "fail",
        result: "pass-fail",
        durationMs: 100,
        timedOut: false,
      },
    ];

    const passResult = evaluateRules([rule], files, checksPassing);
    expect(passResult.passed).toBe(true);
    expect(passResult.violations).toHaveLength(0);

    const failResult = evaluateRules([rule], files, checksFailing);
    expect(failResult.passed).toBe(false);
    expect(failResult.errorCount).toBe(1);
    expect(failResult.violations[0]?.message).toContain("did not pass verification");
  });

  it("validateRule validates schema and catches malformed definitions", () => {
    const valid = validateRule({
      id: "custom-rule",
      name: "Custom Rule",
      description: "Description",
      severity: "error",
      condition: {
        type: "file-not-deleted",
        pattern: "**/*.secret",
      },
    });
    expect(valid.valid).toBe(true);
    expect(valid.errors).toHaveLength(0);

    const missingId = validateRule({
      name: "Custom Rule",
      description: "Description",
      severity: "error",
      condition: { type: "file-not-deleted", pattern: "*.txt" },
    });
    expect(missingId.valid).toBe(false);
    expect(missingId.errors[0]).toContain("Rule id");

    const badSeverity = validateRule({
      id: "r1",
      name: "Rule 1",
      description: "desc",
      severity: "critical",
      condition: { type: "file-not-deleted", pattern: "*.txt" },
    });
    expect(badSeverity.valid).toBe(false);
    expect(badSeverity.errors[0]).toContain("severity");
  });

  it("loadRules, saveRules, addRule, and removeRule persist rules correctly", async () => {
    const initial = await loadRules(tempDir);
    expect(initial).toEqual([]);

    const rule = getBuiltInRule("no-delete-migrations");
    expect(rule).toBeDefined();

    const added = await addRule("no-delete-migrations", tempDir);
    expect(added.id).toBe("no-delete-migrations");

    const loaded = await loadRules(tempDir);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.id).toBe("no-delete-migrations");

    const rawFile = await readFile(getRulesFilePath(tempDir), "utf-8");
    const parsed = JSON.parse(rawFile);
    expect(parsed.version).toBe(1);
    expect(parsed.rules).toHaveLength(1);

    const removed = await removeRule("no-delete-migrations", tempDir);
    expect(removed).toBe(true);

    const afterRemove = await loadRules(tempDir);
    expect(afterRemove).toHaveLength(0);
  });

  it("require-check-pass enforces exact match and rejects partial matches like contest", () => {
    const rule: SafeChangeRule = {
      id: "require-test-pass",
      name: "Require Test Pass",
      description: "Must pass exact check named test",
      severity: "error",
      condition: {
        type: "require-check-pass",
        checkName: "test",
      },
    };

    const files: FileChanges = { added: [], modified: [], deleted: [], unchangedCount: 1 };
    const checksWithContest: CheckComparison[] = [
      {
        name: "contest",
        before: "pass",
        now: "pass",
        result: "pass-pass",
        durationMs: 50,
        timedOut: false,
      },
    ];

    const result = evaluateRules([rule], files, checksWithContest);
    expect(result.passed).toBe(false);
    expect(result.errorCount).toBe(1);
    expect(result.violations[0]?.message).toContain('Required check "test" was not found');

    const checksWithExactTestPassing: CheckComparison[] = [
      {
        name: "test",
        before: "pass",
        now: "pass",
        result: "pass-pass",
        durationMs: 50,
        timedOut: false,
      },
    ];
    const passResult = evaluateRules([rule], files, checksWithExactTestPassing);
    expect(passResult.passed).toBe(true);
    expect(passResult.violations).toHaveLength(0);
  });

  it("detects lockfile deletion as a violation for protect-lockfiles rule", () => {
    const rule: SafeChangeRule = {
      id: "protect-lockfiles",
      name: "Protect Lockfiles",
      description: "Detect unauthorized modification or deletion of lockfiles",
      severity: "error",
      condition: {
        type: "file-not-modified",
        patterns: ["**/package-lock.json", "**/yarn.lock", "**/pnpm-lock.yaml"],
      },
    };

    const filesDeleted: FileChanges = {
      added: [],
      modified: [],
      deleted: ["package-lock.json"],
      unchangedCount: 5,
    };

    const result = evaluateRules([rule], filesDeleted);
    expect(result.passed).toBe(false);
    expect(result.violations[0]?.message).toContain("Deleted protected file(s): package-lock.json");
  });

  it("validateRule rejects invalid conditions, negative thresholds, and empty names", () => {
    expect(validateRule({ id: "", name: "Name", description: "", severity: "error", condition: { type: "file-not-deleted", pattern: "a" } }).valid).toBe(false);
    expect(validateRule({ id: "id", name: "", description: "", severity: "error", condition: { type: "file-not-deleted", pattern: "a" } }).valid).toBe(false);
    expect(validateRule({ id: "id", name: "Name", description: "", severity: "error", condition: { type: "unknown-type" as any } }).valid).toBe(false);
    expect(validateRule({ id: "id", name: "Name", description: "", severity: "error", condition: { type: "max-files-changed", threshold: -1 } }).valid).toBe(false);
    expect(validateRule({ id: "id", name: "Name", description: "", severity: "error", condition: { type: "max-files-changed", threshold: 1.5 } }).valid).toBe(false);
    expect(validateRule({ id: "id", name: "Name", description: "", severity: "error", condition: { type: "require-check-pass", checkName: "" } }).valid).toBe(false);
    expect(validateRule({ id: "id", name: "Name", description: "", severity: "error", condition: { type: "file-not-deleted", pattern: "   " } }).valid).toBe(false);
  });
});
