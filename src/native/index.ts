import { createRequire } from "node:module";

let native: NativeModule | null = null;

export interface NativeModule {
  version(): string;
  checkPathBoundary(path: string, root: string): boolean;
  resolveAndCheckBoundary(path: string, root: string): boolean | null;
  isSymlinkOrJunction(path: string): boolean | null;
  atomicWriteFile(stagingPath: string, targetPath: string): boolean;
  lockFile(path: string): number | null;
  unlockFile(handle: number): boolean;
}

export type NativeLoadStatus =
  | "loaded"
  | "disabled"
  | "unsupported-platform"
  | "package-not-installed"
  | "binary-load-failed";

export interface NativeLoadResult {
  readonly module: NativeModule | null;
  readonly status: NativeLoadStatus;
  readonly packageName: string | null;
  readonly error?: string;
}

export function isMusl(): boolean {
  if (process.platform !== "linux") return false;
  try {
    const report = (process as unknown as { report?: { getReport?: () => { header?: { glibcVersionRuntime?: string } } } }).report?.getReport?.();
    if (report && typeof report === "object" && report.header?.glibcVersionRuntime) {
      return false;
    }
  } catch {
    // Ignore
  }
  const glibcVersion = (process as unknown as { config?: { variables?: { glibc_version?: string } } }).config?.variables?.glibc_version;
  if (glibcVersion) {
    return false;
  }
  return true;
}

export function getExpectedPlatformPackage(): string | null {
  const { platform, arch } = process;

  if (platform === "darwin") {
    if (arch === "arm64") return "@safe-change/darwin-arm64";
    if (arch === "x64") return "@safe-change/darwin-x64";
  } else if (platform === "linux") {
    if (arch === "x64") {
      return isMusl() ? "@safe-change/linux-x64-musl" : "@safe-change/linux-x64-gnu";
    }
    if (arch === "arm64") {
      return "@safe-change/linux-arm64-gnu";
    }
  } else if (platform === "win32") {
    if (arch === "x64") return "@safe-change/win32-x64-msvc";
    if (arch === "arm64") return "@safe-change/win32-arm64-msvc";
  }

  return null;
}

let lastLoadResult: NativeLoadResult | null = null;

export function loadNativeWithStatus(): NativeLoadResult {
  if (process.env["SAFE_CHANGE_NATIVE_DISABLED"] === "1") {
    return { module: null, status: "disabled", packageName: null };
  }

  const expectedPkg = getExpectedPlatformPackage();
  if (expectedPkg === null) {
    return {
      module: null,
      status: "unsupported-platform",
      packageName: null,
      error: `Unsupported platform/architecture: ${process.platform}-${process.arch}`,
    };
  }

  const require = createRequire(import.meta.url);

  // 1. Try targeted platform package
  try {
    const mod = require(expectedPkg) as NativeModule;
    return { module: mod, status: "loaded", packageName: expectedPkg };
  } catch (err: unknown) {
    const isNotFound =
      err && typeof err === "object" && (err as { code?: string }).code === "MODULE_NOT_FOUND";

    if (!isNotFound) {
      return {
        module: null,
        status: "binary-load-failed",
        packageName: expectedPkg,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // 2. Try local native binary fallback (dev or direct build)
  try {
    const local = require("./safe-change-native.node") as NativeModule;
    return { module: local, status: "loaded", packageName: expectedPkg };
  } catch {
    return {
      module: null,
      status: "package-not-installed",
      packageName: expectedPkg,
    };
  }
}

function loadNative(): NativeModule | null {
  lastLoadResult = loadNativeWithStatus();
  return lastLoadResult.module;
}

export function getNativeLoadStatus(): NativeLoadStatus {
  if (!native && !lastLoadResult) {
    native = loadNative();
  }
  return lastLoadResult ? lastLoadResult.status : (native ? "loaded" : "package-not-installed");
}

export function getNativeVersion(): string {
  if (!native) native = loadNative();
  if (!native) return "native-unavailable";
  return native.version();
}

export function isNativeAvailable(): boolean {
  if (!native) native = loadNative();
  return native !== null;
}

export function checkPathBoundaryNative(
  path: string,
  root: string
): boolean | null {
  if (!native) native = loadNative();
  if (!native) return null;
  return native.checkPathBoundary(path, root);
}

export function resolveAndCheckBoundaryNative(
  path: string,
  root: string
): boolean | null {
  if (!native) native = loadNative();
  if (!native) return null;
  return native.resolveAndCheckBoundary(path, root);
}

export function isSymlinkOrJunctionNative(
  path: string
): boolean | null {
  if (!native) native = loadNative();
  if (!native) return null;
  return native.isSymlinkOrJunction(path);
}

export function atomicWriteFileNative(
  stagingPath: string,
  targetPath: string
): boolean | null {
  if (!native) native = loadNative();
  if (!native) return null;
  return native.atomicWriteFile(stagingPath, targetPath);
}

export function lockFileNative(
  path: string
): number | null {
  if (!native) native = loadNative();
  if (!native) return null;
  return native.lockFile(path);
}

export function unlockFileNative(
  handle: number
): boolean | null {
  if (!native) native = loadNative();
  if (!native) return null;
  return native.unlockFile(handle);
}

/**
 * Internal setter used for testing fallback behavior and mock native injection.
 */
export function _setNativeInstanceForTesting(mock: NativeModule | null): void {
  native = mock;
}
