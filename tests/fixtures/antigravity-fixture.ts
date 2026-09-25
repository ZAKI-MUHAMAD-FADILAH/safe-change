import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export type FixtureScope = "project" | "global";

export interface FixtureFileSystem {
  existsSync(p: string): boolean;
  lstatSync(p: string): {
    isSymbolicLink(): boolean;
    isDirectory(): boolean;
    isFile(): boolean;
  };
  readFileSync(p: string, encoding?: any): any;
  writeFileSync(p: string, data: any): void;
  mkdirSync(p: string, options?: any): any;
  rmSync(p: string, options?: any): void;
  realpathSync?(p: string): string;
}

export interface FixtureInstallOptions {
  scope: FixtureScope;
  targetRoot: string;
  sourceSkillFile?: string;
  overwrite?: boolean;
  cancel?: boolean;
  fsImpl?: FixtureFileSystem;
}

export interface FixtureInstallResult {
  status: "installed" | "updated" | "collision_detected" | "cancelled";
  installedPath: string;
  bytesWritten: number;
  message: string;
  classification: string;
}

export interface FixtureUninstallOptions {
  scope: FixtureScope;
  targetRoot: string;
  fsImpl?: FixtureFileSystem;
}

export interface FixtureUninstallResult {
  status: "uninstalled" | "not_found";
  removedPath: string;
  message: string;
}

export interface CleanupOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  fsImpl?: Pick<FixtureFileSystem, "existsSync" | "rmSync">;
}

export const CLASSIFICATION_LABEL =
  "Filesystem fixture validated; runtime discovery not independently verified.";

/**
 * Creates an isolated temporary directory for test fixtures.
 */
export function createFixtureWorkspace(prefix = "safe-change-fixture-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Safely removes a fixture directory and verifies its complete removal.
 * Surfaces explicit errors if cleanup fails after configured retries.
 */
export function cleanupFixtureWorkspace(
  dirPath: string,
  options: CleanupOptions = {}
): void {
  const fsImpl = options.fsImpl ?? fs;
  if (!dirPath || !fsImpl.existsSync(dirPath)) {
    return;
  }

  const maxRetries = options.maxRetries ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 50;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      fsImpl.rmSync(dirPath, { recursive: true, force: true });
      if (!fsImpl.existsSync(dirPath)) {
        return;
      }
    } catch (err) {
      lastError = err;
    }

    if (attempt < maxRetries && retryDelayMs > 0) {
      const start = Date.now();
      while (Date.now() - start < retryDelayMs) {
        // spin wait for file locks to release
      }
    }
  }

  const errMsg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `Cleanup failure: Failed to remove temporary directory at '${dirPath}' after ${maxRetries + 1} attempts. Root cause: ${errMsg}`
  );
}

/**
 * Returns the expected target directory path for the given scope inside targetRoot.
 */
export function resolveTargetDir(scope: FixtureScope, targetRoot: string): string {
  if (scope === "project") {
    return path.join(targetRoot, ".agents", "skills", "safe-change");
  }
  return path.join(targetRoot, ".gemini", "config", "skills", "safe-change");
}

/**
 * Validates that targetRoot is not the user's real home directory or located
 * anywhere inside the home directory, unless it is strictly within the operating
 * system's designated temporary directory (as is standard on Windows platforms
 * where os.tmpdir() is placed under %USERPROFILE%\AppData\Local\Temp).
 *
 * Rejects:
 * - targetRoot equal to os.homedir()
 * - targetRoot equal to os.tmpdir() itself
 * - direct children of os.homedir()
 * - nested descendants of os.homedir() outside os.tmpdir()
 * - path traversals resolving into os.homedir()
 * - case-variant paths on case-insensitive platforms
 */
export function assertSafeTargetRoot(
  targetRoot: string,
  fsImpl?: Pick<FixtureFileSystem, "existsSync" | "realpathSync">
): void {
  const fileSystem = fsImpl ?? fs;

  let resolvedTarget = path.resolve(targetRoot);
  let resolvedHome = path.resolve(os.homedir());
  let resolvedTmp = path.resolve(os.tmpdir());

  // Use realpath if paths exist on filesystem
  if (fileSystem.realpathSync) {
    if (fileSystem.existsSync(resolvedTarget)) {
      try {
        resolvedTarget = fileSystem.realpathSync(resolvedTarget);
      } catch {
        // preserve resolvedTarget
      }
    }
    if (fileSystem.existsSync(resolvedHome)) {
      try {
        resolvedHome = fileSystem.realpathSync(resolvedHome);
      } catch {
        // preserve resolvedHome
      }
    }
    if (fileSystem.existsSync(resolvedTmp)) {
      try {
        resolvedTmp = fileSystem.realpathSync(resolvedTmp);
      } catch {
        // preserve resolvedTmp
      }
    }
  }

  // Case normalization for case-insensitive platforms (Windows)
  const isWindows = process.platform === "win32";
  const normTarget = isWindows ? resolvedTarget.toLowerCase() : resolvedTarget;
  const normHome = isWindows ? resolvedHome.toLowerCase() : resolvedHome;
  const normTmp = isWindows ? resolvedTmp.toLowerCase() : resolvedTmp;

  // Condition 1: Target equals home directory itself
  if (normTarget === normHome) {
    throw new Error(
      "Safety violation: Target root must not be the real user home directory."
    );
  }

  // Condition 2: Target equals temporary directory root itself
  if (normTarget === normTmp) {
    throw new Error(
      "Safety violation: Target root must not be the system temporary directory root itself."
    );
  }

  // Relative path comparisons (boundary-safe, no raw string prefixes)
  const relTmp = path.relative(normTmp, normTarget);
  const isInsideTmp =
    relTmp !== "" && !relTmp.startsWith("..") && !path.isAbsolute(relTmp);

  const relHome = path.relative(normHome, normTarget);
  const isInsideHome =
    relHome !== "" && !relHome.startsWith("..") && !path.isAbsolute(relHome);

  // Condition 3: Target is inside home directory, but not within the OS temp dir
  if (isInsideHome && !isInsideTmp) {
    throw new Error(
      "Safety violation: Target root must not be located inside the user home directory."
    );
  }
}

/**
 * Simulates installing the safe-change skill into a project or global root.
 * Enforces path safety, rejects symlinks and junctions, and handles collisions.
 */
export function installSkillFixture(
  options: FixtureInstallOptions
): FixtureInstallResult {
  const fsImpl = options.fsImpl ?? fs;
  assertSafeTargetRoot(options.targetRoot, fsImpl);

  const targetDir = resolveTargetDir(options.scope, options.targetRoot);
  const targetSkillFile = path.join(targetDir, "SKILL.md");

  // Check for cancellation before any mutation
  if (options.cancel) {
    return {
      status: "cancelled",
      installedPath: targetSkillFile,
      bytesWritten: 0,
      message: "Installation cancelled by user; target unchanged.",
      classification: CLASSIFICATION_LABEL,
    };
  }

  // Inspect existing target directory with lstat
  let targetExists = false;
  try {
    const lstat = fsImpl.lstatSync(targetDir);
    targetExists = true;

    // Reject symbolic links and junctions immediately
    if (lstat.isSymbolicLink()) {
      throw new Error(
        `Safety violation: Target directory '${targetDir}' is a symbolic link. Symlinks and junctions are strictly prohibited.`
      );
    }

    // Detect regular-file collision where a directory was expected
    if (!lstat.isDirectory()) {
      return {
        status: "collision_detected",
        installedPath: targetSkillFile,
        bytesWritten: 0,
        message: `Collision detected: Target path '${targetDir}' is a regular file, but a directory was expected.`,
        classification: CLASSIFICATION_LABEL,
      };
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      // Re-throw safety violations or unexpected I/O errors
      throw err;
    }
  }

  // Collision handling for existing directories
  if (targetExists && !options.overwrite) {
    return {
      status: "collision_detected",
      installedPath: targetSkillFile,
      bytesWritten: 0,
      message:
        "Existing safe-change skill directory detected. Overwrite must be explicitly approved.",
      classification: CLASSIFICATION_LABEL,
    };
  }

  // If overwriting, verify that the target skill file itself is not a symlink
  if (targetExists && options.overwrite && fsImpl.existsSync(targetSkillFile)) {
    const fileLstat = fsImpl.lstatSync(targetSkillFile);
    if (fileLstat.isSymbolicLink()) {
      throw new Error(
        `Safety violation: Target file '${targetSkillFile}' is a symbolic link. Following symlinks during write is strictly prohibited.`
      );
    }
  }

  // Determine source file
  const sourceFile =
    options.sourceSkillFile ??
    path.resolve(__dirname, "..", "..", "skills", "safe-change", "SKILL.md");

  if (!fsImpl.existsSync(sourceFile)) {
    throw new Error(`Canonical skill source not found at: ${sourceFile}`);
  }

  const sourceBytes = fsImpl.readFileSync(sourceFile);

  // Ensure target directory exists
  fsImpl.mkdirSync(targetDir, { recursive: true });

  // Pre-write TOCTOU verification
  const postDirLstat = fsImpl.lstatSync(targetDir);
  if (postDirLstat.isSymbolicLink()) {
    throw new Error(
      `Safety violation: Target directory '${targetDir}' was replaced with a symbolic link prior to write.`
    );
  }
  if (fsImpl.existsSync(targetSkillFile)) {
    const postFileLstat = fsImpl.lstatSync(targetSkillFile);
    if (postFileLstat.isSymbolicLink()) {
      throw new Error(
        `Safety violation: Target file '${targetSkillFile}' was replaced with a symbolic link prior to write.`
      );
    }
  }

  // Copy file directly (regular file copy, no symlinks, no junctions)
  fsImpl.writeFileSync(targetSkillFile, sourceBytes);

  return {
    status: targetExists ? "updated" : "installed",
    installedPath: targetSkillFile,
    bytesWritten: sourceBytes.length,
    message: targetExists
      ? "Existing skill explicitly updated."
      : "Skill cleanly installed.",
    classification: CLASSIFICATION_LABEL,
  };
}

/**
 * Simulates uninstalling the safe-change skill from a project or global root.
 */
export function uninstallSkillFixture(
  options: FixtureUninstallOptions
): FixtureUninstallResult {
  const fsImpl = options.fsImpl ?? fs;
  assertSafeTargetRoot(options.targetRoot, fsImpl);

  const targetDir = resolveTargetDir(options.scope, options.targetRoot);

  try {
    const lstat = fsImpl.lstatSync(targetDir);
    if (lstat.isSymbolicLink()) {
      throw new Error(
        `Safety violation: Cannot uninstall because target directory '${targetDir}' is a symbolic link.`
      );
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        status: "not_found",
        removedPath: targetDir,
        message: "Target skill directory does not exist.",
      };
    }
    throw err;
  }

  // Remove the safe-change directory
  fsImpl.rmSync(targetDir, { recursive: true, force: true });

  if (fsImpl.existsSync(targetDir)) {
    throw new Error(
      `Uninstall failure: Failed to remove directory '${targetDir}'.`
    );
  }

  return {
    status: "uninstalled",
    removedPath: targetDir,
    message: "Skill directory cleanly removed.",
  };
}

/**
 * Checks byte-for-byte identity between two files.
 */
export function verifyByteForByteIdentity(
  fileA: string,
  fileB: string
): boolean {
  if (!fs.existsSync(fileA) || !fs.existsSync(fileB)) {
    return false;
  }
  const bufA = fs.readFileSync(fileA);
  const bufB = fs.readFileSync(fileB);
  return bufA.equals(bufB);
}

/**
 * Validates that YAML frontmatter is intact and matches expectations.
 * Handles both LF and CRLF line endings.
 */
export function verifyFrontmatterIntact(
  filePath: string
): { intact: boolean; name?: string; description?: string } {
  if (!fs.existsSync(filePath)) {
    return { intact: false };
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  const content = raw.replace(/\r\n/g, "\n");
  if (!content.startsWith("---\n")) {
    return { intact: false };
  }

  const endIndex = content.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    return { intact: false };
  }

  const frontmatter = content.slice(4, endIndex);
  const nameMatch = /^name:\s*(.+)$/m.exec(frontmatter);
  const descMatch = /^description:\s*(.+)$/m.exec(frontmatter);

  if (!nameMatch || !descMatch) {
    return { intact: false };
  }

  return {
    intact: true,
    name: nameMatch[1]?.trim(),
    description: descMatch[1]?.trim(),
  };
}
