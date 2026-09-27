import { createRequire } from "node:module";

let native: NativeModule | null = null;

export interface NativeModule {
  version(): string;
  checkPathBoundary(path: string, root: string): boolean;
}

function loadNative(): NativeModule | null {
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

/**
 * Internal setter used for testing fallback behavior and mock native injection.
 */
export function _setNativeInstanceForTesting(mock: NativeModule | null): void {
  native = mock;
}
