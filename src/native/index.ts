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

function loadNative(): NativeModule | null {
  if (process.env["SAFE_CHANGE_NATIVE_DISABLED"] === "1") {
    return null;
  }
  try {
    const require = createRequire(import.meta.url);
    return require("./safe-change-native.node") as NativeModule;
  } catch {
    return null;
  }
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
