import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runRules } from "../../src/commands/rules.js";
import { ExitCodes } from "../../src/types/index.js";
import { createTempRepo, type TempRepo } from "../helpers/temp-repo.js";

describe("Rules Command Failure Paths", () => {
  let repo: TempRepo;
  let nonGitDir: string;
  let stdoutData: string;
  let stderrData: string;
  const origStdoutWrite = process.stdout.write;
  const origStderrWrite = process.stderr.write;

  beforeEach(async () => {
    repo = await createTempRepo();
    nonGitDir = await mkdtemp(join(tmpdir(), "sc-non-git-"));
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
    await rm(nonGitDir, { recursive: true, force: true });
    if (repo) {
      await repo.cleanup();
    }
  });

  it("fails with NOT_GIT_REPO when executed outside a Git repository", async () => {
    const origCwd = process.cwd();
    process.chdir(nonGitDir);

    try {
      stderrData = "";
      const code = await runRules({ action: "list", format: "json" });
      expect(code).toBe(ExitCodes.NOT_GIT_REPO);
      expect(stderrData).toContain("Not a Git repository");
    } finally {
      process.chdir(origCwd);
    }
  });

  it("fails with CONFIG_ERROR when add is invoked without target", async () => {
    const origCwd = process.cwd();
    process.chdir(repo.path);

    try {
      stderrData = "";
      const code = await runRules({ action: "add", target: "", format: "terminal" });
      expect(code).toBe(ExitCodes.CONFIG_ERROR);
      expect(stderrData).toContain("Missing rule identifier");
    } finally {
      process.chdir(origCwd);
    }
  });

  it("fails with CONFIG_ERROR when remove is invoked without target", async () => {
    const origCwd = process.cwd();
    process.chdir(repo.path);

    try {
      stderrData = "";
      const code = await runRules({ action: "remove", target: "   ", format: "terminal" });
      expect(code).toBe(ExitCodes.CONFIG_ERROR);
      expect(stderrData).toContain("Missing rule identifier");
    } finally {
      process.chdir(origCwd);
    }
  });

  it("fails with CONFIG_ERROR when adding unknown rule identifier", async () => {
    const origCwd = process.cwd();
    process.chdir(repo.path);

    try {
      stderrData = "";
      const code = await runRules({
        action: "add",
        target: "non-existent-rule-id",
        format: "json",
      });
      expect(code).toBe(ExitCodes.CONFIG_ERROR);
      expect(stderrData).toContain("neither a recognized built-in rule nor a readable rule file");
    } finally {
      process.chdir(origCwd);
    }
  });

  it("fails with CONFIG_ERROR when custom rule file has invalid schema", async () => {
    const badRuleFile = join(repo.path, "broken-rule.json");
    await writeFile(
      badRuleFile,
      JSON.stringify({
        id: "broken",
        name: "Broken",
        description: "Broken rule",
        severity: "invalid-severity",
        condition: { type: "file-not-deleted" },
      })
    );

    const origCwd = process.cwd();
    process.chdir(repo.path);

    try {
      stderrData = "";
      const code = await runRules({
        action: "add",
        target: badRuleFile,
        format: "json",
      });
      expect(code).toBe(ExitCodes.CONFIG_ERROR);
      expect(stderrData).toContain("Invalid rule definition");
    } finally {
      process.chdir(origCwd);
    }
  });
});
