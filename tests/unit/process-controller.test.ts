import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeFile } from "node:fs/promises";
import { BoundedTailBuffer, terminateProcessTree } from "../../src/runner/process-controller.js";
import { executeCheck } from "../../src/runner/executor.js";
import type { CheckDefinition } from "../../src/types/index.js";

describe("BoundedTailBuffer", () => {
  it("retains the exact tail of stdout when output exceeds the limit", () => {
    const buffer = new BoundedTailBuffer(50);
    buffer.append("line 1: start\n");
    buffer.append("line 2: middle content that is quite long and will push out early lines\n");
    buffer.append("line 3: FINAL_ERROR_TAIL_MARKER");

    const tail = buffer.toString();
    expect(tail).toContain("FINAL_ERROR_TAIL_MARKER");
    expect(tail).not.toContain("line 1: start");
    expect(buffer.isTruncated).toBe(true);
    expect(buffer.totalBytes).toBeGreaterThan(50);
  });

  it("handles multibyte UTF-8 characters cleanly without corrupted characters", () => {
    const buffer = new BoundedTailBuffer(20);
    // 'こんにちは' is 15 bytes in UTF-8 (3 bytes per char)
    // '世界' is 6 bytes in UTF-8
    buffer.append("abc");
    buffer.append("こんにちは世界");

    const tail = buffer.toString();
    expect(tail.length).toBeGreaterThan(0);
    expect(tail).not.toContain("\uFFFD"); // No Unicode replacement character from sliced code units
  });

  it("reports truncated false when output is within bounds", () => {
    const buffer = new BoundedTailBuffer(100);
    buffer.append("short line\n");

    expect(buffer.toString()).toBe("short line\n");
    expect(buffer.isTruncated).toBe(false);
    expect(buffer.totalBytes).toBe(11);
  });
});

describe("Process Tree Lifecycle & Timeout Termination", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sc-proc-tree-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("terminates parent and grandchild when timeout occurs so marker file is not created", async () => {
    const markerFile = join(tempDir, "marker.txt");
    const grandchildScript = join(tempDir, "grandchild.js");
    const parentScript = join(tempDir, "parent.js");

    // Grandchild script: waits 3.5 seconds, then writes markerFile
    await writeFile(
      grandchildScript,
      `
const fs = require('fs');
setTimeout(() => {
  fs.writeFileSync(process.argv[2], 'survived');
}, 3500);
// Keep loop alive
setInterval(() => {}, 500);
`
    );

    // Parent script: spawns grandchild and keeps running
    await writeFile(
      parentScript,
      `
const { spawn } = require('child_process');
const child = spawn(process.execPath, [process.argv[2], process.argv[3]], {
  detached: process.platform !== 'win32',
  stdio: 'ignore'
});
setInterval(() => {}, 500);
`
    );

    const check: CheckDefinition = {
      name: "timeout-tree-test",
      executable: process.execPath,
      args: [parentScript, grandchildScript, markerFile],
      timeout: 1, // 1 second timeout
    };

    const startTime = Date.now();
    const result = await executeCheck(check, { cwd: tempDir, maxBuffer: 1024 });
    const duration = Date.now() - startTime;

    expect(result.timedOut).toBe(true);
    expect(result.passed).toBe(false);
    expect(duration).toBeLessThan(4000);

    // Wait 3.5 seconds to verify grandchild was terminated and cannot write marker
    await new Promise((resolve) => setTimeout(resolve, 3500));

    let markerExists = false;
    try {
      await access(markerFile);
      markerExists = true;
    } catch {
      markerExists = false;
    }

    expect(markerExists).toBe(false);
  }, 15000);

  it("preserves true tail on large command output with final error marker", async () => {
    const script = join(tempDir, "large-output.js");
    await writeFile(
      script,
      `
// Write 200KB of output
for (let i = 0; i < 2000; i++) {
  process.stdout.write('noise chunk line ' + i + '\\n');
}
process.stdout.write('CRITICAL_FINAL_TAIL_ERROR');
process.exit(1);
`
    );

    const check: CheckDefinition = {
      name: "large-output-test",
      executable: process.execPath,
      args: [script],
      timeout: 10,
    };

    const result = await executeCheck(check, { cwd: tempDir, maxBuffer: 500 });
    expect(result.passed).toBe(false);
    expect(result.outputTruncated).toBe(true);
    expect(result.outputBytes).toBeGreaterThan(10000);
    expect(result.stdout).toContain("CRITICAL_FINAL_TAIL_ERROR");
  });
});
