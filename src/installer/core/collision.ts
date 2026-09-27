import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { assertNoSymlinkOrJunction } from "./path-safety.js";

export type CollisionState =
  | "not_found"
  | "symlink_or_junction"
  | "file_blocking_directory"
  | "directory_identical"
  | "directory_different"
  | "file_identical"
  | "file_different"
  | "ownership_conflict";

export interface OwnershipDetails {
  hasManifest: boolean;
  isSafeChangeOwned: boolean;
  owner?: string;
  version?: string;
  scope?: string;
  agent?: string;
  installedAt?: string;
  sha256?: string;
}

export interface CollisionInspection {
  targetPath: string;
  exists: boolean;
  state: CollisionState;
  isSymlink: boolean;
  isDirectory: boolean;
  isFile: boolean;
  isIdentical: boolean;
  ownership: OwnershipDetails;
  message: string;
}

export interface CollisionInspectOptions {
  targetPath: string;
  expectedType?: "directory" | "file";
  sourceSkillFile?: string;
  relativeSkillFileName?: string; // e.g. "SKILL.md"
  manifestFileName?: string;      // e.g. ".safe-change-manifest.json"
}

/**
 * Computes SHA-256 digest of a file safely without following symlinks.
 */
function computeFileSha256(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      return null;
    }
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(buffer).digest("hex");
  } catch {
    return null;
  }
}

/**
 * Inspects a target path for collisions, type conflicts, content identity, and ownership markers.
 */
export function inspectCollision(options: CollisionInspectOptions): CollisionInspection {
  const {
    targetPath,
    expectedType = "directory",
    sourceSkillFile,
    relativeSkillFileName = "SKILL.md",
    manifestFileName = ".safe-change-manifest.json",
  } = options;

  const resolvedTarget = path.resolve(targetPath);

  // Check existence via lstatSync to detect symlinks even if target broken
  let exists = false;
  let isSymlink = false;
  let isDirectory = false;
  let isFile = false;

  try {
    const stat = fs.lstatSync(resolvedTarget);
    exists = true;
    isSymlink = stat.isSymbolicLink();
    isDirectory = stat.isDirectory();
    isFile = stat.isFile();
  } catch (err: any) {
    if (err?.code !== "ENOENT") {
      throw err;
    }
    exists = false;
  }

  const defaultOwnership: OwnershipDetails = {
    hasManifest: false,
    isSafeChangeOwned: false,
  };

  if (!exists) {
    return {
      targetPath: resolvedTarget,
      exists: false,
      state: "not_found",
      isSymlink: false,
      isDirectory: false,
      isFile: false,
      isIdentical: false,
      ownership: defaultOwnership,
      message: `Target path does not exist: '${resolvedTarget}'.`,
    };
  }

  if (isSymlink) {
    return {
      targetPath: resolvedTarget,
      exists: true,
      state: "symlink_or_junction",
      isSymlink: true,
      isDirectory,
      isFile,
      isIdentical: false,
      ownership: defaultOwnership,
      message: `Safety violation: Target path is a symbolic link or junction point: '${resolvedTarget}'.`,
    };
  }

  // Type mismatch: expected directory, got regular file
  if (expectedType === "directory" && isFile) {
    return {
      targetPath: resolvedTarget,
      exists: true,
      state: "file_blocking_directory",
      isSymlink: false,
      isDirectory: false,
      isFile: true,
      isIdentical: false,
      ownership: defaultOwnership,
      message: `Collision: A regular file exists where a directory is required: '${resolvedTarget}'.`,
    };
  }

  // Inspect ownership manifest if directory exists
  const ownership: OwnershipDetails = { ...defaultOwnership };
  if (isDirectory) {
    const manifestPath = path.join(resolvedTarget, manifestFileName);
    if (fs.existsSync(manifestPath)) {
      try {
        const stat = fs.lstatSync(manifestPath);
        if (!stat.isSymbolicLink() && stat.isFile()) {
          const raw = fs.readFileSync(manifestPath, "utf8");
          const parsed = JSON.parse(raw);
          ownership.hasManifest = true;
          ownership.owner = parsed.owner ?? parsed.generator;
          ownership.version = parsed.version;
          ownership.scope = parsed.scope;
          ownership.agent = parsed.agent;
          ownership.installedAt = parsed.installedAt;
          ownership.sha256 = parsed.sha256;
          ownership.isSafeChangeOwned = ownership.owner === "safe-change";
        }
      } catch {
        ownership.hasManifest = true;
        ownership.isSafeChangeOwned = false;
      }
    }
  }

  // Check content identity
  let isIdentical = false;
  if (sourceSkillFile && fs.existsSync(sourceSkillFile)) {
    const sourceHash = computeFileSha256(sourceSkillFile);
    if (sourceHash) {
      const targetFilePath = isDirectory
        ? path.join(resolvedTarget, relativeSkillFileName)
        : resolvedTarget;

      const targetHash = computeFileSha256(targetFilePath);
      if (targetHash && sourceHash === targetHash) {
        isIdentical = true;
      }
    }
  }

  // Determine state
  let state: CollisionState;
  let message: string;

  if (ownership.hasManifest && !ownership.isSafeChangeOwned) {
    state = "ownership_conflict";
    message = `Ownership conflict: Target contains a foreign or invalid manifest not owned by safe-change.`;
  } else if (isDirectory) {
    if (isIdentical) {
      state = "directory_identical";
      message = `Target directory exists with identical content.`;
    } else {
      state = "directory_different";
      message = `Target directory exists with different content.`;
    }
  } else {
    if (isIdentical) {
      state = "file_identical";
      message = `Target file exists with identical content.`;
    } else {
      state = "file_different";
      message = `Target file exists with different content.`;
    }
  }

  return {
    targetPath: resolvedTarget,
    exists: true,
    state,
    isSymlink: false,
    isDirectory,
    isFile,
    isIdentical,
    ownership,
    message,
  };
}

/**
 * Determines if safe-change can proceed with writing to the target based on collision state.
 */
export function canSafelyWrite(
  inspection: CollisionInspection,
  options: { overwrite?: boolean } = {}
): { canWrite: boolean; reason?: string } {
  if (!inspection.exists || inspection.state === "not_found") {
    return { canWrite: true };
  }

  if (inspection.isSymlink || inspection.state === "symlink_or_junction") {
    return {
      canWrite: false,
      reason: "Target is a symbolic link or directory junction. Operation aborted for safety.",
    };
  }

  if (inspection.state === "file_blocking_directory") {
    return {
      canWrite: false,
      reason: "A regular file occupies the target directory path. Remove or rename it manually.",
    };
  }

  if (inspection.state === "ownership_conflict") {
    return {
      canWrite: false,
      reason: "Target directory contains an ownership manifest owned by another tool or invalid format.",
    };
  }

  if (inspection.isIdentical) {
    return { canWrite: true };
  }

  // Content is different: require explicit overwrite
  if (options.overwrite) {
    return { canWrite: true };
  }

  return {
    canWrite: false,
    reason: `Collision detected: Target exists with different content. Requires explicit --overwrite.`,
  };
}
