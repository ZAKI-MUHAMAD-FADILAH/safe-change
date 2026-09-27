import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  assertWithinBoundary,
  assertSafeScopePath,
  assertNoSymlinkOrJunction,
  PathSafetyError,
} from "../../src/installer/core/path-safety.js";
import { InstallationTransaction } from "../../src/installer/core/transaction.js";
import { _setNativeInstanceForTesting } from "../../src/native/index.js";

describe("graceful fallback between native and typescript implementations", () => {
  let tempDir: string;
  let workspaceRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-fallback-test-"));
    workspaceRoot = path.join(tempDir, "my-project");
    fs.mkdirSync(workspaceRoot, { recursive: true });
  });

  afterEach(() => {
    _setNativeInstanceForTesting(null);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("functions correctly using TypeScript fallback when native module is unavailable", () => {
    _setNativeInstanceForTesting(null);

    const validTarget = path.join(workspaceRoot, "subdir", "file.txt");
    const result = assertWithinBoundary(workspaceRoot, validTarget);
    expect(result.resolvedTarget).toBe(path.resolve(validTarget));
    expect(result.resolvedBoundary).toBe(path.resolve(workspaceRoot));

    const escapeTarget = path.join(tempDir, "outside.txt");
    expect(() => {
      assertWithinBoundary(workspaceRoot, escapeTarget);
    }).toThrow(PathSafetyError);
  });

  it("assertSafeScopePath works with pure TypeScript fallback", () => {
    _setNativeInstanceForTesting(null);

    const targetPath = path.join(workspaceRoot, ".agents", "skills", "safe-change", "SKILL.md");

    const validated = assertSafeScopePath({
      scope: "project",
      targetPath,
      workspaceRoot,
      homeDir: path.join(tempDir, "mock-home"),
    });

    expect(validated.resolvedTarget).toBe(path.resolve(targetPath));
    expect(validated.resolvedBoundary).toBe(path.resolve(workspaceRoot));
  });

  it("assertNoSymlinkOrJunction rejects symlinks via native when native is active", () => {
    _setNativeInstanceForTesting({
      version: () => "0.2.0-mock",
      checkPathBoundary: () => true,
      resolveAndCheckBoundary: () => true,
      isSymlinkOrJunction: (target: string) => target.includes("bad-symlink"),
      atomicWriteFile: () => true,
      lockFile: () => 1,
      unlockFile: () => true,
    });

    const goodPath = path.join(workspaceRoot, "good-file.txt");
    const badPath = path.join(workspaceRoot, "bad-symlink.txt");

    expect(() => assertNoSymlinkOrJunction(goodPath)).not.toThrow();
    expect(() => assertNoSymlinkOrJunction(badPath)).toThrow(PathSafetyError);
  });

  it("InstallationTransaction commits successfully with fallback or native atomic rename", () => {
    const targetDir = path.join(workspaceRoot, "installed-target");

    const tx = new InstallationTransaction({
      targetDir,
    });

    tx.stageFile("SKILL.md", "# Test Skill");
    tx.commit();

    expect(fs.existsSync(path.join(targetDir, "SKILL.md"))).toBe(true);
    expect(fs.readFileSync(path.join(targetDir, "SKILL.md"), "utf8")).toBe("# Test Skill");
  });

  it("delegates to native when native is active and respects negative verdict", () => {
    _setNativeInstanceForTesting({
      version: () => "0.2.0-mock",
      checkPathBoundary: () => false,
      resolveAndCheckBoundary: () => false,
      isSymlinkOrJunction: () => false,
      atomicWriteFile: () => true,
      lockFile: () => 1,
      unlockFile: () => true,
    });

    const target = path.join(workspaceRoot, "file.txt");
    expect(() => {
      assertWithinBoundary(workspaceRoot, target);
    }).toThrow(PathSafetyError);

    try {
      assertWithinBoundary(workspaceRoot, target);
    } catch (err) {
      expect(err).toBeInstanceOf(PathSafetyError);
      expect((err as PathSafetyError).code).toBe("PATH_TRAVERSAL");
    }
  });

  it("delegates to native when native is active and accepts positive verdict", () => {
    _setNativeInstanceForTesting({
      version: () => "0.2.0-mock",
      checkPathBoundary: () => true,
      resolveAndCheckBoundary: () => true,
      isSymlinkOrJunction: () => false,
      atomicWriteFile: () => true,
      lockFile: () => 1,
      unlockFile: () => true,
    });

    const target = path.join(workspaceRoot, "file.txt");
    const result = assertWithinBoundary(workspaceRoot, target);
    expect(result.resolvedTarget).toBe(path.resolve(target));
  });
});
