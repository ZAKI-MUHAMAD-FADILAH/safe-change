import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runDiff } from "../../src/commands/diff.js";
import { ExitCodes } from "../../src/types/index.js";

const execFileAsync = promisify(execFile);

describe("diff command", () => {
  let tempDir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sc-diff-test-"));
    await execFileAsync("git", ["init"], { cwd: tempDir });
    await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: tempDir });
    await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: tempDir });

    await writeFile(join(tempDir, "hello.txt"), "hello world\n");
    await execFileAsync("git", ["add", "hello.txt"], { cwd: tempDir });
    await execFileAsync("git", ["commit", "-m", "initial commit"], { cwd: tempDir });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  it("reports no changes on clean working tree", async () => {
    process.chdir(tempDir);
    const code = await runDiff({ format: "json" });
    expect(code).toBe(ExitCodes.OK);
  });

  it("calculates working tree line changes when files are modified", async () => {
    await writeFile(join(tempDir, "hello.txt"), "hello world\nline 2\nline 3\n");

    process.chdir(tempDir);
    const code = await runDiff({ format: "json", stat: true });
    expect(code).toBe(ExitCodes.OK);
  });
});
