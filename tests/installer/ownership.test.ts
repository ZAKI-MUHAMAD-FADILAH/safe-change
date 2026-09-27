import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  createOwnershipManifest,
  writeOwnershipManifest,
  readOwnershipManifest,
  validateOwnership,
  verifyManifestIntegrity,
  OwnershipError,
  DEFAULT_MANIFEST_FILENAME,
} from "../../src/installer/core/ownership.js";

describe("installer/core/ownership", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "safe-change-test-ownership-"));
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

  it("should create and write ownership manifest with correct metadata and SHA-256 hashes", () => {
    const skillPath = path.join(tempDir, "SKILL.md");
    fs.writeFileSync(skillPath, "---\nname: safe-change\n---\n# safe-change skill\n");

    const manifest = createOwnershipManifest({
      version: "0.1.0",
      agent: "antigravity",
      scope: "project",
      targetDir: tempDir,
      installedFiles: ["SKILL.md"],
    });

    expect(manifest.owner).toBe("safe-change");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.agent).toBe("antigravity");
    expect(manifest.scope).toBe("project");
    expect(manifest.files["SKILL.md"]).toBeDefined();
    expect(typeof manifest.files["SKILL.md"]).toBe("string");

    const writtenPath = writeOwnershipManifest(tempDir, manifest);
    expect(fs.existsSync(writtenPath)).toBe(true);

    const readManifest = readOwnershipManifest(tempDir);
    expect(readManifest).toEqual(manifest);
  });

  it("should return null when manifest does not exist", () => {
    const manifest = readOwnershipManifest(tempDir);
    expect(manifest).toBeNull();
  });

  it("should throw OwnershipError when manifest is corrupt JSON", () => {
    const manifestPath = path.join(tempDir, DEFAULT_MANIFEST_FILENAME);
    fs.writeFileSync(manifestPath, "{ corrupt json ... invalid");

    expect(() => readOwnershipManifest(tempDir)).toThrowError(OwnershipError);
    expect(() => readOwnershipManifest(tempDir)).toThrowError(/Failed to parse ownership manifest/);
  });

  it("should throw OwnershipError when manifest schema is missing required fields", () => {
    const manifestPath = path.join(tempDir, DEFAULT_MANIFEST_FILENAME);
    fs.writeFileSync(manifestPath, JSON.stringify({ version: "0.1.0" }));

    expect(() => readOwnershipManifest(tempDir)).toThrowError(OwnershipError);
    expect(() => readOwnershipManifest(tempDir)).toThrowError(/Corrupt ownership manifest schema/);
  });

  it("should validate ownership successfully when manifest matches expected agent and scope", () => {
    const skillPath = path.join(tempDir, "SKILL.md");
    fs.writeFileSync(skillPath, "content");

    const manifest = createOwnershipManifest({
      version: "0.1.0",
      agent: "antigravity",
      scope: "project",
      targetDir: tempDir,
      installedFiles: ["SKILL.md"],
    });
    writeOwnershipManifest(tempDir, manifest);

    const result = validateOwnership(tempDir, {
      expectedAgent: "antigravity",
      expectedScope: "project",
    });

    expect(result.isValid).toBe(true);
    expect(result.manifest).toEqual(manifest);
    expect(result.errorReason).toBeUndefined();
  });

  it("should fail validation when manifest owner is foreign", () => {
    const manifestPath = path.join(tempDir, DEFAULT_MANIFEST_FILENAME);
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        owner: "foreign-tool",
        version: "1.0.0",
        agent: "antigravity",
        scope: "project",
        installedAt: new Date().toISOString(),
        files: {},
      })
    );

    const result = validateOwnership(tempDir);
    expect(result.isValid).toBe(false);
    expect(result.errorReason).toMatch(/Foreign ownership manifest found/);
  });

  it("should fail validation when agent or scope mismatches", () => {
    const skillPath = path.join(tempDir, "SKILL.md");
    fs.writeFileSync(skillPath, "content");

    const manifest = createOwnershipManifest({
      version: "0.1.0",
      agent: "antigravity",
      scope: "project",
      targetDir: tempDir,
      installedFiles: ["SKILL.md"],
    });
    writeOwnershipManifest(tempDir, manifest);

    const agentMismatch = validateOwnership(tempDir, { expectedAgent: "claude-code" });
    expect(agentMismatch.isValid).toBe(false);
    expect(agentMismatch.errorReason).toMatch(/Agent mismatch/);

    const scopeMismatch = validateOwnership(tempDir, { expectedScope: "global" });
    expect(scopeMismatch.isValid).toBe(false);
    expect(scopeMismatch.errorReason).toMatch(/Scope mismatch/);
  });

  it("should verify manifest integrity correctly detecting matching, modified, or missing files", () => {
    const file1 = path.join(tempDir, "file1.txt");
    const file2 = path.join(tempDir, "file2.txt");
    fs.writeFileSync(file1, "initial content 1");
    fs.writeFileSync(file2, "initial content 2");

    const manifest = createOwnershipManifest({
      version: "0.1.0",
      agent: "antigravity",
      scope: "project",
      targetDir: tempDir,
      installedFiles: ["file1.txt", "file2.txt"],
    });

    // 1. All match
    const check1 = verifyManifestIntegrity(tempDir, manifest);
    expect(check1.matches).toBe(true);
    expect(check1.modifiedFiles).toHaveLength(0);
    expect(check1.missingFiles).toHaveLength(0);

    // 2. Modify one file
    fs.writeFileSync(file1, "altered content");
    const check2 = verifyManifestIntegrity(tempDir, manifest);
    expect(check2.matches).toBe(false);
    expect(check2.modifiedFiles).toEqual(["file1.txt"]);

    // 3. Remove one file
    fs.rmSync(file2);
    const check3 = verifyManifestIntegrity(tempDir, manifest);
    expect(check3.matches).toBe(false);
    expect(check3.missingFiles).toEqual(["file2.txt"]);
  });
});
