import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import { AntigravityAdapter } from "../../src/installer/adapters/antigravity.js";
import { DEFAULT_MANIFEST_FILENAME } from "../../src/installer/core/ownership.js";

function sha256(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

describe("installer/adapters/antigravity", () => {
  let tempDir: string;
  let fakeHome: string;
  let fakeWorkspace: string;
  let canonicalSkillPath: string;
  let canonicalContent: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "safe-change-test-agy-adapter-"));
    fakeHome = path.join(tempDir, "fake-home");
    fakeWorkspace = path.join(tempDir, "workspace-project");
    fs.mkdirSync(fakeHome, { recursive: true });
    fs.mkdirSync(fakeWorkspace, { recursive: true });

    // Create a canonical skill source
    canonicalContent = "---\nname: safe-change\ndescription: Test skill\n---\n# safe-change\nCanonical content.\n";
    const skillDir = path.join(tempDir, "skills", "safe-change");
    fs.mkdirSync(skillDir, { recursive: true });
    canonicalSkillPath = path.join(skillDir, "SKILL.md");
    fs.writeFileSync(canonicalSkillPath, canonicalContent);
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

  function createAdapter(): AntigravityAdapter {
    return new AntigravityAdapter(canonicalSkillPath);
  }

  describe("resolveTargetDir", () => {
    it("should resolve project scope target to .agents/skills/safe-change under workspaceRoot", () => {
      const adapter = createAdapter();
      const dir = adapter.resolveTargetDir({
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
      });
      expect(dir).toBe(path.resolve(fakeWorkspace, ".agents", "skills", "safe-change"));
    });

    it("should resolve global scope target to .gemini/config/skills/safe-change under homeDir", () => {
      const adapter = createAdapter();
      const dir = adapter.resolveTargetDir({
        scope: "global",
        homeDir: fakeHome,
      });
      expect(dir).toBe(path.resolve(fakeHome, ".gemini", "config", "skills", "safe-change"));
    });
  });

  describe("install (project scope)", () => {
    it("should install skill to project scope with byte-identical copy and SHA-256 match", () => {
      const adapter = createAdapter();
      const result = adapter.install({
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
      });

      expect(result.status).toBe("installed");
      expect(result.agent).toBe("antigravity");
      expect(result.scope).toBe("project");
      expect(result.sha256).toBe(sha256(canonicalContent));

      // Verify installed file
      const installedPath = path.join(
        fakeWorkspace, ".agents", "skills", "safe-change", "SKILL.md"
      );
      expect(fs.existsSync(installedPath)).toBe(true);

      const installedContent = fs.readFileSync(installedPath, "utf8");
      expect(installedContent).toBe(canonicalContent);

      // Verify manifest
      const manifestPath = path.join(
        fakeWorkspace, ".agents", "skills", "safe-change", DEFAULT_MANIFEST_FILENAME
      );
      expect(fs.existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      expect(manifest.owner).toBe("safe-change");
      expect(manifest.agent).toBe("antigravity");
      expect(manifest.scope).toBe("project");
      expect(manifest.files["SKILL.md"]).toBe(sha256(canonicalContent));
    });

    it("should report up_to_date when identical content is already installed", () => {
      const adapter = createAdapter();
      // First install
      adapter.install({
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
      });
      // Second install
      const result = adapter.install({
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
      });
      expect(result.status).toBe("up_to_date");
    });

    it("should report collision_detected when content differs without --overwrite", () => {
      const adapter = createAdapter();
      // Pre-populate target with different content
      const targetDir = path.join(fakeWorkspace, ".agents", "skills", "safe-change");
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, "SKILL.md"), "# Different content\n");

      const result = adapter.install({
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
        overwrite: false,
      });
      expect(result.status).toBe("collision_detected");
    });

    it("should overwrite different content when --overwrite is true", () => {
      const adapter = createAdapter();
      // Pre-populate target with different content
      const targetDir = path.join(fakeWorkspace, ".agents", "skills", "safe-change");
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, "SKILL.md"), "# Different content\n");

      const result = adapter.install({
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
        overwrite: true,
      });
      expect(result.status).toBe("updated");
      expect(result.sha256).toBe(sha256(canonicalContent));

      const installedContent = fs.readFileSync(
        path.join(targetDir, "SKILL.md"), "utf8"
      );
      expect(installedContent).toBe(canonicalContent);
    });

    it("should detect and reject symlink at target path", () => {
      const adapter = createAdapter();
      const parentDir = path.join(fakeWorkspace, ".agents", "skills");
      fs.mkdirSync(parentDir, { recursive: true });

      const realDir = path.join(tempDir, "real-safe-change");
      fs.mkdirSync(realDir, { recursive: true });

      try {
        fs.symlinkSync(realDir, path.join(parentDir, "safe-change"), "dir");

        const result = adapter.install({
          scope: "project",
          workspaceRoot: fakeWorkspace,
          homeDir: fakeHome,
        });
        expect(result.status).toBe("cancelled");
      } catch (err: any) {
        if (err?.code !== "EPERM") {
          throw err;
        }
      }
    });
  });

  describe("install (global scope)", () => {
    it("should install skill to global scope within allowlist", () => {
      const adapter = createAdapter();
      const result = adapter.install({
        scope: "global",
        homeDir: fakeHome,
      });

      expect(result.status).toBe("installed");
      expect(result.agent).toBe("antigravity");
      expect(result.scope).toBe("global");

      const installedPath = path.join(
        fakeHome, ".gemini", "config", "skills", "safe-change", "SKILL.md"
      );
      expect(fs.existsSync(installedPath)).toBe(true);

      const content = fs.readFileSync(installedPath, "utf8");
      expect(content).toBe(canonicalContent);
    });
  });

  describe("install (dry-run)", () => {
    it("should report dry_run without writing to disk", () => {
      const adapter = createAdapter();
      const result = adapter.install({
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
        dryRun: true,
      });

      expect(result.status).toBe("dry_run");
      expect(result.sha256).toBe(sha256(canonicalContent));

      const targetDir = path.join(
        fakeWorkspace, ".agents", "skills", "safe-change"
      );
      expect(fs.existsSync(targetDir)).toBe(false);
    });
  });

  describe("update", () => {
    it("should update installed content when canonical source changes", () => {
      const adapter = createAdapter();
      // First install
      adapter.install({
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
      });

      // Modify canonical
      const newContent = "---\nname: safe-change\n---\n# Updated canonical\n";
      fs.writeFileSync(canonicalSkillPath, newContent);

      const result = adapter.update({
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
      });

      expect(result.status).toBe("updated");
      expect(result.sha256).toBe(sha256(newContent));

      const installed = fs.readFileSync(
        path.join(fakeWorkspace, ".agents", "skills", "safe-change", "SKILL.md"),
        "utf8"
      );
      expect(installed).toBe(newContent);
    });

    it("should reject update when no manifest exists", () => {
      const adapter = createAdapter();
      // Create target without manifest
      const targetDir = path.join(fakeWorkspace, ".agents", "skills", "safe-change");
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, "SKILL.md"), "content");

      const result = adapter.update({
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
      });

      expect(result.status).toBe("ownership_conflict");
    });
  });

  describe("uninstall", () => {
    it("should uninstall previously installed skill", () => {
      const adapter = createAdapter();
      adapter.install({
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
      });

      const result = adapter.uninstall({
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
      });

      expect(result.status).toBe("uninstalled");

      const targetDir = path.join(
        fakeWorkspace, ".agents", "skills", "safe-change"
      );
      expect(fs.existsSync(targetDir)).toBe(false);
    });

    it("should report not_found when target does not exist", () => {
      const adapter = createAdapter();
      const result = adapter.uninstall({
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
      });
      expect(result.status).toBe("not_found");
    });

    it("should reject uninstall when manifest is missing", () => {
      const adapter = createAdapter();
      const targetDir = path.join(fakeWorkspace, ".agents", "skills", "safe-change");
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, "SKILL.md"), "orphan");

      const result = adapter.uninstall({
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
      });
      expect(result.status).toBe("ownership_conflict");
    });
  });

  describe("status", () => {
    it("should report not installed when target does not exist", () => {
      const adapter = createAdapter();
      const st = adapter.status({
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
      });

      expect(st.installed).toBe(false);
      expect(st.hasDrift).toBe(false);
      expect(st.manifest).toBeNull();
      expect(st.canonicalSha256).toBe(sha256(canonicalContent));
      expect(st.installedSha256).toBeNull();
    });

    it("should report installed with no drift when content matches", () => {
      const adapter = createAdapter();
      adapter.install({
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
      });

      const st = adapter.status({
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
      });

      expect(st.installed).toBe(true);
      expect(st.hasDrift).toBe(false);
      expect(st.canonicalSha256).toBe(sha256(canonicalContent));
      expect(st.installedSha256).toBe(sha256(canonicalContent));
      expect(st.manifest).not.toBeNull();
      expect(st.manifest!.owner).toBe("safe-change");
    });

    it("should detect drift when installed content diverges from canonical", () => {
      const adapter = createAdapter();
      adapter.install({
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
      });

      // Tamper with installed file
      const installedPath = path.join(
        fakeWorkspace, ".agents", "skills", "safe-change", "SKILL.md"
      );
      fs.writeFileSync(installedPath, "# Tampered content\n");

      const st = adapter.status({
        scope: "project",
        workspaceRoot: fakeWorkspace,
        homeDir: fakeHome,
      });

      expect(st.installed).toBe(true);
      expect(st.hasDrift).toBe(true);
      expect(st.canonicalSha256).not.toBe(st.installedSha256);
    });
  });

  describe("adapter identity", () => {
    it("should have correct agentName and displayName", () => {
      const adapter = createAdapter();
      expect(adapter.agentName).toBe("antigravity");
      expect(adapter.displayName).toBe("Antigravity (Google DeepMind)");
    });

    it("should use the provided canonical skill path", () => {
      const adapter = createAdapter();
      expect(adapter.canonicalSkillPath).toBe(path.resolve(canonicalSkillPath));
    });
  });
});
