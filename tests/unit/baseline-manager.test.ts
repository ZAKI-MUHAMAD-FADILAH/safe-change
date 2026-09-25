// ---------------------------------------------------------------------------
// Unit tests -- Baseline manager
// ---------------------------------------------------------------------------

import { describe, it, expect, afterEach } from "vitest";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, type TempRepo } from "../helpers/temp-repo.js";
import {
  saveBaseline,
  loadBaseline,
  computeConfigHash,
  isStateExcludedFromGit,
  BaselineError,
} from "../../src/baseline/manager.js";
import type { GitState, FileEntry, CheckResult, SafeChangeConfig } from "../../src/types/index.js";

const testGitState: GitState = {
  repositoryRoot: "/test",
  headCommit: "abc123",
  headBranch: "main",
  isClean: false,
};

const testFiles: Record<string, FileEntry> = {
  "src/index.ts": {
    tracked: true,
    status: "clean",
    worktreeHash: "sha256:aaa",
    indexHash: "sha256:aaa",
  },
};

const testChecks: CheckResult[] = [
  {
    name: "build",
    executable: "npm",
    args: ["run", "build"],
    exitCode: 0,
    passed: true,
    durationMs: 1000,
    timedOut: false,
    outputBytes: 500,
    outputTruncated: false,
  },
];

const testConfig: SafeChangeConfig = {
  version: 1,
  checks: [{ name: "build", executable: "npm", args: ["run", "build"], timeout: 60 }],
};

describe("baseline/manager", () => {
  let repo: TempRepo;

  afterEach(async () => {
    if (repo) await repo.cleanup();
  });

  describe("saveBaseline and loadBaseline", () => {
    it("should save and load a baseline", async () => {
      repo = await createTempRepo();
      const path = await saveBaseline(
        repo.path, "test baseline", testGitState, testFiles, testChecks, testConfig
      );
      expect(path).toContain(".safe-change");

      const loaded = await loadBaseline(repo.path);
      expect(loaded).not.toBeNull();
      expect(loaded!.schemaVersion).toBe(2);
      expect(loaded!.description).toBe("test baseline");
      expect(loaded!.checks).toHaveLength(1);
      expect(loaded!.checks[0]!.name).toBe("build");
      expect(loaded!.files["src/index.ts"]).toBeDefined();
    });

    it("should return null when no baseline exists", async () => {
      repo = await createTempRepo();
      const result = await loadBaseline(repo.path);
      expect(result).toBeNull();
    });

    it("should throw for corrupt baseline", async () => {
      repo = await createTempRepo();
      await mkdir(join(repo.path, ".safe-change"), { recursive: true });
      await writeFile(
        join(repo.path, ".safe-change", "baseline.json"),
        "not json {{"
      );

      await expect(loadBaseline(repo.path)).rejects.toThrow(BaselineError);
    });

    it("should throw for unsupported schema version", async () => {
      repo = await createTempRepo();
      await mkdir(join(repo.path, ".safe-change"), { recursive: true });
      await writeFile(
        join(repo.path, ".safe-change", "baseline.json"),
        JSON.stringify({ schemaVersion: 99 })
      );

      await expect(loadBaseline(repo.path)).rejects.toThrow(/schema version/);
    });

    it("should overwrite existing baseline", async () => {
      repo = await createTempRepo();
      await saveBaseline(
        repo.path, "first", testGitState, testFiles, testChecks, testConfig
      );
      await saveBaseline(
        repo.path, "second", testGitState, testFiles, testChecks, testConfig
      );

      const loaded = await loadBaseline(repo.path);
      expect(loaded!.description).toBe("second");
    });
  });

  describe("computeConfigHash", () => {
    it("should produce consistent hashes for the same config", () => {
      const hash1 = computeConfigHash(testConfig);
      const hash2 = computeConfigHash(testConfig);
      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different configs", () => {
      const config2: SafeChangeConfig = {
        version: 1,
        checks: [{ name: "test", executable: "npm", args: ["test"], timeout: 60 }],
      };
      expect(computeConfigHash(testConfig)).not.toBe(computeConfigHash(config2));
    });
  });

  describe("isStateExcludedFromGit", () => {
    it("should return true when .safe-change/ is in .gitignore", async () => {
      repo = await createTempRepo();
      await repo.writeFile(".gitignore", "node_modules/\n.safe-change/\n");
      expect(await isStateExcludedFromGit(repo.path)).toBe(true);
    });

    it("should return false when .safe-change/ is not in .gitignore", async () => {
      repo = await createTempRepo();
      await repo.writeFile(".gitignore", "node_modules/\n");
      expect(await isStateExcludedFromGit(repo.path)).toBe(false);
    });

    it("should return false when .gitignore does not exist", async () => {
      repo = await createTempRepo();
      expect(await isStateExcludedFromGit(repo.path)).toBe(false);
    });
  });
});
