import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { assertNoSymlinkOrJunction } from "./path-safety.js";

export const DEFAULT_MANIFEST_FILENAME = ".safe-change-manifest.json";

export class OwnershipError extends Error {
  public readonly code: string;
  public readonly targetDir: string;

  constructor(message: string, code: string, targetDir: string) {
    super(message);
    this.name = "OwnershipError";
    this.code = code;
    this.targetDir = targetDir;
  }
}

export interface OwnershipManifest {
  owner: "safe-change";
  version: string;
  agent: string;
  scope: "project" | "global";
  installedAt: string;
  files: Record<string, string>; // relativePath -> SHA-256
  metadata?: Record<string, unknown>;
}

export interface CreateManifestOptions {
  version: string;
  agent: string;
  scope: "project" | "global";
  targetDir: string;
  installedFiles: string[]; // Absolute or relative paths of installed files
  installedAt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Computes SHA-256 hash of a file safely without following symlinks.
 */
function computeFileSha256(filePath: string): string {
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new OwnershipError(
      `Cannot hash file: '${filePath}' is not a regular file.`,
      "INVALID_FILE_TYPE",
      filePath
    );
  }
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Creates an in-memory OwnershipManifest object.
 */
export function createOwnershipManifest(options: CreateManifestOptions): OwnershipManifest {
  const {
    version,
    agent,
    scope,
    targetDir,
    installedFiles,
    installedAt = new Date().toISOString(),
    metadata,
  } = options;

  const resolvedTargetDir = path.resolve(targetDir);
  const filesRecord: Record<string, string> = {};

  for (const file of installedFiles) {
    const resolvedFile = path.resolve(resolvedTargetDir, file);
    if (!fs.existsSync(resolvedFile)) {
      throw new OwnershipError(
        `Installed file not found for manifest recording: '${resolvedFile}'.`,
        "FILE_NOT_FOUND",
        resolvedTargetDir
      );
    }
    const rel = path.relative(resolvedTargetDir, resolvedFile).replace(/\\/g, "/");
    filesRecord[rel] = computeFileSha256(resolvedFile);
  }

  return {
    owner: "safe-change",
    version,
    agent,
    scope,
    installedAt,
    files: filesRecord,
    ...(metadata ? { metadata } : {}),
  };
}

/**
 * Writes the ownership manifest to the target directory.
 */
export function writeOwnershipManifest(
  targetDir: string,
  manifest: OwnershipManifest,
  manifestName = DEFAULT_MANIFEST_FILENAME
): string {
  const resolvedTargetDir = path.resolve(targetDir);
  if (!fs.existsSync(resolvedTargetDir)) {
    fs.mkdirSync(resolvedTargetDir, { recursive: true });
  }

  const manifestPath = path.join(resolvedTargetDir, manifestName);
  assertNoSymlinkOrJunction(manifestPath);

  const jsonContent = JSON.stringify(manifest, null, 2) + "\n";
  fs.writeFileSync(manifestPath, jsonContent, "utf8");
  return manifestPath;
}

/**
 * Reads and parses an ownership manifest from target directory.
 * Returns null if the file does not exist.
 * Throws OwnershipError if the file is a symlink or contains corrupt JSON.
 */
export function readOwnershipManifest(
  targetDir: string,
  manifestName = DEFAULT_MANIFEST_FILENAME
): OwnershipManifest | null {
  const resolvedTargetDir = path.resolve(targetDir);
  const manifestPath = path.join(resolvedTargetDir, manifestName);

  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  assertNoSymlinkOrJunction(manifestPath);

  try {
    const raw = fs.readFileSync(manifestPath, "utf8");
    const parsed = JSON.parse(raw);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.owner !== "string" ||
      typeof parsed.version !== "string" ||
      typeof parsed.agent !== "string"
    ) {
      throw new OwnershipError(
        `Corrupt ownership manifest schema at '${manifestPath}'.`,
        "CORRUPT_MANIFEST",
        resolvedTargetDir
      );
    }

    return parsed as OwnershipManifest;
  } catch (err: any) {
    if (err instanceof OwnershipError) {
      throw err;
    }
    throw new OwnershipError(
      `Failed to parse ownership manifest at '${manifestPath}': ${err?.message}`,
      "CORRUPT_MANIFEST",
      resolvedTargetDir
    );
  }
}

/**
 * Validates ownership of target directory for a safe-change update or uninstall operation.
 */
export function validateOwnership(
  targetDir: string,
  options: {
    expectedAgent?: string;
    expectedScope?: "project" | "global";
    manifestName?: string;
  } = {}
): {
  isValid: boolean;
  manifest: OwnershipManifest | null;
  errorReason?: string;
} {
  const manifestName = options.manifestName ?? DEFAULT_MANIFEST_FILENAME;
  let manifest: OwnershipManifest | null = null;

  try {
    manifest = readOwnershipManifest(targetDir, manifestName);
  } catch (err: any) {
    return {
      isValid: false,
      manifest: null,
      errorReason: err?.message ?? "Corrupted manifest.",
    };
  }

  if (!manifest) {
    return {
      isValid: false,
      manifest: null,
      errorReason: `Missing ownership manifest (${manifestName}) in '${targetDir}'. Directory is not owned by safe-change.`,
    };
  }

  if (manifest.owner !== "safe-change") {
    return {
      isValid: false,
      manifest,
      errorReason: `Foreign ownership manifest found. Expected owner 'safe-change', got '${manifest.owner}'.`,
    };
  }

  if (options.expectedAgent && manifest.agent !== options.expectedAgent) {
    return {
      isValid: false,
      manifest,
      errorReason: `Agent mismatch in ownership manifest: Expected '${options.expectedAgent}', got '${manifest.agent}'.`,
    };
  }

  if (options.expectedScope && manifest.scope !== options.expectedScope) {
    return {
      isValid: false,
      manifest,
      errorReason: `Scope mismatch in ownership manifest: Expected '${options.expectedScope}', got '${manifest.scope}'.`,
    };
  }

  return {
    isValid: true,
    manifest,
  };
}

/**
 * Verifies that the files currently on disk match the SHA-256 digests in the manifest.
 */
export function verifyManifestIntegrity(
  targetDir: string,
  manifest: OwnershipManifest
): {
  matches: boolean;
  modifiedFiles: string[];
  missingFiles: string[];
} {
  const resolvedTargetDir = path.resolve(targetDir);
  const modifiedFiles: string[] = [];
  const missingFiles: string[] = [];

  for (const [relPath, expectedHash] of Object.entries(manifest.files)) {
    const fullPath = path.join(resolvedTargetDir, relPath);
    if (!fs.existsSync(fullPath)) {
      missingFiles.push(relPath);
      continue;
    }

    try {
      const currentHash = computeFileSha256(fullPath);
      if (currentHash !== expectedHash) {
        modifiedFiles.push(relPath);
      }
    } catch {
      modifiedFiles.push(relPath);
    }
  }

  return {
    matches: modifiedFiles.length === 0 && missingFiles.length === 0,
    modifiedFiles,
    missingFiles,
  };
}
