// ---------------------------------------------------------------------------
// Unit tests -- Baseline manager
// ---------------------------------------------------------------------------

import { describe, it, expect, afterEach } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
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
    timeout: 60,
    exitCode: 0,
    passed: true,
    durationMs: 1000,
    timedOut: false,
    outputBytes: 500,
    outputTruncated: false,
    stdout: "",
    stderr: "",
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
      expect(loaded!.checks[0]!.timeout).toBe(60);
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

    it("should throw BaselineError when file entries are malformed", async () => {
      repo = await createTempRepo();
      await mkdir(join(repo.path, ".safe-change"), { recursive: true });
      await writeFile(
        join(repo.path, ".safe-change", "baseline.json"),
        JSON.stringify({
          schemaVersion: 2,
          createdAt: new Date().toISOString(),
          description: "bad files",
          git: testGitState,
          files: { "broken.txt": { tracked: "not-a-boolean", status: "clean" } },
          checks: testChecks,
          checksConfigHash: "sha256:123",
        })
      );

      await expect(loadBaseline(repo.path)).rejects.toThrow(BaselineError);
    });

    it("should save and load baseline containing __proto__, constructor, and toString safely", async () => {
      repo = await createTempRepo();
      const specialFiles: Record<string, FileEntry> = Object.create(null);
      specialFiles["__proto__"] = {
        tracked: true,
        status: "clean",
        worktreeHash: "sha256:proto",
        indexHash: "sha256:proto",
      };
      specialFiles["constructor"] = {
        tracked: true,
        status: "clean",
        worktreeHash: "sha256:ctor",
        indexHash: "sha256:ctor",
      };
      specialFiles["toString"] = {
        tracked: true,
        status: "clean",
        worktreeHash: "sha256:tostr",
        indexHash: "sha256:tostr",
      };

      await saveBaseline(
        repo.path, "special filenames baseline", testGitState, specialFiles, testChecks, testConfig
      );

      const loaded = await loadBaseline(repo.path);
      expect(loaded).not.toBeNull();

      const ownKeys = Object.keys(loaded!.files);
      expect(ownKeys).toContain("__proto__");
      expect(ownKeys).toContain("constructor");
      expect(ownKeys).toContain("toString");

      expect(loaded!.files["__proto__"]).toBeDefined();
      expect(loaded!.files["__proto__"]!.worktreeHash).toBe("sha256:proto");
      expect(loaded!.files["constructor"]!.worktreeHash).toBe("sha256:ctor");
      expect(loaded!.files["toString"]!.worktreeHash).toBe("sha256:tostr");
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

    it("should produce different hashes when only timeout changes", () => {
      const configTimeoutChange: SafeChangeConfig = {
        version: 1,
        checks: [{ name: "build", executable: "npm", args: ["run", "build"], timeout: 120 }],
      };
      expect(computeConfigHash(testConfig)).not.toBe(computeConfigHash(configTimeoutChange));
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
