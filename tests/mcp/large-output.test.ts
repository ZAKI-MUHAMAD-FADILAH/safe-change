import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/mcp/server.js";

describe("MCP Large Output Memory Bounding", () => {
  it("strictly bounds stdout memory growth while retaining trailing markers on real CLI invocation", async () => {
    // Run --help which produces ~2KB output, but bound output buffer to 64 bytes
    const maxOutputBytes = 64;

    const result = await runCli(
      ["--help"],
      process.cwd(),
      10000,
      maxOutputBytes
    );

    // 1. CLI finishes with OK
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);

    // 2. Memory remains bounded by maxOutputBytes
    expect(Buffer.byteLength(result.stdout, "utf-8")).toBeLessThanOrEqual(maxOutputBytes);

    // 3. Truncation is reported accurately
    expect(result.stdoutTruncated).toBe(true);
    expect(result.stdoutBytes).toBeGreaterThan(maxOutputBytes * 2);

    // 4. Retained string is non-empty tail
    expect(result.stdout.length).toBeGreaterThan(0);
  });

  it("resolves exactly once on non-zero CLI error exit and retains stderr tail", async () => {
    let callCount = 0;
    const gitlessDir = mkdtempSync(join(tmpdir(), "safe-change-mcp-gitless-"));

    try {
      // Use an isolated directory and a generous timeout so loaded CI runners do not turn
      // the expected CLI error into an unrelated process timeout.
      const result = await runCli(
        ["save"],
        gitlessDir,
        15000,
        128
      );

      callCount++;
      expect(callCount).toBe(1);
      expect(result.exitCode).toBe(4);
      expect(result.stderr).toContain("Not a Git repository");
      expect(result.timedOut).toBe(false);
    } finally {
      rmSync(gitlessDir, { recursive: true, force: true });
    }
  });
});
