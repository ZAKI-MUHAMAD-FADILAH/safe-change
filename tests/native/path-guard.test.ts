import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  isNativeAvailable,
  checkPathBoundaryNative,
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
    }
  });

  it("correctly delegates to NativeModule contract when native module is active", () => {
    const mockNative = {
      version: () => "0.1.0-mock",
      checkPathBoundary: (target: string, root: string) => {
        const resolvedTarget = path.resolve(target);
        const resolvedRoot = path.resolve(root);
        const rel = path.relative(resolvedRoot, resolvedTarget);
        return !rel.startsWith("..") && !path.isAbsolute(rel);
      },
    };

    _setNativeInstanceForTesting(mockNative);

    const root = path.join(tempDir, "root");
    const validTarget = path.join(root, "file.txt");
    const outsideTarget = path.join(tempDir, "other", "file.txt");

    expect(checkPathBoundaryNative(validTarget, root)).toBe(true);
    expect(checkPathBoundaryNative(outsideTarget, root)).toBe(false);
  });
});
