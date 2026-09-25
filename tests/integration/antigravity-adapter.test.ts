import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as os from "node:os";
import {
  generateAntigravityBundle,
  verifyAntigravityBundleDrift,
  validateSafePath,
  cleanDirectoryWithRetry,
  ADAPTER_CLASSIFICATION,
} from "../fixtures/antigravity-adapter.js";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CANONICAL_SKILL_PATH = path.join(REPO_ROOT, "skills", "safe-change", "SKILL.md");
const BUNDLED_SKILL_PATH = path.join(
  REPO_ROOT,
  "plugins",
  "antigravity",
  "skills",
  "safe-change",
  "SKILL.md"
);
const PLUGINS_DIR = path.join(REPO_ROOT, "plugins");

describe("Antigravity Adapter Prototype", () => {
  const trackedTempDirs: string[] = [];

  function makeTempDir(prefix = "safe-change-adapter-test-"): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    trackedTempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    while (trackedTempDirs.length > 0) {
      const dir = trackedTempDirs.pop();
      if (dir && fs.existsSync(dir)) {
        cleanDirectoryWithRetry(dir);
      }
    }
  });

  it("should have canonical skill that exists as a regular file and not a symlink", () => {
    expect(fs.existsSync(CANONICAL_SKILL_PATH)).toBe(true);
    const stat = fs.lstatSync(CANONICAL_SKILL_PATH);
    expect(stat.isFile()).toBe(true);
    expect(stat.isSymbolicLink()).toBe(false);
  });

  it("should verify that bundled skill is byte-for-byte identical to canonical skill", () => {
    expect(fs.existsSync(BUNDLED_SKILL_PATH)).toBe(true);
    const canonicalBuf = fs.readFileSync(CANONICAL_SKILL_PATH);
    const bundledBuf = fs.readFileSync(BUNDLED_SKILL_PATH);

    expect(Buffer.compare(canonicalBuf, bundledBuf)).toBe(0);
    expect(bundledBuf.length).toBe(canonicalBuf.length);
  });

  it("should verify that SHA-256 hashes match exactly between canonical and bundle", () => {
    const canonicalBuf = fs.readFileSync(CANONICAL_SKILL_PATH);
    const bundledBuf = fs.readFileSync(BUNDLED_SKILL_PATH);

    const canonicalHash = crypto.createHash("sha256").update(canonicalBuf).digest("hex");
    const bundledHash = crypto.createHash("sha256").update(bundledBuf).digest("hex");

    expect(bundledHash).toBe(canonicalHash);

    const driftCheck = verifyAntigravityBundleDrift();
    expect(driftCheck.matches).toBe(true);
    expect(driftCheck.canonicalHash).toBe(canonicalHash);
    expect(driftCheck.bundledHash).toBe(bundledHash);
  });

  it("should generate identical bundle deterministically on repeated generation passes", () => {
    const tempTarget = makeTempDir("antigravity-deterministic-");

    const pass1 = generateAntigravityBundle({
      sourceSkillPath: CANONICAL_SKILL_PATH,
      targetPluginDir: tempTarget,
      allowHomeDirInTest: true,
    });

    const pass2 = generateAntigravityBundle({
      sourceSkillPath: CANONICAL_SKILL_PATH,
      targetPluginDir: tempTarget,
      allowHomeDirInTest: true,
    });

    expect(pass1.status).toBe("success");
    expect(pass2.status).toBe("success");
    expect(pass1.canonicalHash).toBe(pass2.canonicalHash);
    expect(pass1.bundledHash).toBe(pass2.bundledHash);
    expect(pass1.bytesWritten).toBe(pass2.bytesWritten);
    expect(pass1.classification).toBe(ADAPTER_CLASSIFICATION);
  });

  it("should detect drift if canonical skill or bundled skill is modified", () => {
    const tempTarget = makeTempDir("antigravity-drift-");

    generateAntigravityBundle({
      sourceSkillPath: CANONICAL_SKILL_PATH,
      targetPluginDir: tempTarget,
      allowHomeDirInTest: true,
    });

    // Artificially modify the bundled file to simulate drift
    const bundledFile = path.join(tempTarget, "skills", "safe-change", "SKILL.md");
    fs.appendFileSync(bundledFile, "\n<!-- drift modification -->\n");

    const driftResult = verifyAntigravityBundleDrift({
      sourceSkillPath: CANONICAL_SKILL_PATH,
      targetPluginDir: tempTarget,
    });

    expect(driftResult.matches).toBe(false);
    expect(driftResult.canonicalHash).not.toBe(driftResult.bundledHash);
  });

  it("should preserve valid YAML frontmatter with name and description in bundled skill", () => {
    const content = fs.readFileSync(BUNDLED_SKILL_PATH, "utf8");
    const lines = content.split(/\r?\n/);

    expect(lines[0].trim()).toBe("---");
    let closingIndex = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        closingIndex = i;
        break;
      }
    }
    expect(closingIndex).toBeGreaterThan(0);

    const frontmatter = lines.slice(1, closingIndex).join("\n");
    expect(frontmatter).toContain("name: safe-change");
    expect(frontmatter).toContain("description:");
  });

  it("should contain zero emoji in both canonical and bundled skill", () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    const canonicalContent = fs.readFileSync(CANONICAL_SKILL_PATH, "utf8");
    const bundledContent = fs.readFileSync(BUNDLED_SKILL_PATH, "utf8");

    expect(emojiRegex.test(canonicalContent)).toBe(false);
    expect(emojiRegex.test(bundledContent)).toBe(false);
  });

  it("should contain zero private local paths in canonical and bundled skill", () => {
    const privatePathRegex = new RegExp(
      "(?:" +
        ["file:", "///"].join("") +
        "|" +
        ["One", "Drive"].join("") +
        "|" +
        ["C:", "\\", "Users", "\\"].join("") + "[a-zA-Z0-9_-]+" +
        "|" +
        ["/", "Users", "/"].join("") + "[a-zA-Z0-9_-]+" +
        "|" +
        ["/", "home", "/"].join("") + "[a-zA-Z0-9_-]+" +
        ")"
    );

    const canonicalContent = fs.readFileSync(CANONICAL_SKILL_PATH, "utf8");
    const bundledContent = fs.readFileSync(BUNDLED_SKILL_PATH, "utf8");

    expect(privatePathRegex.test(canonicalContent)).toBe(false);
    expect(privatePathRegex.test(bundledContent)).toBe(false);
  });

  it("should not use symbolic links or NTFS junctions anywhere in the bundle tree", () => {
    const pluginDir = path.join(REPO_ROOT, "plugins", "antigravity");
    const skillDir = path.join(pluginDir, "skills", "safe-change");

    expect(fs.lstatSync(pluginDir).isSymbolicLink()).toBe(false);
    expect(fs.lstatSync(skillDir).isSymbolicLink()).toBe(false);
    expect(fs.lstatSync(BUNDLED_SKILL_PATH).isSymbolicLink()).toBe(false);
  });

  it("should reject writing directly to the real home directory root", () => {
    expect(() => {
      validateSafePath(os.homedir());
    }).toThrow(/Safety violation: target cannot be the home directory root/);
  });

  it("should verify that unrelated plugin directories remain absent", () => {
    const forbiddenAgents = [
      "claude-code",
      "cursor",
      "codex",
      "cline",
      "kimi-code",
      "amp",
      "opencode",
      "gemini-cli",
    ];

    for (const agent of forbiddenAgents) {
      const agentDir = path.join(PLUGINS_DIR, agent);
      expect(fs.existsSync(agentDir)).toBe(false);
    }

    // Verify only antigravity exists inside plugins
    const entries = fs.readdirSync(PLUGINS_DIR);
    expect(entries).toEqual(["antigravity"]);
  });

  it("should cleanly remove temporary fixture directories and report failure if directory cannot be cleaned", () => {
    const tempDir = makeTempDir("antigravity-cleanup-test-");
    const testFile = path.join(tempDir, "sample.txt");
    fs.writeFileSync(testFile, "temporary test content");

    expect(fs.existsSync(testFile)).toBe(true);

    cleanDirectoryWithRetry(tempDir);
    expect(fs.existsSync(tempDir)).toBe(false);

    // Test failure reporting with mock
    const failingFs = {
      existsSync: () => true,
      rmSync: () => {
        throw new Error("EPERM: Permission denied");
      },
    };

    expect(() => {
      cleanDirectoryWithRetry("C:\\fake\\unremovable\\dir", {
        maxRetries: 2,
        retryDelayMs: 1,
        fsImpl: failingFs as any,
      });
    }).toThrow(/Failed to clean directory after 2 attempts/);
  });

  it("should throw actionable error when canonical skill is missing or malformed", () => {
    const tempTarget = makeTempDir("antigravity-missing-test-");
    const nonExistentPath = path.join(tempTarget, "nonexistent", "SKILL.md");

    expect(() => {
      generateAntigravityBundle({
        sourceSkillPath: nonExistentPath,
        targetPluginDir: tempTarget,
        allowHomeDirInTest: true,
      });
    }).toThrow(/Canonical skill file not found/);

    // Malformed frontmatter test
    const malformedFile = path.join(tempTarget, "MALFORMED_SKILL.md");
    fs.writeFileSync(malformedFile, "No frontmatter content here.");

    expect(() => {
      generateAntigravityBundle({
        sourceSkillPath: malformedFile,
        targetPluginDir: tempTarget,
        allowHomeDirInTest: true,
      });
    }).toThrow(/Canonical skill lacks opening YAML frontmatter delimiter/);
  });
});
