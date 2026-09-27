import { describe, it, expect } from "vitest";
import {
  isNativeAvailable,
  getNativeVersion,
  checkPathBoundaryNative,
  resolveAndCheckBoundaryNative,
  isSymlinkOrJunctionNative,
  atomicWriteFileNative,
  lockFileNative,
  unlockFileNative,
} from "../../src/native/index.js";

describe("native module availability", () => {
  it("should return a boolean for isNativeAvailable()", () => {
    const available = isNativeAvailable();
    expect(typeof available).toBe("boolean");
  });

  it("should return version string or 'native-unavailable'", () => {
    const version = getNativeVersion();
    expect(typeof version).toBe("string");
    expect(version.length).toBeGreaterThan(0);

    if (isNativeAvailable()) {
      expect(version).not.toBe("native-unavailable");
    } else {
      expect(version).toBe("native-unavailable");
    }
  });

  it("should return null for native operations when native is unavailable", () => {
    if (!isNativeAvailable()) {
      expect(checkPathBoundaryNative("/some/path", "/some")).toBeNull();
      expect(resolveAndCheckBoundaryNative("/some/path", "/some")).toBeNull();
      expect(isSymlinkOrJunctionNative("/some/path")).toBeNull();
      expect(atomicWriteFileNative("/some/staging", "/some/target")).toBeNull();
      expect(lockFileNative("/some/path")).toBeNull();
      expect(unlockFileNative(1234)).toBeNull();
    }
  });
});
