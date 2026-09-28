import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { runSave } from "../../src/commands/save.js";
import { runCheck } from "../../src/commands/check.js";
import { ExitCodes } from "../../src/types/index.js";
import { createTempRepo, type TempRepo } from "../helpers/temp-repo.js";
import { existsSync } from "node:fs";

describe("Verification State Matrix & Fail-Closed Rules Evaluation", () => {
  let repo: TempRepo;
  let stdoutData: string;
  let stderrData: string;
  const origStdoutWrite = process.stdout.write;
  const origStderrWrite = process.stderr.write;

  beforeEach(async () => {
    repo = await createTempRepo();
    stdoutData = "";
    stderrData = "";
    process.stdout.write = ((chunk: string | Buffer) => {
      stdoutData += chunk.toString();
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Buffer) => {
      stderrData += chunk.toString();
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(async () => {
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
    if (repo) {
      await repo.cleanup();
    }
  });

  it("handles pass-pass as verified with exit code 0", async () => {
    await repo.createConfig([
      {
        name: "always-passing",
        executable: process.execPath,
        args: ["-e", "process.exit(0)"],
        timeout: 5,
      },
    ]);

    const originalCwd = process.cwd();
    process.chdir(repo.path);

    try {
      stdoutData = "";
      const saveCode = await runSave({ description: "baseline passing", format: "json" });
      expect(saveCode).toBe(ExitCodes.OK);

      stdoutData = "";
      const checkCode = await runCheck({ format: "json" });
      expect(checkCode).toBe(ExitCodes.OK);

      const parsedCheck = JSON.parse(stdoutData);
      expect(parsedCheck.verification.state).toBe("verified");
      expect(parsedCheck.summary.newFailures).toBe(0);
      expect(parsedCheck.summary.stillPassing).toBe(1);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("handles pre-existing fail-fail as failed with exit code 0", async () => {
    await repo.createConfig([
      {
        name: "pre-existing-failing",
        executable: process.execPath,
        args: ["-e", "process.exit(1)"],
        timeout: 5,
      },
    ]);

    const originalCwd = process.cwd();
    process.chdir(repo.path);

    try {
      stdoutData = "";
      const saveCode = await runSave({ description: "baseline failing", format: "json" });
      expect(saveCode).toBe(ExitCodes.OK);

      const parsedSave = JSON.parse(stdoutData);
      expect(parsedSave.verification.state).toBe("not-verified");

      stdoutData = "";
      const checkCode = await runCheck({ format: "json" });
      expect(checkCode).toBe(ExitCodes.OK); // Backward-compatible regression contract: no NEW failures

      const parsedCheck = JSON.parse(stdoutData);
      expect(parsedCheck.verification.state).toBe("failed");
      expect(parsedCheck.verification.reason).toContain("unresolved");
      expect(parsedCheck.summary.stillFailing).toBe(1);
      expect(parsedCheck.summary.newFailures).toBe(0);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("handles pass-fail regression as failed with exit code 1", async () => {
    const flagFile = join(repo.path, "should-fail.txt");
    await repo.createConfig([
      {
        name: "dynamic-check",
        executable: process.execPath,
        args: [
          "-e",
          `const fs = require('fs'); if (fs.existsSync('${flagFile.replace(/\\/g, "/")}')) process.exit(1); process.exit(0);`,
        ],
        timeout: 5,
      },
    ]);

    const originalCwd = process.cwd();
    process.chdir(repo.path);

    try {
      stdoutData = "";
      const saveCode = await runSave({ description: "baseline passing", format: "json" });
      expect(saveCode).toBe(ExitCodes.OK);

      // Now create the flag file to trigger failure
      await writeFile(flagFile, "fail now");

      stdoutData = "";
      const checkCode = await runCheck({ format: "json" });
      expect(checkCode).toBe(ExitCodes.NEW_FAILURE); // Exit code 1

      const parsedCheck = JSON.parse(stdoutData);
      expect(parsedCheck.verification.state).toBe("failed");
      expect(parsedCheck.verification.reason).toContain("Regression detected");
      expect(parsedCheck.summary.newFailures).toBe(1);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("handles fail-pass resolution as verified with exit code 0", async () => {
    const fixFlag = join(repo.path, "fixed.txt");
    await repo.createConfig([
      {
        name: "resolving-check",
        executable: process.execPath,
        args: [
          "-e",
          `const fs = require('fs'); if (fs.existsSync('${fixFlag.replace(/\\/g, "/")}')) process.exit(0); process.exit(1);`,
        ],
        timeout: 5,
      },
    ]);

    const originalCwd = process.cwd();
    process.chdir(repo.path);

    try {
      stdoutData = "";
      const saveCode = await runSave({ description: "baseline with failure", format: "json" });
      expect(saveCode).toBe(ExitCodes.OK);

      // Now fix the check
      await writeFile(fixFlag, "fixed now");

      stdoutData = "";
      const checkCode = await runCheck({ format: "json" });
      expect(checkCode).toBe(ExitCodes.OK);

      const parsedCheck = JSON.parse(stdoutData);
      expect(parsedCheck.verification.state).toBe("verified");
      expect(parsedCheck.summary.fixed).toBe(1);
      expect(parsedCheck.summary.newFailures).toBe(0);
      expect(parsedCheck.summary.stillFailing).toBe(0);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("evaluates zero checks as not-verified", async () => {
    await repo.createConfig([]);

    const originalCwd = process.cwd();
    process.chdir(repo.path);

    try {
      stdoutData = "";
      const saveCode = await runSave({ description: "baseline no checks", format: "json" });
      expect(saveCode).toBe(ExitCodes.OK);

      stdoutData = "";
      const checkCode = await runCheck({ format: "json" });
      expect(checkCode).toBe(ExitCodes.OK);

      const parsedCheck = JSON.parse(stdoutData);
      expect(parsedCheck.verification.state).toBe("not-verified");
      expect(parsedCheck.verification.reason).toContain("Zero checks");
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("evaluates definition-changed checks as not-verified", async () => {
    await repo.createConfig([
      {
        name: "mutating-check",
        executable: process.execPath,
        args: ["-e", "process.exit(0)"],
        timeout: 5,
      },
    ]);

    const originalCwd = process.cwd();
    process.chdir(repo.path);

    try {
      stdoutData = "";
      const saveCode = await runSave({ description: "baseline check", format: "json" });
      expect(saveCode).toBe(ExitCodes.OK);

      // Change check argument
      await repo.createConfig([
        {
          name: "mutating-check",
          executable: process.execPath,
          args: ["-e", "console.log('changed'); process.exit(0);"],
          timeout: 5,
        },
      ]);

      stdoutData = "";
      const checkCode = await runCheck({ format: "json" });
      expect(checkCode).toBe(ExitCodes.OK);

      const parsedCheck = JSON.parse(stdoutData);
      expect(parsedCheck.verification.state).toBe("not-verified");
      expect(parsedCheck.verification.reason).toContain("results not comparable");
      expect(parsedCheck.summary.definitionChanged).toBe(1);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("evaluates added checks as not-verified until a new baseline is recorded", async () => {
    await repo.createConfig([
      {
        name: "existing-check",
        executable: process.execPath,
        args: ["-e", "process.exit(0)"],
        timeout: 5,
      },
    ]);

    const originalCwd = process.cwd();
    process.chdir(repo.path);

    try {
      expect(
        await runSave({ description: "baseline before added gate", format: "json" })
      ).toBe(ExitCodes.OK);

      await repo.createConfig([
        {
          name: "existing-check",
          executable: process.execPath,
          args: ["-e", "process.exit(0)"],
          timeout: 5,
        },
        {
          name: "new-security-check",
          executable: process.execPath,
          args: ["-e", "process.exit(0)"],
          timeout: 5,
        },
      ]);

      stdoutData = "";
      expect(await runCheck({ format: "json" })).toBe(ExitCodes.OK);

      const parsedCheck = JSON.parse(stdoutData);
      expect(parsedCheck.configDrift.addedChecks).toEqual(["new-security-check"]);
      expect(parsedCheck.verification.state).toBe("not-verified");
      expect(parsedCheck.verification.reason).toContain(
        "configuration changed since baseline"
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("enforces fail-closed save rejection when rules.json is malformed", async () => {
    await repo.createConfig([]);
    const rulesDir = join(repo.path, ".safe-change");
    await mkdir(rulesDir, { recursive: true });
    await writeFile(join(rulesDir, "rules.json"), "invalid json content {");

    const originalCwd = process.cwd();
    process.chdir(repo.path);

    try {
      stderrData = "";
      const saveCode = await runSave({ description: "attempt save", format: "json" });
      expect(saveCode).toBe(ExitCodes.CONFIG_ERROR);
      expect(stderrData).toContain("Invalid safety rules configuration");
      // Must not create baseline file
      expect(existsSync(join(rulesDir, "baseline.json"))).toBe(false);
      // Must not create log file
      expect(existsSync(join(rulesDir, "log.json"))).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("enforces fail-closed save rejection when rules.json is missing version", async () => {
    await repo.createConfig([]);
    const rulesDir = join(repo.path, ".safe-change");
    await mkdir(rulesDir, { recursive: true });
    await writeFile(
      join(rulesDir, "rules.json"),
      JSON.stringify({ rules: [] })
    );

    const originalCwd = process.cwd();
    process.chdir(repo.path);

    try {
      stderrData = "";
      const saveCode = await runSave({ description: "attempt save", format: "json" });
      expect(saveCode).toBe(ExitCodes.CONFIG_ERROR);
      expect(stderrData).toContain("missing 'version' property");
      expect(existsSync(join(rulesDir, "baseline.json"))).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("enforces fail-closed save rejection when rules.json has unsupported version", async () => {
    await repo.createConfig([]);
    const rulesDir = join(repo.path, ".safe-change");
    await mkdir(rulesDir, { recursive: true });
    await writeFile(
      join(rulesDir, "rules.json"),
      JSON.stringify({ version: 2, rules: [] })
    );

    const originalCwd = process.cwd();
    process.chdir(repo.path);

    try {
      stderrData = "";
      const saveCode = await runSave({ description: "attempt save", format: "json" });
      expect(saveCode).toBe(ExitCodes.CONFIG_ERROR);
      expect(stderrData).toContain("Unsupported rules version");
      expect(existsSync(join(rulesDir, "baseline.json"))).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("enforces fail-closed save rejection when rules.json contains an invalid rule schema", async () => {
    await repo.createConfig([]);
    const rulesDir = join(repo.path, ".safe-change");
    await mkdir(rulesDir, { recursive: true });
    await writeFile(
      join(rulesDir, "rules.json"),
      JSON.stringify({
        version: 1,
        rules: [{ id: "", name: "Missing ID", severity: "error" }],
      })
    );

    const originalCwd = process.cwd();
    process.chdir(repo.path);

    try {
      stderrData = "";
      const saveCode = await runSave({ description: "attempt save", format: "json" });
      expect(saveCode).toBe(ExitCodes.CONFIG_ERROR);
      expect(stderrData).toContain("Invalid rule schema");
      expect(existsSync(join(rulesDir, "baseline.json"))).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("enforces fail-closed check rejection when rules.json contains invalid schema after baseline", async () => {
    await repo.createConfig([
      {
        name: "test-check",
        executable: process.execPath,
        args: ["-e", "process.exit(0)"],
        timeout: 5,
      },
    ]);

    const originalCwd = process.cwd();
    process.chdir(repo.path);

    try {
      const saveCode = await runSave({ description: "valid baseline", format: "json" });
      expect(saveCode).toBe(ExitCodes.OK);

      // Now introduce an invalid rules.json
      const rulesDir = join(repo.path, ".safe-change");
      await writeFile(
        join(rulesDir, "rules.json"),
        JSON.stringify({
          version: 1,
          rules: [{ id: "bad", name: "Bad", severity: "invalid-severity" }],
        })
      );

      stderrData = "";
      const checkCode = await runCheck({ format: "json" });
      expect(checkCode).toBe(ExitCodes.CONFIG_ERROR);
      expect(stderrData).toContain("Invalid safety rules configuration");
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("reports failed verification state when a blocking error rule is violated", async () => {
    await repo.createConfig([
      {
        name: "check-pass",
        executable: process.execPath,
        args: ["-e", "process.exit(0)"],
        timeout: 5,
      },
    ]);

    const originalCwd = process.cwd();
    process.chdir(repo.path);

    try {
      // 1. Create baseline with pre-existing secret.txt
      await writeFile(join(repo.path, "secret.txt"), "initial secret content");
      const saveCode = await runSave({ description: "baseline", format: "json" });
      expect(saveCode).toBe(ExitCodes.OK);

      // 2. Add blocking rule: lockfile must not be deleted or modified
      const rulesDir = join(repo.path, ".safe-change");
      await writeFile(
        join(rulesDir, "rules.json"),
        JSON.stringify({
          version: 1,
          rules: [
            {
              id: "protect-secret",
              name: "Protect Secret File",
              description: "Secret file must not be modified",
              severity: "error",
              condition: {
                type: "file-not-modified",
                pattern: "secret.txt",
              },
            },
          ],
        })
      );

      // 3. Modify secret.txt in repository
      await writeFile(join(repo.path, "secret.txt"), "modified content");

      stdoutData = "";
      const checkCode = await runCheck({ format: "json" });
      expect(checkCode).toBe(ExitCodes.NEW_FAILURE); // Error severity triggers exit code 1

      const parsedCheck = JSON.parse(stdoutData);
      expect(parsedCheck.verification.state).toBe("failed");
      expect(parsedCheck.verification.reason).toContain("Safety rule violation");
      expect(parsedCheck.ruleViolations).toHaveLength(1);
      expect(parsedCheck.ruleViolations[0].severity).toBe("error");
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("handles branch mismatch between baseline and current git state", async () => {
    await repo.createConfig([
      {
        name: "quick-pass",
        executable: process.execPath,
        args: ["-e", "process.exit(0)"],
        timeout: 5,
      },
    ]);

    const originalCwd = process.cwd();
    process.chdir(repo.path);

    try {
      const saveCode = await runSave({ description: "baseline on main", format: "json" });
      expect(saveCode).toBe(ExitCodes.OK);

      // Mutate baseline file directly to simulate having saved on another branch
      const baselineFile = join(repo.path, ".safe-change", "baseline.json");
      const baselineData = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(baselineFile, "utf-8")));
      baselineData.git.headBranch = "simulated-previous-branch";
      await writeFile(baselineFile, JSON.stringify(baselineData, null, 2));

      stdoutData = "";
      const checkCode = await runCheck({ format: "json" });
      expect(checkCode).toBe(ExitCodes.OK);

      const parsedCheck = JSON.parse(stdoutData);
      expect(parsedCheck.branchMismatch).toBeDefined();
      expect(parsedCheck.branchMismatch.baselineBranch).toBe("simulated-previous-branch");
    } finally {
      process.chdir(originalCwd);
    }
  });
});
