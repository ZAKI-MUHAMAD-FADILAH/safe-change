import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { executeCheck } from "../../src/runner/executor.js";
import { terminateProcessTree } from "../../src/runner/process-controller.js";
import {
  addRule,
  removeRule,
  loadRulesResult,
} from "../../src/rules/manager.js";
import { runSave } from "../../src/commands/save.js";
import { runCheck } from "../../src/commands/check.js";
import { renderSaveResult } from "../../src/output/renderer.js";
import { ExitCodes, type SafeChangeRule } from "../../src/types/index.js";
import { createTempRepo, type TempRepo } from "../helpers/temp-repo.js";

describe("Coverage & Safety Edge Cases", () => {
  let tempDir: string;
  let repo: TempRepo;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sc-cov-boost-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    if (repo) {
      await repo.cleanup();
    }
  });

  it("handles non-existent executable in executeCheck cleanly", async () => {
    const result = await executeCheck(
      {
        name: "bad-exec",
        executable: "__definitely_non_existent_binary_xyz_123__",
        args: [],
        timeout: 5,
      },
      { cwd: tempDir }
    );

    expect(result.passed).toBe(false);
    expect(result.exitCode).toBeNull();
    expect(result.stderr).toContain("Execution error");
  });

  it("handles terminateProcessTree edge cases safely", () => {
    expect(() => terminateProcessTree(undefined)).not.toThrow();
    expect(() => terminateProcessTree(0)).not.toThrow();
    expect(() => terminateProcessTree(-9999)).not.toThrow();
    // Non-existent PID
    expect(() => terminateProcessTree(99999999)).not.toThrow();
  });

  it("supports addRule with custom JSON file, rule object, and handles invalid definition", async () => {
    const validRule: SafeChangeRule = {
      id: "custom-file-rule",
      name: "Custom File Rule",
      description: "Custom description",
      severity: "warn",
      condition: {
        type: "file-not-modified",
        pattern: "*.lock",
      },
    };

    const rulePath = join(tempDir, "custom-rule.json");
    await writeFile(rulePath, JSON.stringify(validRule));

    // 1. Add rule by file path
    const addedFromFile = await addRule(rulePath, tempDir);
    expect(addedFromFile.id).toBe("custom-file-rule");

    // 2. Add rule by object directly
    const directRule: SafeChangeRule = {
      id: "direct-obj-rule",
      name: "Direct Rule",
      description: "Direct desc",
      severity: "error",
      condition: {
        type: "max-files-changed",
        threshold: 10,
      },
    };
    const addedDirect = await addRule(directRule, tempDir);
    expect(addedDirect.id).toBe("direct-obj-rule");

    // 3. Reject invalid rule object
    await expect(
      addRule({ id: "", name: "", severity: "error" } as any, tempDir)
    ).rejects.toThrow();

    // 4. Reject invalid rule file path
    const invalidPath = join(tempDir, "invalid-rule.json");
    await writeFile(invalidPath, JSON.stringify({ id: "" }));
    await expect(addRule(invalidPath, tempDir)).rejects.toThrow();

    // 5. Remove rule returns false when rule does not exist
    const removedNonExistent = await removeRule("does-not-exist", tempDir);
    expect(removedNonExistent).toBe(false);
  });

  it("returns invalid status from loadRulesResult on malformed JSON", async () => {
    const rulesDir = join(tempDir, ".safe-change");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(rulesDir, { recursive: true });
    await writeFile(join(rulesDir, "rules.json"), "{ invalid json");

    const status = await loadRulesResult(tempDir);
    expect(status.status).toBe("invalid");
    expect(status.rules).toHaveLength(0);
    expect(status.error).toContain("Rules file contains invalid JSON");
  });

  it("evaluates save and check verification states with failing checks", async () => {
    repo = await createTempRepo();
    // Config with a check that fails
    await repo.createConfig([
      {
        name: "failing-check",
        executable: process.execPath,
        args: ["-e", "process.exit(1)"],
        timeout: 5,
      },
    ]);

    const originalCwd = process.cwd();
    process.chdir(repo.path);

    let stdoutData = "";
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: string | Buffer) => {
      stdoutData += chunk.toString();
      return true;
    }) as typeof process.stdout.write;

    try {
      // 1. runSave with failing check -> verification status not-verified
      stdoutData = "";
      const saveCode = await runSave({ description: "baseline with fail", format: "json" });
      expect(saveCode).toBe(ExitCodes.OK);
      const parsedSave = JSON.parse(stdoutData);
      expect(parsedSave.verification.state).toBe("not-verified");
      expect(parsedSave.verification.reason).toContain("failing");

      // 3. runCheck without regression -> exit code 0, verification verified because baseline was already failing
      stdoutData = "";
      const checkCode = await runCheck({ format: "json" });
      expect(checkCode).toBe(ExitCodes.OK);
      const parsedCheck = JSON.parse(stdoutData);
      expect(parsedCheck.verification.state).toBe("verified");
    } finally {
      process.stdout.write = origWrite;
      process.chdir(originalCwd);
    }
  });

  it("renders verification status and save result without crashing", () => {
    const verifiedRender = renderSaveResult(
      "terminal",
      "test desc",
      2,
      2,
      10,
      "/path/to/baseline.json",
      false,
      {
        state: "verified",
        reason: "All checks passed",
        configuredChecksCount: 2,
        executedChecksCount: 2,
        activeRulesCount: 0,
      }
    );
    expect(verifiedRender).toContain("VERIFIED");

    const notVerifiedRender = renderSaveResult(
      "terminal",
      "test desc",
      0,
      0,
      10,
      "/path/to/baseline.json",
      true,
      {
        state: "not-verified",
        reason: "Zero checks and zero rules",
        configuredChecksCount: 0,
        executedChecksCount: 0,
        activeRulesCount: 0,
      }
    );
    expect(notVerifiedRender).toContain("NOT VERIFIED");
    expect(notVerifiedRender).toContain("Warning: .safe-change/ is not in .gitignore");

    const jsonRender = renderSaveResult(
      "json",
      "test desc",
      1,
      1,
      5,
      "/path/to/baseline.json",
      false
    );
    expect(JSON.parse(jsonRender).description).toBe("test desc");
  });
});
