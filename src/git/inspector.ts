// ---------------------------------------------------------------------------
// safe-change -- Git inspector (read-only operations only)
// ---------------------------------------------------------------------------

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
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
  const isClean =
    statusResult.exitCode === 0 && statusResult.stdout.trim() === "";

  return { repositoryRoot: repoRoot, headCommit, headBranch, isClean };
}

/**
 * Build a complete file map covering tracked files and untracked files.
 * Excludes .safe-change/ directory.
 */
export async function getFileEntries(
  repoRoot: string
): Promise<Record<string, FileEntry>> {
  const entries: Record<string, FileEntry> = {};

  // 1. Get all tracked files from the index with their index hashes
  const lsResult = await git(repoRoot, [
    "ls-files",
    "--stage",
    "--full-name",
    "-z",
  ]);

  if (lsResult.exitCode === 0 && lsResult.stdout.length > 0) {
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

  if (statusResult.exitCode === 0 && statusResult.stdout.length > 0) {
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
          worktreeHash: null, // computed below
          indexHash: null,
        };
      } else if (status === "deleted") {
        const existing = entries[filePath];
        entries[filePath] = {
          tracked: true,
          status: "deleted",
          worktreeHash: null,
          indexHash: existing?.indexHash ?? null,
        };
      } else {
        const existing = entries[filePath];
        entries[filePath] = {
          tracked: existing?.tracked ?? true,
          status,
          worktreeHash: null, // computed below
          indexHash: existing?.indexHash ?? null,
        };
      }
    }
  }

  // 3. Compute worktree hashes for all non-deleted files
  const hashPromises: Array<Promise<void>> = [];

  for (const [filePath, entry] of Object.entries(entries)) {
    if (entry.status === "deleted") continue;

    hashPromises.push(
      computeFileHash(join(repoRoot, filePath)).then((hash) => {
        entries[filePath] = { ...entry, worktreeHash: hash };
      }).catch(() => {
        // File might have been deleted between status and hash
        entries[filePath] = {
          tracked: entry.tracked,
          status: "deleted",
          worktreeHash: null,
          indexHash: entry.indexHash,
        };
      })
    );
  }

  await Promise.all(hashPromises);

  return entries;
}

/**
 * Generate a bounded diff summary of changes since a given commit or against
 * the working tree. Optionally filtered to specific file paths.
 */
export async function getDiffText(
  repoRoot: string,
  paths?: readonly string[],
  maxBytes: number = 100_000
): Promise<{ text: string; truncated: boolean; linesAdded: number; linesRemoved: number }> {
  if (paths !== undefined && paths.length === 0) {
    return { text: "", truncated: false, linesAdded: 0, linesRemoved: 0 };
  }

  const gitArgs = ["diff", "HEAD", "--stat", "--patch"];
  if (paths !== undefined && paths.length > 0) {
    gitArgs.push("--", ...paths);
  }

  // Show diff of working tree (staged + unstaged)
  const result = await git(repoRoot, gitArgs);

  let text = result.stdout;
  let truncated = false;

  if (Buffer.byteLength(text, "utf-8") > maxBytes) {
    // Truncate to maxBytes
    const buf = Buffer.from(text, "utf-8");
    text = buf.subarray(0, maxBytes).toString("utf-8");
    truncated = true;
  }

  // Count added/removed lines
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

async function computeFileHash(absolutePath: string): Promise<string> {
  // Check if it is a file (not a directory or symlink target that is a dir)
  const st = await stat(absolutePath);
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
