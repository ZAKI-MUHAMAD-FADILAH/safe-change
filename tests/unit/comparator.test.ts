// ---------------------------------------------------------------------------
// Unit tests -- Comparator engine
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import {
  compareChecks,
  compareFiles,
  buildReport,
  detectConfigDrift,
} from "../../src/comparator/engine.js";
import type {
  Baseline,
  CheckResult,
  FileEntry,
  SafeChangeConfig,
} from "../../src/types/index.js";
import { computeConfigHash } from "../../src/baseline/manager.js";

function makeBaseline(overrides?: Partial<Baseline>): Baseline {
  const config: SafeChangeConfig = {
    version: 1,
    checks: [
      { name: "build", executable: "npm", args: ["run", "build"], timeout: 60 },
      { name: "test", executable: "npm", args: ["test"], timeout: 120 },
    ],
  };

  return {
    schemaVersion: 2,
    createdAt: "2026-01-01T00:00:00Z",
    description: "test baseline",
    git: { repositoryRoot: "/test", headCommit: "abc", headBranch: "main", isClean: true },
    files: {},
    excludedPaths: [".safe-change/"],
    checks: [
      { name: "build", executable: "npm", args: ["run", "build"], exitCode: 0, passed: true, durationMs: 1000, timedOut: false, outputBytes: 100, outputTruncated: false },
      { name: "test", executable: "npm", args: ["test"], exitCode: 0, passed: true, durationMs: 2000, timedOut: false, outputBytes: 200, outputTruncated: false },
    ],
    checksConfigHash: computeConfigHash(config),
    ...overrides,
  };
}

describe("comparator/engine", () => {
  describe("detectConfigDrift", () => {
    it("should detect no drift when config is unchanged", () => {
      const config: SafeChangeConfig = {
        version: 1,
        checks: [
          { name: "build", executable: "npm", args: ["run", "build"], timeout: 60 },
          { name: "test", executable: "npm", args: ["test"], timeout: 120 },
        ],
      };
      const baseline = makeBaseline();
      const drift = detectConfigDrift(baseline, config);
      expect(drift.detected).toBe(false);
    });

    it("should detect added checks", () => {
      const config: SafeChangeConfig = {
        version: 1,
        checks: [
          { name: "build", executable: "npm", args: ["run", "build"], timeout: 60 },
          { name: "test", executable: "npm", args: ["test"], timeout: 120 },
          { name: "lint", executable: "npm", args: ["run", "lint"], timeout: 30 },
        ],
      };
      const baseline = makeBaseline();
      const drift = detectConfigDrift(baseline, config);
      expect(drift.detected).toBe(true);
      expect(drift.addedChecks).toContain("lint");
    });

    it("should detect removed checks", () => {
      const config: SafeChangeConfig = {
        version: 1,
        checks: [
          { name: "build", executable: "npm", args: ["run", "build"], timeout: 60 },
        ],
      };
      const baseline = makeBaseline();
      const drift = detectConfigDrift(baseline, config);
      expect(drift.detected).toBe(true);
      expect(drift.removedChecks).toContain("test");
    });
  });

  describe("compareChecks", () => {
    it("should classify pass-pass correctly", () => {
      const config: SafeChangeConfig = {
        version: 1,
        checks: [
          { name: "build", executable: "npm", args: ["run", "build"], timeout: 60 },
          { name: "test", executable: "npm", args: ["test"], timeout: 120 },
        ],
      };
      const currentResults: CheckResult[] = [
        { name: "build", executable: "npm", args: ["run", "build"], exitCode: 0, passed: true, durationMs: 1100, timedOut: false, outputBytes: 100, outputTruncated: false },
        { name: "test", executable: "npm", args: ["test"], exitCode: 0, passed: true, durationMs: 2100, timedOut: false, outputBytes: 200, outputTruncated: false },
      ];

      const { comparisons } = compareChecks(makeBaseline(), currentResults, config);
      expect(comparisons.find((c) => c.name === "build")!.result).toBe("pass-pass");
      expect(comparisons.find((c) => c.name === "test")!.result).toBe("pass-pass");
    });

    it("should classify pass-fail as new failure", () => {
      const config: SafeChangeConfig = {
        version: 1,
        checks: [
          { name: "build", executable: "npm", args: ["run", "build"], timeout: 60 },
          { name: "test", executable: "npm", args: ["test"], timeout: 120 },
        ],
      };
      const currentResults: CheckResult[] = [
        { name: "build", executable: "npm", args: ["run", "build"], exitCode: 0, passed: true, durationMs: 1100, timedOut: false, outputBytes: 100, outputTruncated: false },
        { name: "test", executable: "npm", args: ["test"], exitCode: 1, passed: false, durationMs: 2100, timedOut: false, outputBytes: 200, outputTruncated: false },
      ];

      const { comparisons } = compareChecks(makeBaseline(), currentResults, config);
      expect(comparisons.find((c) => c.name === "test")!.result).toBe("pass-fail");
    });

    it("should classify fail-pass as fixed", () => {
      const baseline = makeBaseline({
        checks: [
          { name: "build", executable: "npm", args: ["run", "build"], exitCode: 1, passed: false, durationMs: 1000, timedOut: false, outputBytes: 100, outputTruncated: false },
        ],
      });
      const config: SafeChangeConfig = {
        version: 1,
        checks: [{ name: "build", executable: "npm", args: ["run", "build"], timeout: 60 }],
      };
      const currentResults: CheckResult[] = [
        { name: "build", executable: "npm", args: ["run", "build"], exitCode: 0, passed: true, durationMs: 1100, timedOut: false, outputBytes: 100, outputTruncated: false },
      ];

      const { comparisons } = compareChecks(baseline, currentResults, config);
      expect(comparisons.find((c) => c.name === "build")!.result).toBe("fail-pass");
    });

    it("should classify fail-fail correctly", () => {
      const baseline = makeBaseline({
        checks: [
          { name: "test", executable: "npm", args: ["test"], exitCode: 1, passed: false, durationMs: 2000, timedOut: false, outputBytes: 200, outputTruncated: false },
        ],
      });
      const config: SafeChangeConfig = {
        version: 1,
        checks: [{ name: "test", executable: "npm", args: ["test"], timeout: 120 }],
      };
      const currentResults: CheckResult[] = [
        { name: "test", executable: "npm", args: ["test"], exitCode: 1, passed: false, durationMs: 2100, timedOut: false, outputBytes: 200, outputTruncated: false },
      ];

      const { comparisons } = compareChecks(baseline, currentResults, config);
      expect(comparisons.find((c) => c.name === "test")!.result).toBe("fail-fail");
    });

    it("should classify pass-timeout as new regression", () => {
      const config: SafeChangeConfig = {
        version: 1,
        checks: [{ name: "build", executable: "npm", args: ["run", "build"], timeout: 60 }],
      };
      const currentResults: CheckResult[] = [
        { name: "build", executable: "npm", args: ["run", "build"], exitCode: null, passed: false, durationMs: 60000, timedOut: true, outputBytes: 100, outputTruncated: false },
      ];

      const { comparisons } = compareChecks(makeBaseline(), currentResults, config);
      expect(comparisons.find((c) => c.name === "build")!.result).toBe("pass-timeout");
    });

    it("should detect config-removed and config-added", () => {
      const config: SafeChangeConfig = {
        version: 1,
        checks: [
          { name: "lint", executable: "npm", args: ["run", "lint"], timeout: 30 },
        ],
      };
      const currentResults: CheckResult[] = [
        { name: "lint", executable: "npm", args: ["run", "lint"], exitCode: 0, passed: true, durationMs: 500, timedOut: false, outputBytes: 50, outputTruncated: false },
      ];

      const { comparisons, drift } = compareChecks(makeBaseline(), currentResults, config);
      expect(drift.detected).toBe(true);
      expect(comparisons.find((c) => c.name === "lint")!.result).toBe("config-added");
      expect(comparisons.find((c) => c.name === "build")!.result).toBe("config-removed");
      expect(comparisons.find((c) => c.name === "test")!.result).toBe("config-removed");
    });
  });

  describe("compareFiles", () => {
    it("should detect added files", () => {
      const before: Record<string, FileEntry> = {};
      const after: Record<string, FileEntry> = {
        "new.ts": { tracked: false, status: "untracked", worktreeHash: "sha256:aaa", indexHash: null },
      };
      const result = compareFiles(before, after);
      expect(result.added).toContain("new.ts");
    });

    it("should detect modified files by hash change", () => {
      const entry: FileEntry = { tracked: true, status: "clean", worktreeHash: "sha256:aaa", indexHash: "sha256:aaa" };
      const modified: FileEntry = { tracked: true, status: "modified", worktreeHash: "sha256:bbb", indexHash: "sha256:aaa" };
      const result = compareFiles({ "file.ts": entry }, { "file.ts": modified });
      expect(result.modified).toContain("file.ts");
    });

    it("should detect deleted files", () => {
      const entry: FileEntry = { tracked: true, status: "clean", worktreeHash: "sha256:aaa", indexHash: "sha256:aaa" };
      const result = compareFiles({ "file.ts": entry }, {});
      expect(result.deleted).toContain("file.ts");
    });

    it("should count unchanged files", () => {
      const entry: FileEntry = { tracked: true, status: "clean", worktreeHash: "sha256:aaa", indexHash: "sha256:aaa" };
      const result = compareFiles({ "file.ts": entry }, { "file.ts": entry });
      expect(result.unchangedCount).toBe(1);
    });
  });

  describe("buildReport", () => {
    it("should set exit code 1 for new failures", () => {
      const config: SafeChangeConfig = {
        version: 1,
        checks: [
          { name: "build", executable: "npm", args: ["run", "build"], timeout: 60 },
          { name: "test", executable: "npm", args: ["test"], timeout: 120 },
        ],
      };
      const currentResults: CheckResult[] = [
        { name: "build", executable: "npm", args: ["run", "build"], exitCode: 0, passed: true, durationMs: 1000, timedOut: false, outputBytes: 100, outputTruncated: false },
        { name: "test", executable: "npm", args: ["test"], exitCode: 1, passed: false, durationMs: 2000, timedOut: false, outputBytes: 200, outputTruncated: false },
      ];

      const report = buildReport(makeBaseline(), currentResults, {}, config);
      expect(report.exitCode).toBe(1);
      expect(report.summary.newFailures).toBe(1);
    });

    it("should set exit code 0 for fail-fail (no NEW failure)", () => {
      const baseline = makeBaseline({
        checks: [
          { name: "test", executable: "npm", args: ["test"], exitCode: 1, passed: false, durationMs: 2000, timedOut: false, outputBytes: 200, outputTruncated: false, stdout: "", stderr: "" },
        ],
      });
      const config: SafeChangeConfig = {
        version: 1,
        checks: [{ name: "test", executable: "npm", args: ["test"], timeout: 120 }],
      };
      const currentResults: CheckResult[] = [
        { name: "test", executable: "npm", args: ["test"], exitCode: 1, passed: false, durationMs: 2000, timedOut: false, outputBytes: 200, outputTruncated: false, stdout: "", stderr: "" },
      ];

      const report = buildReport(baseline, currentResults, {}, config);
      expect(report.exitCode).toBe(0);
      expect(report.summary.stillFailing).toBe(1);
    });

    it("should not trigger exit code 1 when check definition changes with same name", () => {
      const baseline = makeBaseline({
        checks: [
          { name: "test", executable: "npm", args: ["test"], exitCode: 0, passed: true, durationMs: 2000, timedOut: false, outputBytes: 200, outputTruncated: false, stdout: "", stderr: "" },
        ],
      });
      const config: SafeChangeConfig = {
        version: 1,
        checks: [{ name: "test", executable: "npx", args: ["vitest", "run"], timeout: 120 }],
      };
      const currentResults: CheckResult[] = [
        { name: "test", executable: "npx", args: ["vitest", "run"], exitCode: 1, passed: false, durationMs: 2000, timedOut: false, outputBytes: 200, outputTruncated: false, stdout: "", stderr: "fail" },
      ];

      const report = buildReport(baseline, currentResults, {}, config);
      expect(report.configDrift.detected).toBe(true);
      expect(report.configDrift.changedChecks).toContain("test");
      expect(report.results.find((c) => c.name === "test")!.result).toBe("definition-changed");
      expect(report.summary.newFailures).toBe(0);
      expect(report.summary.definitionChanged).toBe(1);
      expect(report.exitCode).toBe(0);
    });
  });
});
