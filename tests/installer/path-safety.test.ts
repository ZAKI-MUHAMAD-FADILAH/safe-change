import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  PathSafetyError,
  assertWithinBoundary,
  assertNoSymlinkOrJunction,
  assertSafeScopePath,
  isFileSystemCaseInsensitive,
  normalizePathCase,
  getDefaultGlobalAllowlist,
} from "../../src/installer/core/path-safety.js";

describe("installer/core/path-safety", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "safe-change-test-path-safety-"));
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

  describe("assertWithinBoundary", () => {
    it("should accept valid nested subpaths within boundary", () => {
      const boundary = path.join(tempDir, "workspace");
      fs.mkdirSync(boundary, { recursive: true });
      const target = path.join(boundary, ".agents", "skills", "safe-change", "SKILL.md");

      const result = assertWithinBoundary(boundary, target);
      expect(result.resolvedBoundary).toBe(path.resolve(boundary));
      expect(result.resolvedTarget).toBe(path.resolve(target));
      expect(result.relativePath).toBe(path.join(".agents", "skills", "safe-change", "SKILL.md"));
    });

    it("should reject path traversal attempting to escape boundary via ..", () => {
      const boundary = path.join(tempDir, "workspace");
      fs.mkdirSync(boundary, { recursive: true });
      const target = path.join(boundary, "..", "escaped.txt");

      expect(() => assertWithinBoundary(boundary, target)).toThrowError(PathSafetyError);
      expect(() => assertWithinBoundary(boundary, target)).toThrowError(/Path traversal rejected/);
    });

    it("should handle paths containing spaces properly", () => {
      const boundary = path.join(tempDir, "workspace with spaces");
      fs.mkdirSync(boundary, { recursive: true });
      const target = path.join(boundary, "sub folder", "safe-change skill.md");

      const result = assertWithinBoundary(boundary, target);
      expect(result.resolvedBoundary).toBe(path.resolve(boundary));
      expect(result.resolvedTarget).toBe(path.resolve(target));
    });

    it("should handle Unicode paths properly", () => {
      const boundary = path.join(tempDir, "proyêk-sâfe-chânge-🚀");
      fs.mkdirSync(boundary, { recursive: true });
      const target = path.join(boundary, "技能", "SKILL.md");

      const result = assertWithinBoundary(boundary, target);
      expect(result.resolvedBoundary).toBe(path.resolve(boundary));
      expect(result.resolvedTarget).toBe(path.resolve(target));
    });
  });

  describe("assertNoSymlinkOrJunction", () => {
    it("should pass for regular non-existent or regular files", () => {
      const target = path.join(tempDir, "regular-file.txt");
      fs.writeFileSync(target, "hello");
      expect(() => assertNoSymlinkOrJunction(target)).not.toThrow();
    });

    it("should reject when target itself is a symlink", () => {
      const realFile = path.join(tempDir, "real.txt");
      const symlinkFile = path.join(tempDir, "symlink.txt");
      fs.writeFileSync(realFile, "content");

      try {
        fs.symlinkSync(realFile, symlinkFile);
        expect(() => assertNoSymlinkOrJunction(symlinkFile)).toThrowError(PathSafetyError);
        expect(() => assertNoSymlinkOrJunction(symlinkFile)).toThrowError(/symbolic link or junction point/);
      } catch (err: any) {
        // If unprivileged on Windows, symlink creation can fail; skip assert if cannot create
        if (err?.code !== "EPERM") {
          throw err;
        }
      }
    });

    it("should reject when an ancestor directory is a symlink", () => {
      const realDir = path.join(tempDir, "real-dir");
      const symlinkDir = path.join(tempDir, "symlink-dir");
      fs.mkdirSync(realDir, { recursive: true });

      try {
        fs.symlinkSync(realDir, symlinkDir, "dir");
        const nestedFile = path.join(symlinkDir, "sub", "file.txt");

        expect(() =>
          assertNoSymlinkOrJunction(nestedFile, { checkAncestorsUpTo: tempDir })
        ).toThrowError(PathSafetyError);
      } catch (err: any) {
        if (err?.code !== "EPERM") {
          throw err;
        }
      }
    });
  });

  describe("assertSafeScopePath", () => {
    const fakeHome = path.join(os.tmpdir(), "fake-home-user");

    beforeEach(() => {
      fs.mkdirSync(fakeHome, { recursive: true });
    });

    afterEach(() => {
      if (fs.existsSync(fakeHome)) {
        try {
          fs.rmSync(fakeHome, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    });

    it("should reject target path equal to home directory root", () => {
      expect(() =>
        assertSafeScopePath({
          scope: "project",
          targetPath: fakeHome,
          workspaceRoot: fakeHome,
          homeDir: fakeHome,
        })
      ).toThrowError(/Target path cannot be the user home directory root/);
    });

    it("should reject workspaceRoot equal to home directory root", () => {
      const target = path.join(fakeHome, ".agents", "skills", "safe-change");
      expect(() =>
        assertSafeScopePath({
          scope: "project",
          targetPath: target,
          workspaceRoot: fakeHome,
          homeDir: fakeHome,
        })
      ).toThrowError(/Workspace root cannot be the user home directory root/);
    });

    it("should reject case-variants of home directory root on case-insensitive filesystems", () => {
      const isCi = isFileSystemCaseInsensitive();
      const variantHome = isCi ? fakeHome.toUpperCase() : fakeHome;

      expect(() =>
        assertSafeScopePath({
          scope: "project",
          targetPath: variantHome,
          workspaceRoot: path.join(fakeHome, "valid-workspace"),
          homeDir: fakeHome,
          caseInsensitive: true,
        })
      ).toThrowError(/Target path cannot be the user home directory root/);
    });

    it("should accept valid project workspace under home directory", () => {
      const projectWorkspace = path.join(fakeHome, "projects", "repo-1");
      fs.mkdirSync(projectWorkspace, { recursive: true });
      const target = path.join(projectWorkspace, ".agents", "skills", "safe-change", "SKILL.md");

      const result = assertSafeScopePath({
        scope: "project",
        targetPath: target,
        workspaceRoot: projectWorkspace,
        homeDir: fakeHome,
      });

      expect(result.resolvedBoundary).toBe(path.resolve(projectWorkspace));
      expect(result.resolvedTarget).toBe(path.resolve(target));
    });

    it("should accept valid global scope target within allowed global subpaths", () => {
      const globalTarget = path.join(
        fakeHome,
        ".gemini",
        "config",
        "skills",
        "safe-change",
        "SKILL.md"
      );

      const result = assertSafeScopePath({
        scope: "global",
        targetPath: globalTarget,
        homeDir: fakeHome,
      });

      expect(result.resolvedTarget).toBe(path.resolve(globalTarget));
    });

    it("should reject global scope target pointing to arbitrary home subdirectory", () => {
      const arbitraryGlobal = path.join(fakeHome, ".bashrc");

      expect(() =>
        assertSafeScopePath({
          scope: "global",
          targetPath: arbitraryGlobal,
          homeDir: fakeHome,
        })
      ).toThrowError(/outside the authorized global allowlist/);
    });

    it("should reject global scope target pointing to arbitrary folder like Documents", () => {
      const arbitraryGlobal = path.join(fakeHome, "Documents", "safe-change");

      expect(() =>
        assertSafeScopePath({
          scope: "global",
          targetPath: arbitraryGlobal,
          homeDir: fakeHome,
        })
      ).toThrowError(/outside the authorized global allowlist/);
    });
  });
});
