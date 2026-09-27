import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import {
  SUPPORTED_AGENTS,
  getAdapter,
  getAllAdapters,
  ClaudeCodeAdapter,
  CursorAdapter,
  CodexAdapter,
  ClineAdapter,
  KimiCodeAdapter,
  AmpAdapter,
  OpenCodeAdapter,
  GeminiCliAdapter,
  GitHubCopilotAdapter,
} from "../../src/installer/adapters/index.js";
import { ExitCodes } from "../../src/types/index.js";

describe("Multi-Agent Adapters (v0.2.0)", () => {
  let tempDir: string;
  let fakeWorkspace: string;
  let fakeHome: string;
  let canonicalSkillPath: string;
  let canonicalContent: string;
  let expectedSha256: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-multi-adapter-test-"));
    fakeWorkspace = path.join(tempDir, "workspace");
    fakeHome = path.join(tempDir, "home");
    fs.mkdirSync(fakeWorkspace, { recursive: true });
    fs.mkdirSync(fakeHome, { recursive: true });

    canonicalContent = "---\nname: safe-change\ndescription: Safety net\n---\n# safe-change\nCanonical test content.\n";
    canonicalSkillPath = path.join(tempDir, "canonical", "SKILL.md");
    fs.mkdirSync(path.dirname(canonicalSkillPath), { recursive: true });
    fs.writeFileSync(canonicalSkillPath, canonicalContent, "utf8");
    expectedSha256 = crypto.createHash("sha256").update(canonicalContent).digest("hex");
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

  it("should have exactly 10 supported agents in registry", () => {
    expect(SUPPORTED_AGENTS).toHaveLength(10);
    expect(SUPPORTED_AGENTS).toEqual([
      "antigravity",
      "claude-code",
      "cursor",
      "codex",
      "cline",
      "kimi-code",
      "amp",
      "opencode",
      "gemini-cli",
      "github-copilot",
    ]);
  });

  it("should instantiate all 10 adapters via getAllAdapters", () => {
    const adapters = getAllAdapters(canonicalSkillPath);
    expect(adapters).toHaveLength(10);
    for (const adapter of adapters) {
      expect(adapter.canonicalSkillPath).toBe(path.resolve(canonicalSkillPath));
      expect(adapter.verificationStatus).toBe("filesystem-validated");
      expect(typeof adapter.notes).toBe("string");
      expect(adapter.notes.length).toBeGreaterThan(0);
    }
  });

  const adapterTestCases = [
    {
      name: "Claude Code",
      agentId: "claude-code",
      cls: ClaudeCodeAdapter,
      expectedProjectSubpath: ".claude/skills/safe-change",
      expectedGlobalSubpath: ".claude/skills/safe-change",
    },
    {
      name: "Cursor",
      agentId: "cursor",
      cls: CursorAdapter,
      expectedProjectSubpath: ".cursor/skills/safe-change",
      expectedGlobalSubpath: ".cursor/skills/safe-change",
    },
    {
      name: "Codex",
      agentId: "codex",
      cls: CodexAdapter,
      expectedProjectSubpath: ".codex/skills/safe-change",
      expectedGlobalSubpath: ".codex/skills/safe-change",
    },
    {
      name: "Cline",
      agentId: "cline",
      cls: ClineAdapter,
      expectedProjectSubpath: ".cline/skills/safe-change",
      expectedGlobalSubpath: ".cline/skills/safe-change",
    },
    {
      name: "Kimi Code",
      agentId: "kimi-code",
      cls: KimiCodeAdapter,
      expectedProjectSubpath: ".kimi-code/skills/safe-change",
      expectedGlobalSubpath: ".kimi-code/skills/safe-change",
    },
    {
      name: "Amp",
      agentId: "amp",
      cls: AmpAdapter,
      expectedProjectSubpath: ".agents/skills/safe-change",
      expectedGlobalSubpath: ".config/agents/skills/safe-change",
    },
    {
      name: "OpenCode",
      agentId: "opencode",
      cls: OpenCodeAdapter,
      expectedProjectSubpath: ".opencode/skills/safe-change",
      expectedGlobalSubpath: ".config/opencode/skills/safe-change",
    },
    {
      name: "Gemini CLI",
      agentId: "gemini-cli",
      cls: GeminiCliAdapter,
      expectedProjectSubpath: ".gemini/skills/safe-change",
      expectedGlobalSubpath: ".gemini/skills/safe-change",
    },
    {
      name: "GitHub Copilot",
      agentId: "github-copilot",
      cls: GitHubCopilotAdapter,
      expectedProjectSubpath: ".github/skills/safe-change",
      expectedGlobalSubpath: ".github/skills/safe-change",
    },
  ];

  for (const tc of adapterTestCases) {
    describe(`${tc.name} Adapter (${tc.agentId})`, () => {
      it("should resolve correct project and global target paths", () => {
        const adapter = getAdapter(tc.agentId, canonicalSkillPath)!;
        expect(adapter).toBeDefined();

        const projectTarget = adapter.resolveTargetDir({
          scope: "project",
          workspaceRoot: fakeWorkspace,
          homeDir: fakeHome,
        });
        expect(projectTarget).toBe(
          path.resolve(fakeWorkspace, ...tc.expectedProjectSubpath.split("/"))
        );

        const globalTarget = adapter.resolveTargetDir({
          scope: "global",
          workspaceRoot: fakeWorkspace,
          homeDir: fakeHome,
        });
        expect(globalTarget).toBe(
          path.resolve(fakeHome, ...tc.expectedGlobalSubpath.split("/"))
        );
      });

      it("should install byte-for-byte copy with matching SHA-256 and valid manifest in project scope", () => {
        const adapter = getAdapter(tc.agentId, canonicalSkillPath)!;
        const result = adapter.install({
          scope: "project",
          workspaceRoot: fakeWorkspace,
          homeDir: fakeHome,
        });

        expect(result.status).toBe("installed");
        expect(result.sha256).toBe(expectedSha256);

        const installedSkillPath = path.join(result.targetDir, "SKILL.md");
        expect(fs.existsSync(installedSkillPath)).toBe(true);

        const installedBytes = fs.readFileSync(installedSkillPath, "utf8");
        expect(installedBytes).toBe(canonicalContent);

        // Verify manifest
        const manifestPath = path.join(result.targetDir, ".safe-change-manifest.json");
        expect(fs.existsSync(manifestPath)).toBe(true);
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        expect(manifest.owner).toBe("safe-change");
        expect(manifest.agent).toBe(tc.agentId);
        expect(manifest.scope).toBe("project");
        expect(manifest.files["SKILL.md"]).toBe(expectedSha256);
      });

      it("should report up_to_date if installed again without changes", () => {
        const adapter = getAdapter(tc.agentId, canonicalSkillPath)!;
        adapter.install({
          scope: "project",
          workspaceRoot: fakeWorkspace,
          homeDir: fakeHome,
        });

        const secondResult = adapter.install({
          scope: "project",
          workspaceRoot: fakeWorkspace,
          homeDir: fakeHome,
        });
        expect(secondResult.status).toBe("up_to_date");
        expect(secondResult.sha256).toBe(expectedSha256);
      });

      it("should install into global scope within authorized subpath", () => {
        const adapter = getAdapter(tc.agentId, canonicalSkillPath)!;
        const result = adapter.install({
          scope: "global",
          workspaceRoot: fakeWorkspace,
          homeDir: fakeHome,
        });

        expect(result.status).toBe("installed");
        const installedSkillPath = path.join(result.targetDir, "SKILL.md");
        expect(fs.existsSync(installedSkillPath)).toBe(true);
        expect(fs.readFileSync(installedSkillPath, "utf8")).toBe(canonicalContent);
      });

      it("should report status accurately (installed vs not installed, and drift detection)", () => {
        const adapter = getAdapter(tc.agentId, canonicalSkillPath)!;

        // Before install
        const statusBefore = adapter.status({
          scope: "project",
          workspaceRoot: fakeWorkspace,
          homeDir: fakeHome,
        });
        expect(statusBefore.installed).toBe(false);
        expect(statusBefore.hasDrift).toBe(false);

        // After install
        adapter.install({
          scope: "project",
          workspaceRoot: fakeWorkspace,
          homeDir: fakeHome,
        });
        const statusAfter = adapter.status({
          scope: "project",
          workspaceRoot: fakeWorkspace,
          homeDir: fakeHome,
        });
        expect(statusAfter.installed).toBe(true);
        expect(statusAfter.hasDrift).toBe(false);

        // Tamper with skill file
        const skillPath = path.join(statusAfter.targetDir, "SKILL.md");
        fs.writeFileSync(skillPath, "tampered content");
        const statusDrift = adapter.status({
          scope: "project",
          workspaceRoot: fakeWorkspace,
          homeDir: fakeHome,
        });
        expect(statusDrift.hasDrift).toBe(true);
      });

      it("should uninstall cleanly when requested", () => {
        const adapter = getAdapter(tc.agentId, canonicalSkillPath)!;
        adapter.install({
          scope: "project",
          workspaceRoot: fakeWorkspace,
          homeDir: fakeHome,
        });

        const uninstResult = adapter.uninstall({
          scope: "project",
          workspaceRoot: fakeWorkspace,
          homeDir: fakeHome,
        });
        expect(uninstResult.status).toBe("uninstalled");
        expect(fs.existsSync(uninstResult.targetDir)).toBe(false);
      });
    });
  }
});
