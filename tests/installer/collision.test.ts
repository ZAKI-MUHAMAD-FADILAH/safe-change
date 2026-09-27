import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  inspectCollision,
  canSafelyWrite,
} from "../../src/installer/core/collision.js";

describe("installer/core/collision", () => {
  let tempDir: string;
  let sampleSourceFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "safe-change-test-collision-"));
    sampleSourceFile = path.join(tempDir, "canonical-skill.md");
    fs.writeFileSync(sampleSourceFile, "---\nname: safe-change\n---\n# canonical content\n");
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

  it("should detect non-existent target as not_found and allow write", () => {
    const targetDir = path.join(tempDir, "new-target-dir");
    const inspection = inspectCollision({
      targetPath: targetDir,
      expectedType: "directory",
      sourceSkillFile: sampleSourceFile,
    });

    expect(inspection.exists).toBe(false);
    expect(inspection.state).toBe("not_found");
    expect(inspection.isIdentical).toBe(false);

    const writeCheck = canSafelyWrite(inspection);
    expect(writeCheck.canWrite).toBe(true);
  });

  it("should detect existing directory with identical content as directory_identical", () => {
    const targetDir = path.join(tempDir, "identical-target-dir");
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(sampleSourceFile, path.join(targetDir, "SKILL.md"));

    const inspection = inspectCollision({
      targetPath: targetDir,
      expectedType: "directory",
      sourceSkillFile: sampleSourceFile,
    });

    expect(inspection.exists).toBe(true);
    expect(inspection.state).toBe("directory_identical");
    expect(inspection.isIdentical).toBe(true);

    const writeCheck = canSafelyWrite(inspection);
    expect(writeCheck.canWrite).toBe(true);
  });

  it("should detect existing directory with different content as directory_different", () => {
    const targetDir = path.join(tempDir, "different-target-dir");
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, "SKILL.md"), "# completely different content\n");

    const inspection = inspectCollision({
      targetPath: targetDir,
      expectedType: "directory",
      sourceSkillFile: sampleSourceFile,
    });

    expect(inspection.exists).toBe(true);
    expect(inspection.state).toBe("directory_different");
    expect(inspection.isIdentical).toBe(false);

    const writeWithoutOverwrite = canSafelyWrite(inspection, { overwrite: false });
    expect(writeWithoutOverwrite.canWrite).toBe(false);
    expect(writeWithoutOverwrite.reason).toMatch(/Collision detected/);

    const writeWithOverwrite = canSafelyWrite(inspection, { overwrite: true });
    expect(writeWithOverwrite.canWrite).toBe(true);
  });

  it("should detect regular file blocking an expected directory path", () => {
    const blockingFile = path.join(tempDir, "blocking-file");
    fs.writeFileSync(blockingFile, "regular file content");

    const inspection = inspectCollision({
      targetPath: blockingFile,
      expectedType: "directory",
      sourceSkillFile: sampleSourceFile,
    });

    expect(inspection.exists).toBe(true);
    expect(inspection.isFile).toBe(true);
    expect(inspection.isDirectory).toBe(false);
    expect(inspection.state).toBe("file_blocking_directory");

    const writeCheck = canSafelyWrite(inspection, { overwrite: true });
    expect(writeCheck.canWrite).toBe(false);
    expect(writeCheck.reason).toMatch(/regular file occupies/);
  });

  it("should detect symbolic link target as symlink_or_junction", () => {
    const realDir = path.join(tempDir, "real-target");
    const linkDir = path.join(tempDir, "link-target");
    fs.mkdirSync(realDir, { recursive: true });

    try {
      fs.symlinkSync(realDir, linkDir, "dir");
      const inspection = inspectCollision({
        targetPath: linkDir,
        expectedType: "directory",
      });

      expect(inspection.exists).toBe(true);
      expect(inspection.isSymlink).toBe(true);
      expect(inspection.state).toBe("symlink_or_junction");

      const writeCheck = canSafelyWrite(inspection, { overwrite: true });
      expect(writeCheck.canWrite).toBe(false);
      expect(writeCheck.reason).toMatch(/symbolic link or directory junction/);
    } catch (err: any) {
      if (err?.code !== "EPERM") {
        throw err;
      }
    }
  });

  it("should detect safe-change ownership manifest", () => {
    const targetDir = path.join(tempDir, "owned-target-dir");
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(sampleSourceFile, path.join(targetDir, "SKILL.md"));

    const manifestData = {
      owner: "safe-change",
      version: "0.1.0",
      scope: "project",
      agent: "antigravity",
      installedAt: new Date().toISOString(),
      sha256: "fake-hash",
    };
    fs.writeFileSync(
      path.join(targetDir, ".safe-change-manifest.json"),
      JSON.stringify(manifestData, null, 2)
    );

    const inspection = inspectCollision({
      targetPath: targetDir,
      expectedType: "directory",
      sourceSkillFile: sampleSourceFile,
    });

    expect(inspection.ownership.hasManifest).toBe(true);
    expect(inspection.ownership.isSafeChangeOwned).toBe(true);
    expect(inspection.ownership.owner).toBe("safe-change");
    expect(inspection.ownership.version).toBe("0.1.0");
    expect(inspection.state).toBe("directory_identical");
  });

  it("should detect foreign or invalid ownership manifest as ownership_conflict", () => {
    const targetDir = path.join(tempDir, "foreign-target-dir");
    fs.mkdirSync(targetDir, { recursive: true });

    const foreignManifest = {
      owner: "other-agent-manager",
      version: "2.0.0",
    };
    fs.writeFileSync(
      path.join(targetDir, ".safe-change-manifest.json"),
      JSON.stringify(foreignManifest, null, 2)
    );

    const inspection = inspectCollision({
      targetPath: targetDir,
      expectedType: "directory",
      sourceSkillFile: sampleSourceFile,
    });

    expect(inspection.ownership.hasManifest).toBe(true);
    expect(inspection.ownership.isSafeChangeOwned).toBe(false);
    expect(inspection.state).toBe("ownership_conflict");

    const writeCheck = canSafelyWrite(inspection, { overwrite: true });
    expect(writeCheck.canWrite).toBe(false);
    expect(writeCheck.reason).toMatch(/ownership manifest owned by another tool/i);
  });

  it("should handle directory with missing ownership manifest", () => {
    const targetDir = path.join(tempDir, "unowned-target-dir");
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, "unrelated.txt"), "some content");

    const inspection = inspectCollision({
      targetPath: targetDir,
      expectedType: "directory",
    });

    expect(inspection.exists).toBe(true);
    expect(inspection.ownership.hasManifest).toBe(false);
    expect(inspection.ownership.isSafeChangeOwned).toBe(false);
  });
});
