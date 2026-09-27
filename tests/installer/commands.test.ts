import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { PassThrough } from "node:stream";
import { runInstall } from "../../src/installer/commands/install.js";
import { runUpdate } from "../../src/installer/commands/update.js";
import { runUninstall } from "../../src/installer/commands/uninstall.js";
import { runStatus } from "../../src/installer/commands/status.js";
import { ExitCodes } from "../../src/types/index.js";

describe("installer CLI commands", () => {
  let tempDir: string;
  let fakeHome: string;
  let fakeWorkspace: string;
  let canonicalSkillPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "safe-change-test-cmd-")
    );
    fakeHome = path.join(tempDir, "home");
    fakeWorkspace = path.join(tempDir, "workspace");
    fs.mkdirSync(fakeHome, { recursive: true });
    fs.mkdirSync(fakeWorkspace, { recursive: true });

    // Canonical skill file
    const skillDir = path.join(tempDir, "canonical-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    canonicalSkillPath = path.join(skillDir, "SKILL.md");
    fs.writeFileSync(
      canonicalSkillPath,
      "---\nname: safe-change\ndescription: Test\n---\n# safe-change\nCanonical content.\n"
    );
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // cleanup suppression
      }
    }
  });

  function createStreamCapture() {
    const stdoutStream = new PassThrough();
    const stderrStream = new PassThrough();
    let stdoutText = "";
    let stderrText = "";
    stdoutStream.on("data", (chunk) => {
      stdoutText += chunk.toString();
    });
    stderrStream.on("data", (chunk) => {
      stderrText += chunk.toString();
    });
    return {
      stdoutStream,
      stderrStream,
      getStdout: () => stdoutText,
      getStderr: () => stderrText,
    };
  }

  describe("install command", () => {
    it("should return INCOMPATIBLE_TARGET (9) when agent is missing", async () => {
      const capture = createStreamCapture();
      const code = await runInstall({
        agent: undefined,
        canonicalSkillPath,
        stdout: capture.stdoutStream,
        stderr: capture.stderrStream,
      });
      expect(code).toBe(ExitCodes.INCOMPATIBLE_TARGET);
      expect(capture.getStderr()).toContain("Agent name is required");
    });

    it("should return INCOMPATIBLE_TARGET (9) when agent is unsupported", async () => {
      const capture = createStreamCapture();
      const code = await runInstall({
        agent: "claude-code",
        canonicalSkillPath,
        stdout: capture.stdoutStream,
        stderr: capture.stderrStream,
      });
      expect(code).toBe(ExitCodes.INCOMPATIBLE_TARGET);
      expect(capture.getStderr()).toContain("Unsupported agent");
    });

    it("should install successfully in project scope with exit code 0", async () => {
      const capture = createStreamCapture();
      const code = await runInstall({
        agent: "antigravity",
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
        canonicalSkillPath,
        stdout: capture.stdoutStream,
        stderr: capture.stderrStream,
      });

      expect(code).toBe(ExitCodes.OK);
      expect(capture.getStdout()).toContain("safe-change installer: Antigravity");
      expect(capture.getStdout()).toContain("Scope: project");

      const installedFile = path.join(
        fakeWorkspace,
        ".agents",
        "skills",
        "safe-change",
        "SKILL.md"
      );
      expect(fs.existsSync(installedFile)).toBe(true);
    });

    it("should perform dry-run without writing to disk", async () => {
      const capture = createStreamCapture();
      const code = await runInstall({
        agent: "antigravity",
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
        canonicalSkillPath,
        dryRun: true,
        stdout: capture.stdoutStream,
        stderr: capture.stderrStream,
      });

      expect(code).toBe(ExitCodes.OK);
      expect(capture.getStdout()).toContain("Dry run");

      const targetDir = path.join(
        fakeWorkspace,
        ".agents",
        "skills",
        "safe-change"
      );
      expect(fs.existsSync(targetDir)).toBe(false);
    });

    it("should fail in non-interactive mode when collision exists without --overwrite (exit code 7)", async () => {
      const targetDir = path.join(
        fakeWorkspace,
        ".agents",
        "skills",
        "safe-change"
      );
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, "SKILL.md"), "Foreign content");

      const capture = createStreamCapture();
      const code = await runInstall({
        agent: "antigravity",
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
        canonicalSkillPath,
        nonInteractive: true,
        overwrite: false,
        stdout: capture.stdoutStream,
        stderr: capture.stderrStream,
      });

      expect(code).toBe(ExitCodes.COLLISION_DETECTED);
      expect(capture.getStderr()).toContain("Collision detected");
    });

    it("should cancel installation in interactive mode if user declines (exit code 6)", async () => {
      const targetDir = path.join(
        fakeWorkspace,
        ".agents",
        "skills",
        "safe-change"
      );
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, "SKILL.md"), "Foreign content");

      const stdinStream = new PassThrough();
      const capture = createStreamCapture();

      const promise = runInstall({
        agent: "antigravity",
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
        canonicalSkillPath,
        nonInteractive: false,
        overwrite: false,
        stdin: stdinStream,
        stdout: capture.stdoutStream,
        stderr: capture.stderrStream,
      });

      // Simulate user entering "n"
      stdinStream.write("n\n");

      const code = await promise;
      expect(code).toBe(ExitCodes.OPERATION_CANCELLED);
      expect(capture.getStdout()).toContain("cancelled by user");
    });

    it("should proceed in interactive mode if user confirms with 'y'", async () => {
      const targetDir = path.join(
        fakeWorkspace,
        ".agents",
        "skills",
        "safe-change"
      );
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, "SKILL.md"), "Foreign content");

      const stdinStream = new PassThrough();
      const capture = createStreamCapture();

      const promise = runInstall({
        agent: "antigravity",
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
        canonicalSkillPath,
        nonInteractive: false,
        overwrite: false,
        stdin: stdinStream,
        stdout: capture.stdoutStream,
        stderr: capture.stderrStream,
      });

      // Simulate user entering "y"
      stdinStream.write("y\n");

      const code = await promise;
      expect(code).toBe(ExitCodes.OK);

      const installed = fs.readFileSync(
        path.join(targetDir, "SKILL.md"),
        "utf8"
      );
      expect(installed).toContain("Canonical content");
    });
  });

  describe("update command", () => {
    it("should return NO_BASELINE (2) when skill is not installed", async () => {
      const capture = createStreamCapture();
      const code = await runUpdate({
        agent: "antigravity",
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
        canonicalSkillPath,
        stdout: capture.stdoutStream,
        stderr: capture.stderrStream,
      });

      expect(code).toBe(ExitCodes.NO_BASELINE);
      expect(capture.getStderr()).toContain("Skill is not installed");
    });

    it("should update successfully when installed", async () => {
      // First install
      const setupCapture = createStreamCapture();
      await runInstall({
        agent: "antigravity",
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
        canonicalSkillPath,
        nonInteractive: true,
        stdout: setupCapture.stdoutStream,
        stderr: setupCapture.stderrStream,
      });

      // Change canonical
      fs.writeFileSync(canonicalSkillPath, "Updated canonical content");

      const capture = createStreamCapture();
      const code = await runUpdate({
        agent: "antigravity",
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
        canonicalSkillPath,
        nonInteractive: true,
        overwrite: true,
        stdout: capture.stdoutStream,
        stderr: capture.stderrStream,
      });

      expect(code).toBe(ExitCodes.OK);
      expect(capture.getStdout()).toContain("safe-change updater: Antigravity");
    });
  });

  describe("uninstall command", () => {
    it("should return NO_BASELINE (2) when target does not exist", async () => {
      const capture = createStreamCapture();
      const code = await runUninstall({
        agent: "antigravity",
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
        canonicalSkillPath,
        stdout: capture.stdoutStream,
        stderr: capture.stderrStream,
      });

      expect(code).toBe(ExitCodes.NO_BASELINE);
      expect(capture.getStderr()).toContain("No installation found");
    });

    it("should fail in non-interactive mode without --overwrite (exit code 7)", async () => {
      // Install first
      const setupCapture = createStreamCapture();
      await runInstall({
        agent: "antigravity",
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
        canonicalSkillPath,
        nonInteractive: true,
        stdout: setupCapture.stdoutStream,
        stderr: setupCapture.stderrStream,
      });

      const capture = createStreamCapture();
      const code = await runUninstall({
        agent: "antigravity",
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
        canonicalSkillPath,
        nonInteractive: true,
        overwrite: false,
        stdout: capture.stdoutStream,
        stderr: capture.stderrStream,
      });

      expect(code).toBe(ExitCodes.COLLISION_DETECTED);
      expect(capture.getStderr()).toContain("destructive operation");
    });

    it("should uninstall in non-interactive mode when --overwrite is passed", async () => {
      // Install first
      const setupCapture = createStreamCapture();
      await runInstall({
        agent: "antigravity",
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
        canonicalSkillPath,
        nonInteractive: true,
        stdout: setupCapture.stdoutStream,
        stderr: setupCapture.stderrStream,
      });

      const capture = createStreamCapture();
      const code = await runUninstall({
        agent: "antigravity",
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
        canonicalSkillPath,
        nonInteractive: true,
        overwrite: true,
        stdout: capture.stdoutStream,
        stderr: capture.stderrStream,
      });

      expect(code).toBe(ExitCodes.OK);
      const targetDir = path.join(
        fakeWorkspace,
        ".agents",
        "skills",
        "safe-change"
      );
      expect(fs.existsSync(targetDir)).toBe(false);
    });
  });

  describe("status command", () => {
    it("should report status when not installed", async () => {
      const capture = createStreamCapture();
      const code = await runStatus({
        agent: "antigravity",
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
        canonicalSkillPath,
        stdout: capture.stdoutStream,
        stderr: capture.stderrStream,
      });

      expect(code).toBe(ExitCodes.OK);
      expect(capture.getStdout()).toContain("Installed: no");
      expect(capture.getStdout()).toContain("Status: Not installed");
    });

    it("should report status when installed and up-to-date", async () => {
      const setupCapture = createStreamCapture();
      await runInstall({
        agent: "antigravity",
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
        canonicalSkillPath,
        nonInteractive: true,
        stdout: setupCapture.stdoutStream,
        stderr: setupCapture.stderrStream,
      });

      const capture = createStreamCapture();
      const code = await runStatus({
        agent: "antigravity",
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
        canonicalSkillPath,
        stdout: capture.stdoutStream,
        stderr: capture.stderrStream,
      });

      expect(code).toBe(ExitCodes.OK);
      expect(capture.getStdout()).toContain("Installed: yes");
      expect(capture.getStdout()).toContain("Status: Up to date");
    });

    it("should output valid JSON when format is json", async () => {
      const capture = createStreamCapture();
      const code = await runStatus({
        agent: "antigravity",
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
        canonicalSkillPath,
        format: "json",
        stdout: capture.stdoutStream,
        stderr: capture.stderrStream,
      });

      expect(code).toBe(ExitCodes.OK);
      const parsed = JSON.parse(capture.getStdout());
      expect(parsed.agent).toBe("antigravity");
      expect(parsed.installed).toBe(false);
    });
  });
});
