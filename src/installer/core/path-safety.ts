import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  checkPathBoundaryNative,
  resolveAndCheckBoundaryNative,
  isSymlinkOrJunctionNative,
} from "../../native/index.js";

export type InstallerScope = "project" | "global";

export class PathSafetyError extends Error {
  public readonly code: string;
  public readonly targetPath: string;

  constructor(message: string, code: string, targetPath: string) {
    super(message);
    this.name = "PathSafetyError";
    this.code = code;
    this.targetPath = targetPath;
  }
}

let cachedCaseInsensitive: boolean | undefined;

/**
 * Dynamically detects whether the filesystem hosting probeDir is case-insensitive.
 * Uses temporary probe file with fallback based on operating system.
 */
export function isFileSystemCaseInsensitive(probeDir = os.tmpdir()): boolean {
  if (cachedCaseInsensitive !== undefined) {
    return cachedCaseInsensitive;
  }

  try {
    const probePath = path.join(probeDir, `.safe-change-case-probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    fs.writeFileSync(probePath, "probe");
    try {
      const upper = probePath.toUpperCase();
      const lower = probePath.toLowerCase();
      const alt = upper !== probePath ? upper : lower;
      cachedCaseInsensitive = fs.existsSync(alt);
    } finally {
      try {
        fs.rmSync(probePath, { force: true });
      } catch {
        // ignore probe deletion error
      }
    }
  } catch {
    cachedCaseInsensitive = process.platform === "win32" || process.platform === "darwin";
  }

  return cachedCaseInsensitive;
}

/**
 * Normalizes path case if the underlying filesystem is case-insensitive.
 */
export function normalizePathCase(inputPath: string, caseInsensitive?: boolean): string {
  const isCi = caseInsensitive ?? isFileSystemCaseInsensitive();
  return isCi ? inputPath.toLowerCase() : inputPath;
}

/**
 * TypeScript fallback implementation for boundary checking.
 */
export function assertWithinBoundaryTypeScript(
  boundaryRoot: string,
  targetPath: string,
  caseInsensitive?: boolean
): { resolvedTarget: string; resolvedBoundary: string; relativePath: string } {
  const resolvedBoundary = path.resolve(boundaryRoot);
  const resolvedTarget = path.resolve(targetPath);

  const isCi = caseInsensitive ?? isFileSystemCaseInsensitive();
  const normBoundary = normalizePathCase(resolvedBoundary, isCi);
  const normTarget = normalizePathCase(resolvedTarget, isCi);

  const relative = path.relative(normBoundary, normTarget);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new PathSafetyError(
      `Path traversal rejected: '${targetPath}' escapes root boundary '${boundaryRoot}'.`,
      "PATH_TRAVERSAL",
      resolvedTarget
    );
  }

  return {
    resolvedTarget,
    resolvedBoundary,
    relativePath: path.relative(resolvedBoundary, resolvedTarget),
  };
}

/**
 * Asserts that targetPath is safely within boundaryRoot without escaping via traversal.
 * Attempts native Rust check first via napi-rs; falls back gracefully to TypeScript.
 */
export function assertWithinBoundary(
  boundaryRoot: string,
  targetPath: string,
  caseInsensitive?: boolean
): { resolvedTarget: string; resolvedBoundary: string; relativePath: string } {
  const resolvedBoundary = path.resolve(boundaryRoot);
  const resolvedTarget = path.resolve(targetPath);

  // If target exists on disk, attempt canonical boundary resolution first
  if (fs.existsSync(resolvedTarget) && fs.existsSync(resolvedBoundary)) {
    const canonicalResult = resolveAndCheckBoundaryNative(resolvedTarget, resolvedBoundary);
    if (canonicalResult !== null) {
      if (process.argv.includes("--verbose")) {
        console.error("[native] path boundary check");
      }
      if (!canonicalResult) {
        throw new PathSafetyError(
          `Path traversal rejected: '${targetPath}' escapes root boundary '${boundaryRoot}'.`,
          "PATH_TRAVERSAL",
          resolvedTarget
        );
      }
      return {
        resolvedTarget,
        resolvedBoundary,
        relativePath: path.relative(resolvedBoundary, resolvedTarget),
      };
    }
  }

  // Attempt standard native boundary check
  const nativeResult = checkPathBoundaryNative(resolvedTarget, resolvedBoundary);
  if (nativeResult !== null) {
    if (process.argv.includes("--verbose")) {
      console.error("[native] path boundary check");
    }
    if (!nativeResult) {
      throw new PathSafetyError(
        `Path traversal rejected: '${targetPath}' escapes root boundary '${boundaryRoot}'.`,
        "PATH_TRAVERSAL",
        resolvedTarget
      );
    }
    return {
      resolvedTarget,
      resolvedBoundary,
      relativePath: path.relative(resolvedBoundary, resolvedTarget),
    };
  }

  if (process.argv.includes("--verbose")) {
    console.error("[typescript] path boundary check");
  }

  // Graceful fallback to pure TypeScript implementation
  return assertWithinBoundaryTypeScript(boundaryRoot, targetPath, caseInsensitive);
}

/**
 * Checks existing targetPath and optionally its ancestors for symbolic links or junctions.
 * Rejects with PathSafetyError if any symbolic link or junction is detected.
 */
export function assertNoSymlinkOrJunction(
  targetPath: string,
  options: { checkAncestorsUpTo?: string } = {}
): void {
  const resolvedTarget = path.resolve(targetPath);

  // Check target path via native if available
  const nativeSymlink = isSymlinkOrJunctionNative(resolvedTarget);
  if (nativeSymlink !== null) {
    if (nativeSymlink) {
      throw new PathSafetyError(
        `Safety violation: Path '${targetPath}' is a symbolic link or junction point.`,
        "SYMLINK_REJECTED",
        resolvedTarget
      );
    }
  } else {
    // Pure TypeScript fallback via fs.lstatSync
    if (fs.existsSync(resolvedTarget)) {
      const stat = fs.lstatSync(resolvedTarget);
      if (stat.isSymbolicLink()) {
        throw new PathSafetyError(
          `Safety violation: Path '${targetPath}' is a symbolic link or junction point.`,
          "SYMLINK_REJECTED",
          resolvedTarget
        );
      }
    }
  }

  if (options.checkAncestorsUpTo) {
    const resolvedBoundary = path.resolve(options.checkAncestorsUpTo);
    let current = path.dirname(resolvedTarget);

    while (current.length >= resolvedBoundary.length) {
      const nativeAncestorSymlink = isSymlinkOrJunctionNative(current);
      if (nativeAncestorSymlink !== null) {
        if (nativeAncestorSymlink) {
          throw new PathSafetyError(
            `Safety violation: Ancestor directory '${current}' is a symbolic link or junction point.`,
            "SYMLINK_REJECTED",
            current
          );
        }
      } else {
        if (fs.existsSync(current)) {
          const stat = fs.lstatSync(current);
          if (stat.isSymbolicLink()) {
            throw new PathSafetyError(
              `Safety violation: Ancestor directory '${current}' is a symbolic link or junction point.`,
              "SYMLINK_REJECTED",
              current
            );
          }
        }
      }

      if (current === resolvedBoundary) {
        break;
      }

      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }
}

/**
 * Default global allowlist for Antigravity skill directory.
 */
export function getDefaultGlobalAllowlist(homeDir = os.homedir()): string[] {
  const resolvedHome = path.resolve(homeDir);
  return [
    path.join(resolvedHome, ".gemini", "config", "skills", "safe-change"),
  ];
}

export interface ScopeValidationOptions {
  scope: InstallerScope;
  targetPath: string;
  workspaceRoot?: string;
  homeDir?: string;
  allowedGlobalSubpaths?: string[];
  caseInsensitive?: boolean;
}

/**
 * Validates path safety according to installation scope:
 * - Prohibits home directory root as target or workspace root.
 * - Project scope: ensures target is within workspaceRoot.
 * - Global scope: ensures target is strictly within the allowed global subpaths allowlist.
 * - Prohibits symbolic links or directory junctions.
 */
export function assertSafeScopePath(
  options: ScopeValidationOptions
): { resolvedTarget: string; resolvedBoundary: string } {
  const {
    scope,
    targetPath,
    workspaceRoot,
    homeDir = os.homedir(),
    caseInsensitive,
  } = options;

  const resolvedTarget = path.resolve(targetPath);
  const resolvedHome = path.resolve(homeDir);
  const isCi = caseInsensitive ?? isFileSystemCaseInsensitive();

  const normTarget = normalizePathCase(resolvedTarget, isCi);
  const normHome = normalizePathCase(resolvedHome, isCi);

  // 1. Never target home directory root itself
  if (normTarget === normHome) {
    throw new PathSafetyError(
      "Safety violation: Target path cannot be the user home directory root.",
      "HOME_ROOT_REJECTED",
      resolvedTarget
    );
  }

  if (scope === "project") {
    if (!workspaceRoot) {
      throw new PathSafetyError(
        "Project scope requires a valid workspaceRoot directory.",
        "MISSING_WORKSPACE_ROOT",
        resolvedTarget
      );
    }

    const resolvedWorkspace = path.resolve(workspaceRoot);
    const normWorkspace = normalizePathCase(resolvedWorkspace, isCi);

    // Workspace root itself cannot be home root
    if (normWorkspace === normHome) {
      throw new PathSafetyError(
        "Safety violation: Workspace root cannot be the user home directory root.",
        "HOME_ROOT_REJECTED",
        resolvedWorkspace
      );
    }

    // Boundary check within workspaceRoot
    assertWithinBoundary(resolvedWorkspace, resolvedTarget, isCi);

    // Check for symlinks in target and ancestors up to workspace root
    assertNoSymlinkOrJunction(resolvedTarget, { checkAncestorsUpTo: resolvedWorkspace });

    return {
      resolvedTarget,
      resolvedBoundary: resolvedWorkspace,
    };
  }

  if (scope === "global") {
    const allowlist = options.allowedGlobalSubpaths ?? getDefaultGlobalAllowlist(resolvedHome);
    const resolvedAllowlist = allowlist.map((p) => path.resolve(p));

    let matchedBoundary: string | null = null;
    for (const allowedRoot of resolvedAllowlist) {
      const normAllowed = normalizePathCase(allowedRoot, isCi);
      const rel = path.relative(normAllowed, normTarget);

      // Matches if target is inside allowedRoot or is allowedRoot itself
      if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
        matchedBoundary = allowedRoot;
        break;
      }
    }

    if (!matchedBoundary) {
      throw new PathSafetyError(
        `Safety violation: Global target path '${targetPath}' is outside the authorized global allowlist.`,
        "GLOBAL_ALLOWLIST_VIOLATION",
        resolvedTarget
      );
    }

    // Check for symlinks in target and ancestors up to home
    assertNoSymlinkOrJunction(resolvedTarget, { checkAncestorsUpTo: resolvedHome });

    return {
      resolvedTarget,
      resolvedBoundary: matchedBoundary,
    };
  }

  throw new PathSafetyError(`Unknown installer scope: '${scope}'.`, "INVALID_SCOPE", resolvedTarget);
}
