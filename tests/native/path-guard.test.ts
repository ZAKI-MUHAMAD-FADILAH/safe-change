import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  isNativeAvailable,
  checkPathBoundaryNative,
  resolveAndCheckBoundaryNative,
  isSymlinkOrJunctionNative,
  atomicWriteFileNative,
  lockFileNative,
  unlockFileNative,
  _setNativeInstanceForTesting,
} from "../../src/native/index.js";

describe("native path guard", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-native-pg-"));
  });

  afterEach(() => {
    _setNativeInstanceForTesting(null);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it.skipIf(!isNativeAvailable())("evaluates real native path boundary checks if native is available", () => {
    const root = path.join(tempDir, "workspace");
    const subfile = path.join(root, "subdir", "file.txt");
    const outside = path.join(tempDir, "outside", "escaped.txt");

    fs.mkdirSync(path.join(root, "subdir"), { recursive: true });
    fs.mkdirSync(path.join(tempDir, "outside"), { recursive: true });
    fs.writeFileSync(subfile, "content");
    fs.writeFileSync(outside, "content");

    // Valid path inside root
    expect(checkPathBoundaryNative(subfile, root)).toBe(true);

    // Path outside root
    expect(checkPathBoundaryNative(outside, root)).toBe(false);

    // Path traversal attempt
    const traversal = path.join(root, "..", "outside", "escaped.txt");
    expect(checkPathBoundaryNative(traversal, root)).toBe(false);
  });

  it("returns null when native binary is absent and no mock is present", () => {
    if (!isNativeAvailable()) {
      const root = path.join(tempDir, "workspace");
      const subfile = path.join(root, "file.txt");
      expect(checkPathBoundaryNative(subfile, root)).toBeNull();
      expect(resolveAndCheckBoundaryNative(subfile, root)).toBeNull();
      expect(isSymlinkOrJunctionNative(subfile)).toBeNull();
      expect(atomicWriteFileNative(subfile, path.join(root, "dest.txt"))).toBeNull();
      expect(lockFileNative(subfile)).toBeNull();
      expect(unlockFileNative(1)).toBeNull();
    }
  });

  it("correctly delegates to NativeModule contract when native module is active", () => {
    const mockNative = {
      version: () => "0.2.0-mock",
      checkPathBoundary: (target: string, root: string) => {
        const resolvedTarget = path.resolve(target);
        const resolvedRoot = path.resolve(root);
        const rel = path.relative(resolvedRoot, resolvedTarget);
        return !rel.startsWith("..") && !path.isAbsolute(rel);
      },
      resolveAndCheckBoundary: (target: string, root: string) => {
        const resolvedTarget = path.resolve(target);
        const resolvedRoot = path.resolve(root);
        const rel = path.relative(resolvedRoot, resolvedTarget);
        return !rel.startsWith("..") && !path.isAbsolute(rel);
      },
      isSymlinkOrJunction: (target: string) => {
        return target.includes("symlink");
      },
      atomicWriteFile: (staging: string, dest: string) => {
        return fs.existsSync(staging) && !dest.includes("fail");
      },
      lockFile: (target: string) => {
        return target.includes("locked") ? null : 42;
      },
      unlockFile: (handle: number) => {
        return handle === 42;
      },
    };

    _setNativeInstanceForTesting(mockNative);

    const root = path.join(tempDir, "root");
    const validTarget = path.join(root, "file.txt");
    const outsideTarget = path.join(tempDir, "other", "file.txt");

    // Boundary check
    expect(checkPathBoundaryNative(validTarget, root)).toBe(true);
    expect(checkPathBoundaryNative(outsideTarget, root)).toBe(false);

    // Canonical boundary check
    expect(resolveAndCheckBoundaryNative(validTarget, root)).toBe(true);
    expect(resolveAndCheckBoundaryNative(outsideTarget, root)).toBe(false);

    // Symlink / junction check
    expect(isSymlinkOrJunctionNative(path.join(root, "real.txt"))).toBe(false);
    expect(isSymlinkOrJunctionNative(path.join(root, "my-symlink.txt"))).toBe(true);

    // Atomic write
    const stagingFile = path.join(tempDir, "staging.txt");
    fs.writeFileSync(stagingFile, "content");
    expect(atomicWriteFileNative(stagingFile, path.join(root, "dest.txt"))).toBe(true);
    expect(atomicWriteFileNative(stagingFile, path.join(root, "fail-dest.txt"))).toBe(false);

    // File lock and unlock
    expect(lockFileNative(validTarget)).toBe(42);
    expect(lockFileNative(path.join(tempDir, "already-locked.txt"))).toBeNull();
    expect(unlockFileNative(42)).toBe(true);
    expect(unlockFileNative(99)).toBe(false);
  });
});
