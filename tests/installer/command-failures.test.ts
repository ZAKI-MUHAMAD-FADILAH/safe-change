import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PassThrough } from "node:stream";
import { runUpdate } from "../../src/installer/commands/update.js";
import { runUninstall } from "../../src/installer/commands/uninstall.js";
import { ExitCodes } from "../../src/types/index.js";

describe("Installer Commands Failure Paths", () => {
  let tempDir: string;
  let homeDir: string;
  let stdoutStream: PassThrough;
  let stderrStream: PassThrough;
  let stderrOutput = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sc-fail-ws-"));
    homeDir = await mkdtemp(join(tmpdir(), "sc-fail-home-"));
    stdoutStream = new PassThrough();
    stderrStream = new PassThrough();
    stderrOutput = "";
    stderrStream.on("data", (chunk) => {
      stderrOutput += chunk.toString();
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    await rm(homeDir, { recursive: true, force: true });
  });

  it("fails runUpdate when agent is unrecognized", async () => {
    const code = await runUpdate({
      agent: "invalid-ghost-agent",
      workspaceRoot: tempDir,
      homeDir,
      stdout: stdoutStream,
      stderr: stderrStream,
    });

    expect(code).toBe(ExitCodes.INCOMPATIBLE_TARGET);
    expect(stderrOutput).toContain("Unsupported agent");
  });

  it("fails runUpdate when target directory does not exist", async () => {
    const code = await runUpdate({
      agent: "cursor",
      scope: "project",
      workspaceRoot: tempDir,
      homeDir,
      overwrite: true,
      nonInteractive: true,
      stdout: stdoutStream,
      stderr: stderrStream,
    });

    expect(code).toBe(ExitCodes.NO_BASELINE);
    expect(stderrOutput).toContain("Cannot update non-existent installation");
  });

  it("fails runUninstall when agent is unrecognized", async () => {
    const code = await runUninstall({
      agent: "phantom-agent",
      workspaceRoot: tempDir,
      homeDir,
      stdout: stdoutStream,
      stderr: stderrStream,
    });

    expect(code).toBe(ExitCodes.INCOMPATIBLE_TARGET);
    expect(stderrOutput).toContain("Unsupported agent");
  });

  it("fails runUninstall when target directory does not exist", async () => {
    const code = await runUninstall({
      agent: "claude-code",
      scope: "project",
      workspaceRoot: tempDir,
      homeDir,
      nonInteractive: true,
      stdout: stdoutStream,
      stderr: stderrStream,
    });

    expect(code).toBe(ExitCodes.NO_BASELINE);
    expect(stderrOutput).toContain("No installation found");
  });
});
