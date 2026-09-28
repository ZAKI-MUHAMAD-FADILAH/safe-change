import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { executeCheck, executeAllChecks } from "../../src/runner/executor.js";
import {
  terminateProcessTree,
  BoundedTailBuffer,
} from "../../src/runner/process-controller.js";

describe("Process Controller & Execution Edge Cases", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sc-proc-ctrl-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
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

  it("handles terminateProcessTree edge cases safely without throwing", () => {
    expect(() => terminateProcessTree(undefined)).not.toThrow();
    expect(() => terminateProcessTree(0)).not.toThrow();
    expect(() => terminateProcessTree(-9999)).not.toThrow();
    // Non-existent PID
    expect(() => terminateProcessTree(99999999)).not.toThrow();
  });

  it("caps BoundedTailBuffer strictly at maxBytes and retains true tail", () => {
    const buffer = new BoundedTailBuffer(20);
    expect(buffer.toString()).toBe("");
    expect(buffer.isTruncated).toBe(false);
    expect(buffer.totalBytes).toBe(0);

    // Append smaller chunk
    buffer.append("12345");
    expect(buffer.toString()).toBe("12345");
    expect(buffer.totalBytes).toBe(5);
    expect(buffer.isTruncated).toBe(false);

    // Append large chunk exceeding capacity
    buffer.append("67890abcdefghijklmnopqrstuvwxyz_END");
    expect(buffer.totalBytes).toBe(5 + 35);
    expect(buffer.isTruncated).toBe(true);

    const tail = buffer.getTailString();
    expect(tail.length).toBeLessThanOrEqual(20);
    expect(tail).toContain("_END");
  });

  it("handles empty push/append in BoundedTailBuffer gracefully", () => {
    const buffer = new BoundedTailBuffer(50);
    buffer.push(Buffer.alloc(0));
    buffer.append("");
    expect(buffer.totalBytes).toBe(0);
    expect(buffer.getTailString()).toBe("");
  });

  it("handles check timeout and reports timedOut true", async () => {
    const result = await executeCheck(
      {
        name: "sleeping-task",
        executable: process.execPath,
        args: ["-e", "setTimeout(() => {}, 10000);"],
        timeout: 1, // 1 second timeout
      },
      { cwd: tempDir }
    );

    expect(result.passed).toBe(false);
    expect(result.timedOut).toBe(true);
  });

  it("invokes onProgress callback during executeAllChecks", async () => {
    const progressCalls: Array<{ name: string; index: number; total: number }> = [];

    const results = await executeAllChecks(
      [
        {
          name: "check-1",
          executable: process.execPath,
          args: ["-e", "process.exit(0)"],
          timeout: 5,
        },
        {
          name: "check-2",
          executable: process.execPath,
          args: ["-e", "process.exit(0)"],
          timeout: 5,
        },
      ],
      { cwd: tempDir },
      (name, index, total) => {
        progressCalls.push({ name, index, total });
      }
    );

    expect(results).toHaveLength(2);
    expect(progressCalls).toHaveLength(2);
    expect(progressCalls[0].name).toBe("check-1");
    expect(progressCalls[0].index).toBe(0);
    expect(progressCalls[1].name).toBe("check-2");
    expect(progressCalls[1].index).toBe(1);
  });
});
