// ---------------------------------------------------------------------------
// Unit tests -- Git inspector
// ---------------------------------------------------------------------------

import { describe, it, expect, afterEach } from "vitest";
import { createTempRepo, type TempRepo } from "../helpers/temp-repo.js";
import {
  getRepositoryRoot,
  getGitState,
  getFileEntries,
  getDiffText,
  GitError,
} from "../../src/git/inspector.js";

describe("git/inspector", () => {
  let repo: TempRepo;

  afterEach(async () => {
    if (repo) await repo.cleanup();
  });

  describe("getRepositoryRoot", () => {
    it("should return the repository root", async () => {
      repo = await createTempRepo();
      const root = await getRepositoryRoot(repo.path);
      // Normalize to handle different path representations
      expect(root).toBeTruthy();
    });

    it("should throw for non-git directory", async () => {
      const { mkdtemp } = await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const tempDir = await mkdtemp(join(tmpdir(), "sc-notgit-"));
      try {
        await expect(getRepositoryRoot(tempDir)).rejects.toThrow();
      } finally {
        const { rm } = await import("node:fs/promises");
        await rm(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("getGitState", () => {
    it("should detect a clean repository", async () => {
      repo = await createTempRepo();
      const state = await getGitState(repo.path);
      expect(state.headCommit).toBeTruthy();
      expect(state.isClean).toBe(true);
    });

    it("should detect a dirty repository", async () => {
      repo = await createTempRepo();
      await repo.writeFile("dirty.txt", "uncommitted content");
      const state = await getGitState(repo.path);
      expect(state.isClean).toBe(false);
    });
  });

  describe("getFileEntries", () => {
    it("should include clean tracked files", async () => {
      repo = await createTempRepo();
      await repo.writeFile("tracked.txt", "content");
      await repo.git("add", "tracked.txt");
      await repo.git("commit", "-m", "add file");

      const files = await getFileEntries(repo.path);
      expect(files["tracked.txt"]).toBeDefined();
      expect(files["tracked.txt"]!.tracked).toBe(true);
      expect(files["tracked.txt"]!.status).toBe("clean");
      expect(files["tracked.txt"]!.worktreeHash).toBeTruthy();
    });

    it("should detect modified files with different index and worktree hashes", async () => {
      repo = await createTempRepo();
      await repo.writeFile("file.txt", "original");
      await repo.git("add", "file.txt");
      await repo.git("commit", "-m", "add file");
      await repo.writeFile("file.txt", "modified");

      const files = await getFileEntries(repo.path);
      expect(files["file.txt"]!.status).toBe("modified");
    });

    it("should detect untracked files", async () => {
      repo = await createTempRepo();
      await repo.writeFile("untracked.txt", "new content");

      const files = await getFileEntries(repo.path);
      expect(files["untracked.txt"]).toBeDefined();
      expect(files["untracked.txt"]!.tracked).toBe(false);
      expect(files["untracked.txt"]!.status).toBe("untracked");
    });

    it("should detect staged files", async () => {
      repo = await createTempRepo();
      await repo.writeFile("staged.txt", "staged content");
      await repo.git("add", "staged.txt");

      const files = await getFileEntries(repo.path);
      expect(files["staged.txt"]).toBeDefined();
      expect(files["staged.txt"]!.status).toBe("staged");
    });

    it("should exclude .safe-change/ directory", async () => {
      repo = await createTempRepo();
      await repo.writeFile(".safe-change/baseline.json", "{}");

      const files = await getFileEntries(repo.path);
      expect(files[".safe-change/baseline.json"]).toBeUndefined();
    });

    it("should handle files with spaces in names", async () => {
      repo = await createTempRepo();
      await repo.writeFile("my file.txt", "content with spaces");
      await repo.git("add", "my file.txt");
      await repo.git("commit", "-m", "add file with spaces");

      const files = await getFileEntries(repo.path);
      expect(files["my file.txt"]).toBeDefined();
      expect(files["my file.txt"]!.tracked).toBe(true);
    });
  });

  describe("getDiffText", () => {
    it("should return empty diff for clean repo", async () => {
      repo = await createTempRepo();
      const result = await getDiffText(repo.path);
      expect(result.linesAdded).toBe(0);
      expect(result.linesRemoved).toBe(0);
    });

    it("should show diff for modified files", async () => {
      repo = await createTempRepo();
      await repo.writeFile("file.txt", "original\n");
      await repo.git("add", "file.txt");
      await repo.git("commit", "-m", "add");
      await repo.writeFile("file.txt", "modified\n");

      const result = await getDiffText(repo.path);
      expect(result.linesAdded).toBeGreaterThan(0);
      expect(result.text).toContain("modified");
    });

    it("should truncate large diffs", async () => {
      repo = await createTempRepo();
      const bigContent = "x".repeat(200_000) + "\n";
      await repo.writeFile("big.txt", bigContent);
      await repo.git("add", "big.txt");
      await repo.git("commit", "-m", "add big");
      await repo.writeFile("big.txt", "y".repeat(200_000) + "\n");

      const result = await getDiffText(repo.path, 1000);
      expect(result.truncated).toBe(true);
    });
  });
});
