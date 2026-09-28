import { describe, it, expect } from "vitest";
import {
  getExpectedPlatformPackage,
  loadNativeWithStatus,
  getNativeLoadStatus,
  isNativeAvailable,
  getNativeVersion,
  checkPathBoundaryNative,
  resolveAndCheckBoundaryNative,
  isSymlinkOrJunctionNative,
  isMusl,
} from "../../src/native/index.js";

describe("Native Platform Loader & Architecture Matching", () => {
  it("determines the expected platform package based on platform and architecture", () => {
    const currentPkg = getExpectedPlatformPackage();
    const { platform, arch } = process;

    if (platform === "win32" && arch === "x64") {
      expect(currentPkg).toBe("@safe-change/win32-x64-msvc");
    } else if (platform === "win32" && arch === "arm64") {
      expect(currentPkg).toBe("@safe-change/win32-arm64-msvc");
    } else if (platform === "darwin" && arch === "arm64") {
      expect(currentPkg).toBe("@safe-change/darwin-arm64");
    } else if (platform === "darwin" && arch === "x64") {
      expect(currentPkg).toBe("@safe-change/darwin-x64");
    } else if (platform === "linux" && arch === "arm64") {
      expect(currentPkg).toBe("@safe-change/linux-arm64-gnu");
    }
  });

  it("returns disabled status when SAFE_CHANGE_NATIVE_DISABLED environment variable is set", () => {
    const oldEnv = process.env["SAFE_CHANGE_NATIVE_DISABLED"];
    try {
      process.env["SAFE_CHANGE_NATIVE_DISABLED"] = "1";
      const status = loadNativeWithStatus();
      expect(status.status).toBe("disabled");
      expect(status.module).toBeNull();
    } finally {
      if (oldEnv === undefined) {
        delete process.env["SAFE_CHANGE_NATIVE_DISABLED"];
      } else {
        process.env["SAFE_CHANGE_NATIVE_DISABLED"] = oldEnv;
      }
    }
  });

  it("reports package-not-installed cleanly without crashing when platform package is absent", () => {
    const oldEnv = process.env["SAFE_CHANGE_NATIVE_DISABLED"];
    try {
      delete process.env["SAFE_CHANGE_NATIVE_DISABLED"];
      const status = loadNativeWithStatus();
      expect(["loaded", "package-not-installed"]).toContain(status.status);
    } finally {
      if (oldEnv !== undefined) {
        process.env["SAFE_CHANGE_NATIVE_DISABLED"] = oldEnv;
      }
    }
  });

  it("provides graceful fallback when unavailable", () => {
    const oldEnv = process.env["SAFE_CHANGE_NATIVE_DISABLED"];
    try {
      process.env["SAFE_CHANGE_NATIVE_DISABLED"] = "1";
      expect(isNativeAvailable()).toBe(false);
      expect(getNativeLoadStatus()).toBe("disabled");
      expect(getNativeVersion()).toBe("native-unavailable");
      expect(checkPathBoundaryNative("/a", "/b")).toBeNull();
      expect(resolveAndCheckBoundaryNative("/a", "/b")).toBeNull();
      expect(isSymlinkOrJunctionNative("/a")).toBeNull();
    } finally {
      if (oldEnv === undefined) {
        delete process.env["SAFE_CHANGE_NATIVE_DISABLED"];
      } else {
        process.env["SAFE_CHANGE_NATIVE_DISABLED"] = oldEnv;
      }
    }
  });

  it("handles isMusl cleanly on current platform", () => {
    const result = isMusl();
    expect(typeof result).toBe("boolean");
    if (process.platform !== "linux") {
      expect(result).toBe(false);
    }
  });
});
