// ---------------------------------------------------------------------------
// safe-change -- Baseline manager (atomic read/write, schema versioning)
// ---------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile, access, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import type {
  Baseline,
  CheckResult,
  FileEntry,
  GitState,
  SafeChangeConfig,
} from "../types/index.js";

const STATE_DIR = ".safe-change";
const BASELINE_FILE = "baseline.json";
const CURRENT_SCHEMA_VERSION = 2;

export class BaselineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BaselineError";
  }
}

/**
 * Compute a stable hash of the check configuration for drift detection.
 */
export function computeConfigHash(config: SafeChangeConfig): string {
  const normalized = config.checks.map((c) => ({
    name: c.name,
    executable: c.executable,
    args: [...c.args],
    timeout: c.timeout,
  }));
  const serialized = JSON.stringify(normalized);
  return "sha256:" + createHash("sha256").update(serialized).digest("hex");
}

/**
 * Save a baseline atomically. Writes to a temp file then renames.
 */
export async function saveBaseline(
  repoRoot: string,
  description: string,
  git: GitState,
  files: Record<string, FileEntry>,
  checks: readonly CheckResult[],
  config: SafeChangeConfig
): Promise<string> {
  const stateDir = join(repoRoot, STATE_DIR);
  await mkdir(stateDir, { recursive: true });

  const baseline: Baseline = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    description,
    git,
    files,
    excludedPaths: [".safe-change/"],
    checks: [...checks],
    checksConfigHash: computeConfigHash(config),
  };

  const content = JSON.stringify(baseline, null, 2) + "\n";
  const baselinePath = join(stateDir, BASELINE_FILE);
  const tempPath = baselinePath + ".tmp." + process.pid;

  try {
    await writeFile(tempPath, content, "utf-8");
    await rename(tempPath, baselinePath);
  } catch (err: unknown) {
    // Attempt cleanup of temp file on failure
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(tempPath);
    } catch {
      // Ignore cleanup failure
    }
    throw new BaselineError(
      `Failed to write baseline: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return baselinePath;
}

/**
 * Load the baseline from the state directory. Returns null if no baseline
 * exists. Throws BaselineError if the file exists but is corrupt or
 * uses an unsupported schema version.
 */
export async function loadBaseline(
  repoRoot: string
): Promise<Baseline | null> {
  const baselinePath = join(repoRoot, STATE_DIR, BASELINE_FILE);

  let raw: string;
  try {
    raw = await readFile(baselinePath, "utf-8");
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return null;
    }
    throw new BaselineError(
      `Failed to read baseline: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BaselineError(
      `Baseline file is corrupt (invalid JSON): ${baselinePath}\n` +
      `Delete the file and run "safe-change save" to create a new baseline.`
    );
  }

  return validateBaseline(parsed, baselinePath);
}

/**
 * Check if .safe-change/ is listed in .gitignore. Does not modify .gitignore.
 */
export async function isStateExcludedFromGit(
  repoRoot: string
): Promise<boolean> {
  const gitignorePath = join(repoRoot, ".gitignore");

  try {
    const content = await readFile(gitignorePath, "utf-8");
    const lines = content.split(/\r?\n/);
    return lines.some(
      (line) =>
        line.trim() === ".safe-change/" ||
        line.trim() === ".safe-change" ||
        line.trim() === ".safe-change/**"
    );
  } catch {
    return false;
  }
}

/**
 * Return the path to the state directory.
 */
export function getStateDirPath(repoRoot: string): string {
  return join(repoRoot, STATE_DIR);
}

// -- Validation --------------------------------------------------------------

function validateBaseline(data: unknown, filePath: string): Baseline {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new BaselineError(
      `Baseline file is corrupt (not an object): ${filePath}`
    );
  }

  const obj = data as Record<string, unknown>;

  if (obj["schemaVersion"] !== CURRENT_SCHEMA_VERSION) {
    throw new BaselineError(
      `Unsupported baseline schema version: ${String(obj["schemaVersion"])}.\n` +
      `This version of safe-change expects schema version ${CURRENT_SCHEMA_VERSION}.\n` +
      `Delete the baseline and run "safe-change save" to create a new one.`
    );
  }

  if (typeof obj["createdAt"] !== "string") {
    throw new BaselineError("Baseline missing createdAt timestamp.");
  }

  if (typeof obj["description"] !== "string") {
    throw new BaselineError("Baseline missing description.");
  }

  if (typeof obj["git"] !== "object" || obj["git"] === null) {
    throw new BaselineError("Baseline missing git state.");
  }

  if (typeof obj["files"] !== "object" || obj["files"] === null) {
    throw new BaselineError("Baseline missing file entries.");
  }

  if (!Array.isArray(obj["checks"])) {
    throw new BaselineError("Baseline missing check results.");
  }

  if (typeof obj["checksConfigHash"] !== "string") {
    throw new BaselineError("Baseline missing checksConfigHash.");
  }

  // We trust the structure after the top-level validation since we wrote it.
  // A more thorough per-field validation could be added if baselines from
  // other sources need to be accepted.
  return data as unknown as Baseline;
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
