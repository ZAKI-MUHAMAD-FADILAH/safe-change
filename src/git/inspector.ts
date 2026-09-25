// ---------------------------------------------------------------------------
// safe-change -- Git inspector (read-only operations only)
// ---------------------------------------------------------------------------

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, lstat, readlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { FileEntry, FileStatus, GitState } from "../types/index.js";

const EXCLUDED_PATHS = [".safe-change/", ".safe-change\\"];

export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitError";
  }
}

// -- Public API --------------------------------------------------------------

/**
 * Verify that the given directory is inside a Git repository and return
 * the repository root path.
 */
export async function getRepositoryRoot(cwd: string): Promise<string> {
  const result = await git(cwd, ["rev-parse", "--show-toplevel"]);
  if (result.exitCode !== 0) {
    throw new GitError(
      "Not a Git repository (or any parent up to the filesystem root)."
    );
  }
  return resolve(result.stdout.trim());
}

/**
 * Read the current Git state (HEAD commit, branch, clean status).
 */
export async function getGitState(repoRoot: string): Promise<GitState> {
  const [headResult, branchResult] = await Promise.all([
    git(repoRoot, ["rev-parse", "HEAD"]),
    git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]),
  ]);

  const headCommit =
    headResult.exitCode === 0 ? headResult.stdout.trim() : null;
  let headBranch =
    branchResult.exitCode === 0 ? branchResult.stdout.trim() : null;
  if (headBranch === "HEAD") {
    headBranch = null; // detached HEAD
  }

  const statusResult = await git(repoRoot, [
    "status",
    "--porcelain",
    "-uall",
  ]);
  if (statusResult.exitCode !== 0) {
    throw new GitError(
      `Failed to determine Git status: ${statusResult.stderr || statusResult.stdout}`
    );
  }
  const isClean = statusResult.stdout.trim() === "";

  return { repositoryRoot: repoRoot, headCommit, headBranch, isClean };
}

/**
 * Build a complete file map covering tracked files and untracked files.
 * Uses a null-prototype dictionary so special filenames like '__proto__',
 * 'constructor', and 'toString' are safely tracked without collision.
 *
 * Symlinks are hashed by their link target string using lstat/readlink,
 * without traversing or reading target contents outside the repository.
 * Excludes .safe-change/ directory.
 */
export async function getFileEntries(
  repoRoot: string
): Promise<Record<string, FileEntry>> {
  // Use null prototype to avoid special key issues (__proto__, constructor, etc.)
  const entries: Record<string, FileEntry> = Object.create(null);

  // 1. Get all tracked files from the index with their index hashes
  const lsResult = await git(repoRoot, [
    "ls-files",
    "--stage",
    "--full-name",
    "-z",
  ]);

  if (lsResult.exitCode !== 0) {
    throw new GitError(
      `git ls-files failed with exit code ${lsResult.exitCode}: ${lsResult.stderr || lsResult.stdout}`
    );
  }

  if (lsResult.stdout.length > 0) {
    // Format: <mode> <hash> <stage>\t<filename>\0
    const parts = lsResult.stdout.split("\0").filter((s) => s.length > 0);
    for (const part of parts) {
      const tabIndex = part.indexOf("\t");
      if (tabIndex === -1) continue;

      const meta = part.substring(0, tabIndex);
      const filePath = part.substring(tabIndex + 1);

      if (isExcluded(filePath)) continue;

      const metaParts = meta.split(" ");
      const gitBlobHash = metaParts[1] ?? "";

      entries[filePath] = {
        tracked: true,
        status: "clean", // will be updated below
        worktreeHash: null, // will be computed below
        indexHash: gitBlobHash,
      };
    }
  }

  // 2. Get porcelain status for dirty files
  const statusResult = await git(repoRoot, [
    "status",
    "--porcelain=v1",
    "-uall",
    "-z",
  ]);

  if (statusResult.exitCode !== 0) {
    throw new GitError(
      `git status failed with exit code ${statusResult.exitCode}: ${statusResult.stderr || statusResult.stdout}`
    );
  }

  if (statusResult.stdout.length > 0) {
    const parts = statusResult.stdout.split("\0").filter((s) => s.length > 0);

    for (const part of parts) {
      // Porcelain v1 format: XY <path>
      // X = index status, Y = worktree status
      if (part.length < 4) continue;

      const indexStatus = part[0]!;
      const worktreeStatus = part[1]!;
      const filePath = part.substring(3);

      if (isExcluded(filePath)) continue;

      const status = classifyStatus(indexStatus, worktreeStatus);

      if (status === "untracked") {
        entries[filePath] = {
          tracked: false,
          status: "untracked",
          worktreeHash: null,
          indexHash: null,
        };
      } else if (status === "deleted") {
        const existing = entries[filePath];
        entries[filePath] = {
          tracked: true,
          status: "deleted",
          worktreeHash: null,
          indexHash: existing ? existing.indexHash : null,
        };
      } else {
        const existing = entries[filePath];
        entries[filePath] = {
          tracked: existing ? existing.tracked : true,
          status,
          worktreeHash: null,
          indexHash: existing ? existing.indexHash : null,
        };
      }
    }
  }

  // 3. Compute worktree hashes in bounded concurrency batches (concurrency: 16)
  const filePaths = Object.keys(entries);
  const CONCURRENCY_LIMIT = 16;

  for (let i = 0; i < filePaths.length; i += CONCURRENCY_LIMIT) {
    const batch = filePaths.slice(i, i + CONCURRENCY_LIMIT);
    await Promise.all(
      batch.map(async (filePath) => {
        const entry = entries[filePath];
        if (!entry || entry.status === "deleted") return;

        try {
          const hash = await computeFileHash(join(repoRoot, filePath));
          entries[filePath] = { ...entry, worktreeHash: hash };
        } catch (err: unknown) {
          if (isNodeError(err) && err.code === "ENOENT") {
            // File was genuinely deleted between status and hash computation
            entries[filePath] = {
              tracked: entry.tracked,
              status: "deleted",
              worktreeHash: null,
              indexHash: entry.indexHash,
            };
          } else {
            // Permission or I/O failure: do NOT misclassify as deleted
            throw new GitError(
              `Failed to inspect file "${filePath}": ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      })
    );
  }

  return entries;
}

/**
 * Generate a bounded diff summary of changes against the working tree.
 * Optionally filtered to specific file paths.
 */
export async function getDiffText(
  repoRoot: string,
  pathsOrMaxBytes?: readonly string[] | number,
  maxBytesArg?: number
): Promise<{ text: string; truncated: boolean; linesAdded: number; linesRemoved: number }> {
  let paths: readonly string[] | undefined;
  let maxBytes = 100_000;

  if (typeof pathsOrMaxBytes === "number") {
    maxBytes = pathsOrMaxBytes;
  } else if (Array.isArray(pathsOrMaxBytes)) {
    paths = pathsOrMaxBytes;
    if (typeof maxBytesArg === "number") {
      maxBytes = maxBytesArg;
    }
  }

  if (paths !== undefined && paths.length === 0) {
    return { text: "", truncated: false, linesAdded: 0, linesRemoved: 0 };
  }

  const gitArgs = ["diff", "HEAD", "--stat", "--patch"];
  if (paths !== undefined && paths.length > 0) {
    gitArgs.push("--", ...paths);
  }

  const result = await git(repoRoot, gitArgs);

  let text = result.stdout;
  let truncated = false;

  if (Buffer.byteLength(text, "utf-8") > maxBytes) {
    const buf = Buffer.from(text, "utf-8");
    text = buf.subarray(0, maxBytes).toString("utf-8");
    truncated = true;
  }

  let linesAdded = 0;
  let linesRemoved = 0;
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      linesAdded++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      linesRemoved++;
    }
  }

  return { text, truncated, linesAdded, linesRemoved };
}

// -- Internal helpers --------------------------------------------------------

function classifyStatus(
  indexStatus: string,
  worktreeStatus: string
): FileStatus {
  if (indexStatus === "?" && worktreeStatus === "?") return "untracked";
  if (worktreeStatus === "D" || indexStatus === "D") return "deleted";
  if (
    indexStatus === "A" ||
    indexStatus === "M" ||
    indexStatus === "R" ||
    indexStatus === "C"
  ) {
    return "staged";
  }
  if (worktreeStatus === "M") return "modified";
  return "clean";
}

function isExcluded(filePath: string): boolean {
  return EXCLUDED_PATHS.some(
    (exc) => filePath === exc.replace(/[/\\]$/, "") || filePath.startsWith(exc)
  );
}

/**
 * Compute the SHA-256 hash of a file or symbolic link.
 * For symlinks, hashes the link target string itself using lstat/readlink,
 * preventing target traversal and keeping reads strictly within repository bounds.
 */
export async function computeFileHash(absolutePath: string): Promise<string> {
  const st = await lstat(absolutePath);

  if (st.isSymbolicLink()) {
    // Read the link target string without following it
    const linkTarget = await readlink(absolutePath);
    return "sha256:" + createHash("sha256").update("symlink:" + linkTarget).digest("hex");
  }

  if (!st.isFile()) {
    return "not-a-file";
  }

  const content = await readFile(absolutePath);
  return "sha256:" + createHash("sha256").update(content).digest("hex");
}

interface GitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function git(cwd: string, args: string[]): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      {
        cwd,
        maxBuffer: 10 * 1024 * 1024, // 10 MB
        encoding: "utf-8",
        timeout: 30_000,
      },
      (error, stdout, stderr) => {
        if (error && "code" in error && typeof error.code === "number") {
          resolve({ exitCode: error.code, stdout: stdout ?? "", stderr: stderr ?? "" });
        } else if (error) {
          resolve({ exitCode: 128, stdout: stdout ?? "", stderr: stderr ?? "" });
        } else {
          resolve({ exitCode: 0, stdout: stdout ?? "", stderr: stderr ?? "" });
        }
      }
    );
  });
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
