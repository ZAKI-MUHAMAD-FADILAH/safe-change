import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export type FixtureScope = "project" | "global";

export interface FixtureInstallOptions {
  scope: FixtureScope;
  targetRoot: string;
  sourceSkillFile?: string;
  overwrite?: boolean;
  cancel?: boolean;
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
}

export interface FixtureUninstallResult {
  status: "uninstalled" | "not_found";
  removedPath: string;
  message: string;
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
 * Safely removes a fixture directory and all its contents.
 * Guaranteed not to throw if directory is already removed.
 */
export function cleanupFixtureWorkspace(dirPath: string): void {
  if (dirPath && fs.existsSync(dirPath)) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
    } catch {
      // In Windows environments, retry once after a short delay if locked
      try {
        fs.rmSync(dirPath, { recursive: true, force: true });
      } catch {
        // Suppress cleanup error to prevent masking primary test errors
      }
    }
  }
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
 * Validates that targetRoot is not the user's real home directory.
 * Prevents accidental mutation of real user environment.
 */
export function assertSafeTargetRoot(targetRoot: string): void {
  const resolved = path.resolve(targetRoot);
  const homeResolved = path.resolve(os.homedir());
  if (resolved === homeResolved) {
    throw new Error(
      "Safety violation: Target root must not be the real user home directory."
    );
  }
}

/**
 * Simulates installing the safe-change skill into a project or global root.
 * Uses regular file copies only. Does not use symlinks or junctions.
 */
export function installSkillFixture(
  options: FixtureInstallOptions
): FixtureInstallResult {
  assertSafeTargetRoot(options.targetRoot);

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

  // Detect existing collision
  const targetExists = fs.existsSync(targetDir);
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

  // Determine source file
  const sourceFile =
    options.sourceSkillFile ??
    path.resolve(__dirname, "..", "..", "skills", "safe-change", "SKILL.md");

  if (!fs.existsSync(sourceFile)) {
    throw new Error(`Canonical skill source not found at: ${sourceFile}`);
  }

  // Read source content for byte comparison
  const sourceBytes = fs.readFileSync(sourceFile);

  // Ensure target directory exists
  fs.mkdirSync(targetDir, { recursive: true });

  // Copy file directly (regular file copy, no symlinks, no junctions)
  fs.writeFileSync(targetSkillFile, sourceBytes);

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
  assertSafeTargetRoot(options.targetRoot);

  const targetDir = resolveTargetDir(options.scope, options.targetRoot);

  if (!fs.existsSync(targetDir)) {
    return {
      status: "not_found",
      removedPath: targetDir,
      message: "Target skill directory does not exist.",
    };
  }

  // Remove the safe-change directory
  fs.rmSync(targetDir, { recursive: true, force: true });

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
