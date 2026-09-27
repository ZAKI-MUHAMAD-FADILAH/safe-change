import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { createTempRepo, type TempRepo } from "../helpers/temp-repo.js";
import { runLog } from "../../src/commands/log.js";
import { appendEntry, createLogEntry, readEntries } from "../../src/log/log-manager.js";
import { ExitCodes } from "../../src/types/index.js";

describe("Log command integration", () => {
  let repo: TempRepo;
  let originalCwd: string;
  let stdoutData: string;
  let stderrData: string;
  let originalStdoutWrite: typeof process.stdout.write;
  let originalStderrWrite: typeof process.stderr.write;

  beforeEach(async () => {
    repo = await createTempRepo();
    originalCwd = process.cwd();
    process.chdir(repo.path);

    stdoutData = "";
    stderrData = "";
    originalStdoutWrite = process.stdout.write;
    originalStderrWrite = process.stderr.write;

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
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.chdir(originalCwd);
    if (repo) {
      await repo.cleanup();
    }
  });

  async function populateLog(count: number): Promise<void> {
    for (let i = 1; i <= count; i++) {
      const entry = createLogEntry({
        description: `run number ${i}`,
        baselineId: `commit-hash-${i}`,
        trigger: "cli",
        checkResults: [
          {
            name: "test",
            result: i % 5 === 0 ? "pass-fail" : "pass-pass",
            before: "pass",
            now: i % 5 === 0 ? "fail" : "pass",
          },
        ],
        fileSummary: { added: i, modified: 1, deleted: 0, unchanged: 10 },
        regressionDetected: i % 5 === 0,
        durationMs: 100 + i,
      });
      await appendEntry(entry, repo.path, 100);
    }
  }

  it("displays 10 most recent entries by default", async () => {
    await populateLog(15);

    const code = await runLog({ format: "terminal" });
    expect(code).toBe(ExitCodes.OK);

    expect(stdoutData).toContain("run number 15");
    expect(stdoutData).toContain("run number 6");
    expect(stdoutData).not.toContain("run number 5");
    expect(stdoutData).not.toContain("run number 1\n");
  });

  it("safe-change log --all displays all entries", async () => {
    await populateLog(15);

    const code = await runLog({ format: "terminal", all: true });
    expect(code).toBe(ExitCodes.OK);

    expect(stdoutData).toContain("run number 1");
    expect(stdoutData).toContain("run number 15");
  });

  it("safe-change log --json produces valid JSON array", async () => {
    await populateLog(3);

    const code = await runLog({ format: "json" });
    expect(code).toBe(ExitCodes.OK);

    const parsed = JSON.parse(stdoutData);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].description).toBe("run number 1");
    expect(parsed[2].description).toBe("run number 3");
  });

  it("safe-change log --export writes readable JSON file", async () => {
    await populateLog(4);

    const exportPath = join(repo.path, "backup-log.json");
    const code = await runLog({ format: "terminal", exportPath });
    expect(code).toBe(ExitCodes.OK);
    expect(stdoutData).toContain(`Log exported to ${exportPath}`);

    const fileContent = await readFile(exportPath, "utf-8");
    const parsed = JSON.parse(fileContent);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(4);
    expect(parsed[3].description).toBe("run number 4");
  });

  it("safe-change log --clear clears all log entries with nonInteractive", async () => {
    await populateLog(3);

    const code = await runLog({ format: "terminal", clear: true, nonInteractive: true });
    expect(code).toBe(ExitCodes.OK);
    expect(stdoutData).toContain("Log cleared.");

    const entries = await readEntries(repo.path);
    expect(entries).toEqual([]);
  });

  it("displays 'No log entries found.' on project without log", async () => {
    const code = await runLog({ format: "terminal" });
    expect(code).toBe(ExitCodes.OK);
    expect(stdoutData).toContain("No log entries found.");
  });
});
