import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { PassThrough } from "node:stream";
import { detectInstalledAgents } from "../../src/installer/adapters/registry.js";
import { runInstall } from "../../src/installer/commands/install.js";
import { runStatus } from "../../src/installer/commands/status.js";
import { ExitCodes } from "../../src/types/index.js";

describe("Agent Auto-Detection and Collision Handling (v0.2.0)", () => {
  let tempDir: string;
  let workspaceRoot: string;
  let fakeHome: string;
  let canonicalSkillPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-autodetect-test-"));
    workspaceRoot = path.join(tempDir, "workspace");
    fakeHome = path.join(tempDir, "home");
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.mkdirSync(fakeHome, { recursive: true });

    canonicalSkillPath = path.join(tempDir, "canonical", "SKILL.md");
    fs.mkdirSync(path.dirname(canonicalSkillPath), { recursive: true });
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
        // ignore cleanup error
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

  describe("detectInstalledAgents", () => {
    it("should return empty array when no agent config directories exist", () => {
      const detected = detectInstalledAgents(workspaceRoot);
      expect(detected).toEqual([]);
    });

    it("should detect single agent directory (.claude -> claude-code)", () => {
      fs.mkdirSync(path.join(workspaceRoot, ".claude"));
      const detected = detectInstalledAgents(workspaceRoot);
      expect(detected).toEqual(["claude-code"]);
    });

    it("should detect multiple agent directories (.cursor, .codex, .cline)", () => {
      fs.mkdirSync(path.join(workspaceRoot, ".cursor"));
      fs.mkdirSync(path.join(workspaceRoot, ".codex"));
      fs.mkdirSync(path.join(workspaceRoot, ".cline"));

      const detected = detectInstalledAgents(workspaceRoot);
      expect(detected).toContain("cursor");
      expect(detected).toContain("codex");
      expect(detected).toContain("cline");
      expect(detected).toHaveLength(3);
    });

    it("should detect both antigravity and amp when .agents/ exists", () => {
      fs.mkdirSync(path.join(workspaceRoot, ".agents"));
      const detected = detectInstalledAgents(workspaceRoot);
      expect(detected).toContain("antigravity");
      expect(detected).toContain("amp");
    });

    it("should ignore regular files named like config directories", () => {
      fs.writeFileSync(path.join(workspaceRoot, ".claude"), "regular file");
      const detected = detectInstalledAgents(workspaceRoot);
      expect(detected).toEqual([]);
    });

    it("should detect all agents when all config directories exist", () => {
      const dirs = [
        ".claude",
        ".cursor",
        ".codex",
        ".cline",
        ".kimi-code",
        ".agents",
        ".opencode",
        ".gemini",
        ".github",
      ];
      for (const d of dirs) {
        fs.mkdirSync(path.join(workspaceRoot, d));
      }

      const detected = detectInstalledAgents(workspaceRoot);
      expect(detected).toHaveLength(10);
    });
  });

  describe("safe-change install all", () => {
    it("should install for detected agents when specific directories are present", async () => {
      fs.mkdirSync(path.join(workspaceRoot, ".claude"));
      fs.mkdirSync(path.join(workspaceRoot, ".cursor"));

      const capture = createStreamCapture();
      const code = await runInstall({
        agent: "all",
        scope: "project",
        workspaceRoot,
        homeDir: fakeHome,
        canonicalSkillPath,
        nonInteractive: true,
        stdout: capture.stdoutStream,
        stderr: capture.stderrStream,
      });

      expect(code).toBe(ExitCodes.OK);
      expect(capture.getStdout()).toContain("Detected agents in project: claude-code, cursor");

      // Verify installed files
      expect(fs.existsSync(path.join(workspaceRoot, ".claude", "skills", "safe-change", "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(workspaceRoot, ".cursor", "skills", "safe-change", "SKILL.md"))).toBe(true);

      // Verify not installed for un-detected agent
      expect(fs.existsSync(path.join(workspaceRoot, ".codex", "skills", "safe-change"))).toBe(false);
    });

    it("should install for all supported agents when no specific agents are detected", async () => {
      const capture = createStreamCapture();
      const code = await runInstall({
        agent: "all",
        scope: "project",
        workspaceRoot,
        homeDir: fakeHome,
        canonicalSkillPath,
        nonInteractive: true,
        stdout: capture.stdoutStream,
        stderr: capture.stderrStream,
      });

      expect(code).toBe(ExitCodes.OK);
      expect(capture.getStdout()).toContain("No specific agents detected");

      // Check multiple installed
      expect(fs.existsSync(path.join(workspaceRoot, ".claude", "skills", "safe-change", "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(workspaceRoot, ".cursor", "skills", "safe-change", "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(workspaceRoot, ".agents", "skills", "safe-change", "SKILL.md"))).toBe(true);
    });

    it("should preview all installations in dry-run mode without writing to disk", async () => {
      fs.mkdirSync(path.join(workspaceRoot, ".claude"));

      const capture = createStreamCapture();
      const code = await runInstall({
        agent: "all",
        scope: "project",
        workspaceRoot,
        homeDir: fakeHome,
        canonicalSkillPath,
        dryRun: true,
        stdout: capture.stdoutStream,
        stderr: capture.stderrStream,
      });

      expect(code).toBe(ExitCodes.OK);
      expect(capture.getStdout()).toContain("Dry run");
      expect(fs.existsSync(path.join(workspaceRoot, ".claude", "skills", "safe-change"))).toBe(false);
    });
  });

  describe("Amp and Antigravity Collision Handling", () => {
    it("should warn about shared directory and preserve initial ownership manifest without failing", async () => {
      // 1. Install Antigravity first
      const capture1 = createStreamCapture();
      const code1 = await runInstall({
        agent: "antigravity",
        scope: "project",
        workspaceRoot,
        homeDir: fakeHome,
        canonicalSkillPath,
        nonInteractive: true,
        stdout: capture1.stdoutStream,
        stderr: capture1.stderrStream,
      });
      expect(code1).toBe(ExitCodes.OK);

      // Verify manifest records antigravity
      const manifestPath = path.join(workspaceRoot, ".agents", "skills", "safe-change", ".safe-change-manifest.json");
      expect(fs.existsSync(manifestPath)).toBe(true);
      const manifest1 = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      expect(manifest1.agent).toBe("antigravity");

      // 2. Install Amp next into same project
      const capture2 = createStreamCapture();
      const code2 = await runInstall({
        agent: "amp",
        scope: "project",
        workspaceRoot,
        homeDir: fakeHome,
        canonicalSkillPath,
        nonInteractive: true,
        stdout: capture2.stdoutStream,
        stderr: capture2.stderrStream,
      });

      // Must succeed (ExitCodes.OK) and print warning
      expect(code2).toBe(ExitCodes.OK);
      const output2 = capture2.getStdout();
      expect(output2).toContain("amp dan antigravity berbagi direktori .agents/skills/");

      // Verify manifest still records antigravity as initial installer
      const manifest2 = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      expect(manifest2.agent).toBe("antigravity");
    });
  });

  describe("safe-change status multi-agent report", () => {
    it("should display detected agents, status per agent, and recommendations", async () => {
      fs.mkdirSync(path.join(workspaceRoot, ".claude"));

      const capture = createStreamCapture();
      const code = await runStatus({
        scope: "project",
        workspaceRoot,
        homeDir: fakeHome,
        canonicalSkillPath,
        stdout: capture.stdoutStream,
        stderr: capture.stderrStream,
      });

      expect(code).toBe(ExitCodes.OK);
      const stdout = capture.getStdout();
      expect(stdout).toContain("Detected agents in project: claude-code");
      expect(stdout).toContain("Recommendations:");
      expect(stdout).toContain("claude-code");
      expect(stdout).toContain("filesystem-validated");
    });
  });
});
