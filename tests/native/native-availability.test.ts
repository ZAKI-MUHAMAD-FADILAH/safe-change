import { describe, it, expect } from "vitest";
import {
  isNativeAvailable,
  getNativeVersion,
  checkPathBoundaryNative,
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

  it("should return null for checkPathBoundaryNative when native is unavailable", () => {
    if (!isNativeAvailable()) {
      const result = checkPathBoundaryNative("/some/path", "/some");
      expect(result).toBeNull();
    }
  });
});
