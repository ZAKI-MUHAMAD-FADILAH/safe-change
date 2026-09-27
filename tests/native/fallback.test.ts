import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  assertWithinBoundary,
  assertSafeScopePath,
  PathSafetyError,
} from "../../src/installer/core/path-safety.js";
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

  it("delegates to native when native is active and respects negative verdict", () => {
    // Mock native that blocks everything
    _setNativeInstanceForTesting({
      version: () => "0.1.0-mock",
      checkPathBoundary: () => false,
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
    // Mock native that allows valid target
    _setNativeInstanceForTesting({
      version: () => "0.1.0-mock",
      checkPathBoundary: () => true,
    });

    const target = path.join(workspaceRoot, "file.txt");
    const result = assertWithinBoundary(workspaceRoot, target);
    expect(result.resolvedTarget).toBe(path.resolve(target));
  });
});
