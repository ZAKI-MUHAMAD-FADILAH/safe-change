// ---------------------------------------------------------------------------
// Integration test -- Core acceptance test (dirty working tree)
//
// This is the REQUIRED acceptance test for the first release.
// It validates that safe-change correctly detects new failures
// while preserving the user's existing uncommitted work.
// ---------------------------------------------------------------------------

import { describe, it, expect, afterEach } from "vitest";
import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, type TempRepo } from "../helpers/temp-repo.js";
import { loadConfig } from "../../src/config/loader.js";
import {
  getRepositoryRoot,
  getGitState,
  getFileEntries,
  getDiffText,
} from "../../src/git/inspector.js";
import { saveBaseline, loadBaseline } from "../../src/baseline/manager.js";
import { executeAllChecks } from "../../src/runner/executor.js";
import { buildReport, compareFiles } from "../../src/comparator/engine.js";
import { renderDiffSummary } from "../../src/output/renderer.js";

describe("Acceptance: dirty working tree", () => {
  let repo: TempRepo;

  afterEach(async () => {
    if (repo) await repo.cleanup();
  });

  it("should detect new failure while preserving uncommitted changes", async () => {
    // -- Setup: Create a repo with a committed file and an uncommitted change --

    repo = await createTempRepo();

    // Create a simple "check" script that reads a status file
    // If status contains "pass", exit 0; otherwise exit 1
    await repo.writeFile("status.txt", "pass");
    await repo.git("add", "status.txt");
    await repo.git("commit", "-m", "add status file");

    // Create an UNCOMMITTED change that must survive all operations
    await repo.writeFile("uncommitted-work.txt", "important work in progress");

    // Verify the uncommitted file exists
    const uncommittedContentBefore = await readFile(
      join(repo.path, "uncommitted-work.txt"),
      "utf-8"
    );
    expect(uncommittedContentBefore).toBe("important work in progress");

    // Create safe-change config with a check that reads status.txt
    // On Windows use node; cross-platform compatible
    await repo.createConfig([
      {
        name: "status-check",
        executable: "node",
        args: [
          "-e",
          `const fs=require("fs");const s=fs.readFileSync("status.txt","utf-8").trim();process.exit(s==="pass"?0:1);`,
        ],
        timeout: 10,
      },
    ]);

    // -- Step 1: Save baseline --

    const repoRoot = await getRepositoryRoot(repo.path);
    const config = await loadConfig(repoRoot);
    const gitState = await getGitState(repoRoot);
    const filesBefore = await getFileEntries(repoRoot);
    const checkResults = await executeAllChecks(config.checks, { cwd: repoRoot });

    // Verify the check passes at baseline
    expect(checkResults[0]!.passed).toBe(true);
    expect(checkResults[0]!.exitCode).toBe(0);

    // Verify the uncommitted file is in the file map
    expect(filesBefore["uncommitted-work.txt"]).toBeDefined();
    expect(filesBefore["uncommitted-work.txt"]!.status).toBe("untracked");

    // Save baseline
    await saveBaseline(repoRoot, "status check works", gitState, filesBefore, checkResults, config);

    // Verify uncommitted file still exists after save
    const afterSave = await readFile(
      join(repo.path, "uncommitted-work.txt"),
      "utf-8"
    );
    expect(afterSave).toBe("important work in progress");

    // -- Step 2: Break the check --

    await repo.writeFile("status.txt", "fail");

    // -- Step 3: Run check --

    const baseline = await loadBaseline(repoRoot);
    expect(baseline).not.toBeNull();

    const currentFiles = await getFileEntries(repoRoot);
    const currentResults = await executeAllChecks(config.checks, { cwd: repoRoot });

    // Verify the check now fails
    expect(currentResults[0]!.passed).toBe(false);

    // Build report
    const report = buildReport(baseline!, currentResults, currentFiles, config);

    // -- Assertions --

    // The report must show a new failure
    expect(report.exitCode).toBe(1);
    expect(report.summary.newFailures).toBe(1);
    expect(report.results[0]!.result).toBe("pass-fail");
    expect(report.results[0]!.name).toBe("status-check");

    // status.txt must be in the modified files list
    expect(report.files.modified).toContain("status.txt");

    // -- Critical: the uncommitted file must still exist and be unchanged --

    const afterCheck = await readFile(
      join(repo.path, "uncommitted-work.txt"),
      "utf-8"
    );
    expect(afterCheck).toBe("important work in progress");

    // Verify git status still shows the uncommitted file
    const gitStatusResult = await repo.git("status", "--porcelain");
    expect(gitStatusResult.stdout).toContain("uncommitted-work.txt");

    // Verify no commits were made by safe-change
    const logResult = await repo.git("log", "--oneline", "-5");
    expect(logResult.stdout).not.toContain("safe-change");

    // Verify no stash was created
    const stashResult = await repo.git("stash", "list");
    expect(stashResult.stdout.trim()).toBe("");
  });

  it("should handle pre-existing failures without reporting them as new", async () => {
    repo = await createTempRepo();

    // Create a check that already fails
    await repo.writeFile("status.txt", "fail");
    await repo.git("add", "status.txt");
    await repo.git("commit", "-m", "broken status");

    await repo.createConfig([
      {
        name: "status-check",
        executable: "node",
        args: [
          "-e",
          `const fs=require("fs");const s=fs.readFileSync("status.txt","utf-8").trim();process.exit(s==="pass"?0:1);`,
        ],
        timeout: 10,
      },
    ]);

    const repoRoot = await getRepositoryRoot(repo.path);
    const config = await loadConfig(repoRoot);

    // Save baseline with the failing check
    const gitState = await getGitState(repoRoot);
    const files = await getFileEntries(repoRoot);
    const checkResults = await executeAllChecks(config.checks, { cwd: repoRoot });
    expect(checkResults[0]!.passed).toBe(false);

    await saveBaseline(repoRoot, "already broken", gitState, files, checkResults, config);

    // Check again -- still fails but is NOT a new failure
    const baseline = await loadBaseline(repoRoot);
    const currentFiles = await getFileEntries(repoRoot);
    const currentResults = await executeAllChecks(config.checks, { cwd: repoRoot });
    const report = buildReport(baseline!, currentResults, currentFiles, config);

    expect(report.exitCode).toBe(0); // No NEW failures
    expect(report.summary.newFailures).toBe(0);
    expect(report.summary.stillFailing).toBe(1);
    expect(report.results[0]!.result).toBe("fail-fail");
  });

  it("should detect when a previously failing check is fixed", async () => {
    repo = await createTempRepo();

    await repo.writeFile("status.txt", "fail");
    await repo.git("add", "status.txt");
    await repo.git("commit", "-m", "broken");

    await repo.createConfig([
      {
        name: "status-check",
        executable: "node",
        args: [
          "-e",
          `const fs=require("fs");const s=fs.readFileSync("status.txt","utf-8").trim();process.exit(s==="pass"?0:1);`,
        ],
        timeout: 10,
      },
    ]);

    const repoRoot = await getRepositoryRoot(repo.path);
    const config = await loadConfig(repoRoot);

    // Save baseline with failing check
    const gitState = await getGitState(repoRoot);
    const files = await getFileEntries(repoRoot);
    const checkResults = await executeAllChecks(config.checks, { cwd: repoRoot });
    await saveBaseline(repoRoot, "broken baseline", gitState, files, checkResults, config);

    // Fix the check
    await repo.writeFile("status.txt", "pass");

    // Run check
    const baseline = await loadBaseline(repoRoot);
    const currentFiles = await getFileEntries(repoRoot);
    const currentResults = await executeAllChecks(config.checks, { cwd: repoRoot });
    const report = buildReport(baseline!, currentResults, currentFiles, config);

    expect(report.exitCode).toBe(0);
    expect(report.summary.fixed).toBe(1);
    expect(report.results[0]!.result).toBe("fail-pass");
  });

  it("should detect configuration drift", async () => {
    repo = await createTempRepo();

    await repo.writeFile("status.txt", "pass");
    await repo.git("add", "status.txt");
    await repo.git("commit", "-m", "add status");

    // Initial config with two checks
    await repo.createConfig([
      {
        name: "check-a",
        executable: "node",
        args: ["-e", "process.exit(0)"],
        timeout: 10,
      },
      {
        name: "check-b",
        executable: "node",
        args: ["-e", "process.exit(0)"],
        timeout: 10,
      },
    ]);

    const repoRoot = await getRepositoryRoot(repo.path);
    let config = await loadConfig(repoRoot);
    const gitState = await getGitState(repoRoot);
    const files = await getFileEntries(repoRoot);
    const checkResults = await executeAllChecks(config.checks, { cwd: repoRoot });
    await saveBaseline(repoRoot, "two checks", gitState, files, checkResults, config);

    // Change config: remove check-b, add check-c
    await repo.createConfig([
      {
        name: "check-a",
        executable: "node",
        args: ["-e", "process.exit(0)"],
        timeout: 10,
      },
      {
        name: "check-c",
        executable: "node",
        args: ["-e", "process.exit(0)"],
        timeout: 10,
      },
    ]);

    config = await loadConfig(repoRoot);
    const baseline = await loadBaseline(repoRoot);
    const currentFiles = await getFileEntries(repoRoot);
    const currentResults = await executeAllChecks(config.checks, { cwd: repoRoot });
    const report = buildReport(baseline!, currentResults, currentFiles, config);

    expect(report.configDrift.detected).toBe(true);
    expect(report.configDrift.removedChecks).toContain("check-b");
    expect(report.configDrift.addedChecks).toContain("check-c");
    expect(report.results.find((r) => r.name === "check-b")!.result).toBe("config-removed");
    expect(report.results.find((r) => r.name === "check-c")!.result).toBe("config-added");
  });

  it("should show no changes and line diff unavailable when uncommitted changes existed before baseline and no new edits were made", async () => {
    repo = await createTempRepo();

    // 1. Initial commit
    await repo.writeFile("committed.txt", "line 1\nline 2\n");
    await repo.git("add", "committed.txt");
    await repo.git("commit", "-m", "initial commit");

    // 2. Introduce an uncommitted change BEFORE baseline
    await repo.writeFile("committed.txt", "line 1\nline 2\nline 3 uncommitted\n");

    await repo.createConfig([
      {
        name: "dummy",
        executable: "node",
        args: ["-e", "process.exit(0)"],
        timeout: 10,
      },
    ]);

    const repoRoot = await getRepositoryRoot(repo.path);
    const config = await loadConfig(repoRoot);
    const gitState = await getGitState(repoRoot);
    const files = await getFileEntries(repoRoot);
    const checkResults = await executeAllChecks(config.checks, { cwd: repoRoot });

    // Save baseline while the tree is dirty
    await saveBaseline(repoRoot, "dirty baseline", gitState, files, checkResults, config);

    // 3. User makes NO NEW EDITS after baseline
    const baseline = await loadBaseline(repoRoot);
    expect(baseline).not.toBeNull();

    const currentFiles = await getFileEntries(repoRoot);
    const fileChanges = compareFiles(baseline!.files, currentFiles);

    // Baseline file comparison must report 0 changes
    expect(fileChanges.modified).toHaveLength(0);
    expect(fileChanges.added).toHaveLength(0);
    expect(fileChanges.deleted).toHaveLength(0);

    const rendered = renderDiffSummary(
      "terminal",
      {
        files: fileChanges,
        hasBaseline: true,
        lineDiffAvailable: false,
        note: "Line diff unavailable",
      },
      baseline
    );

    expect(rendered).toContain("No changes detected since baseline");
  });

  it("should report file as modified when dirty file is edited again after baseline without misleading line counts", async () => {
    repo = await createTempRepo();

    // Commit file with 1 line
    await repo.writeFile("file.txt", "line 1\n");
    await repo.git("add", "file.txt");
    await repo.git("commit", "-m", "initial");

    // Add second line without committing (dirty tree)
    await repo.writeFile("file.txt", "line 1\nline 2\n");

    await repo.createConfig([
      {
        name: "dummy",
        executable: "node",
        args: ["-e", "process.exit(0)"],
        timeout: 10,
      },
    ]);

    const repoRoot = await getRepositoryRoot(repo.path);
    const config = await loadConfig(repoRoot);
    const gitState = await getGitState(repoRoot);
    const files = await getFileEntries(repoRoot);
    const checkResults = await executeAllChecks(config.checks, { cwd: repoRoot });
    await saveBaseline(repoRoot, "baseline with dirty file", gitState, files, checkResults, config);

    // Add third line after baseline
    await repo.writeFile("file.txt", "line 1\nline 2\nline 3\n");

    const baseline = await loadBaseline(repoRoot);
    const currentFiles = await getFileEntries(repoRoot);
    const fileChanges = compareFiles(baseline!.files, currentFiles);

    // Must report file as modified
    expect(fileChanges.modified).toContain("file.txt");
    expect(fileChanges.added).toHaveLength(0);

    const rendered = renderDiffSummary(
      "terminal",
      {
        files: fileChanges,
        hasBaseline: true,
        lineDiffAvailable: false,
        note: "Line diff unavailable",
      },
      baseline
    );

    expect(rendered).toContain("Modified:  1");
    expect(rendered).toContain("~ file.txt");
    expect(rendered).toContain("Line diff unavailable");
    // Ensure no misleading lines count
    expect(rendered).not.toContain("Lines: +");
  });

  it("should report untracked file added after baseline with line diff unavailable", async () => {
    repo = await createTempRepo();

    await repo.writeFile("base.txt", "base content\n");
    await repo.git("add", "base.txt");
    await repo.git("commit", "-m", "base commit");

    await repo.createConfig([
      {
        name: "dummy",
        executable: "node",
        args: ["-e", "process.exit(0)"],
        timeout: 10,
      },
    ]);

    const repoRoot = await getRepositoryRoot(repo.path);
    const config = await loadConfig(repoRoot);
    const gitState = await getGitState(repoRoot);
    const files = await getFileEntries(repoRoot);
    const checkResults = await executeAllChecks(config.checks, { cwd: repoRoot });
    await saveBaseline(repoRoot, "clean baseline", gitState, files, checkResults, config);

    // Add untracked file after baseline
    await repo.writeFile("untracked-after.txt", "brand new content\n");

    const baseline = await loadBaseline(repoRoot);
    const currentFiles = await getFileEntries(repoRoot);
    const fileChanges = compareFiles(baseline!.files, currentFiles);

    expect(fileChanges.added).toContain("untracked-after.txt");

    const rendered = renderDiffSummary(
      "terminal",
      {
        files: fileChanges,
        hasBaseline: true,
        lineDiffAvailable: false,
        note: "Line diff unavailable",
      },
      baseline
    );

    expect(rendered).toContain("Added:     1");
    expect(rendered).toContain("+ untracked-after.txt");
    expect(rendered).toContain("Line diff unavailable");
  });

  it("should report changes committed after baseline as modified against baseline", async () => {
    repo = await createTempRepo();

    await repo.writeFile("tracked.txt", "v1\n");
    await repo.git("add", "tracked.txt");
    await repo.git("commit", "-m", "v1");

    await repo.createConfig([
      {
        name: "dummy",
        executable: "node",
        args: ["-e", "process.exit(0)"],
        timeout: 10,
      },
    ]);

    const repoRoot = await getRepositoryRoot(repo.path);
    const config = await loadConfig(repoRoot);
    const gitState = await getGitState(repoRoot);
    const files = await getFileEntries(repoRoot);
    const checkResults = await executeAllChecks(config.checks, { cwd: repoRoot });
    await saveBaseline(repoRoot, "v1 baseline", gitState, files, checkResults, config);

    // Edit and COMMIT after baseline
    await repo.writeFile("tracked.txt", "v2 committed\n");
    await repo.git("add", "tracked.txt");
    await repo.git("commit", "-m", "v2 committed");

    const baseline = await loadBaseline(repoRoot);
    const currentFiles = await getFileEntries(repoRoot);
    const fileChanges = compareFiles(baseline!.files, currentFiles);

    // Must be detected as modified relative to baseline, even though working tree is clean
    expect(fileChanges.modified).toContain("tracked.txt");
  });

  it("should detect edits to file named __proto__ after baseline in check and diff", async () => {
    repo = await createTempRepo();

    await repo.writeFile("__proto__", "initial proto content\n");
    await repo.git("add", "__proto__");
    await repo.git("commit", "-m", "commit proto file");

    await repo.createConfig([
      {
        name: "check-proto",
        executable: "node",
        args: ["-e", "process.exit(0)"],
        timeout: 10,
      },
    ]);

    const repoRoot = await getRepositoryRoot(repo.path);
    const config = await loadConfig(repoRoot);
    const gitState = await getGitState(repoRoot);
    const files = await getFileEntries(repoRoot);
    const checkResults = await executeAllChecks(config.checks, { cwd: repoRoot });
    await saveBaseline(repoRoot, "proto baseline", gitState, files, checkResults, config);

    // Modify __proto__
    await repo.writeFile("__proto__", "modified proto content\n");

    const baseline = await loadBaseline(repoRoot);
    const currentFiles = await getFileEntries(repoRoot);
    const report = buildReport(baseline!, checkResults, currentFiles, config);
    const fileChanges = compareFiles(baseline!.files, currentFiles);

    expect(report.files.modified).toContain("__proto__");
    expect(fileChanges.modified).toContain("__proto__");
  });

  it("should classify modified check definition with same name as definition-changed and not fail check run", async () => {
    repo = await createTempRepo();

    await repo.createConfig([
      {
        name: "test-check",
        executable: "node",
        args: ["-e", "process.exit(0)"],
        timeout: 10,
      },
    ]);

    const repoRoot = await getRepositoryRoot(repo.path);
    let config = await loadConfig(repoRoot);
    const gitState = await getGitState(repoRoot);
    const files = await getFileEntries(repoRoot);
    const checkResults = await executeAllChecks(config.checks, { cwd: repoRoot });
    await saveBaseline(repoRoot, "passing test check", gitState, files, checkResults, config);

    // Change the command to something that fails, but keep same check name
    await repo.createConfig([
      {
        name: "test-check",
        executable: "node",
        args: ["-e", "process.exit(1)"],
        timeout: 10,
      },
    ]);

    config = await loadConfig(repoRoot);
    const baseline = await loadBaseline(repoRoot);
    const currentFiles = await getFileEntries(repoRoot);
    const currentResults = await executeAllChecks(config.checks, { cwd: repoRoot });
    const report = buildReport(baseline!, currentResults, currentFiles, config);

    expect(report.configDrift.detected).toBe(true);
    expect(report.configDrift.changedChecks).toContain("test-check");
    expect(report.results[0]!.result).toBe("definition-changed");
    expect(report.summary.newFailures).toBe(0);
    expect(report.summary.definitionChanged).toBe(1);
    expect(report.exitCode).toBe(0); // Not classified as a regression in app code
  });

  it("should classify timeout-only config change as definition-changed with exit code 0", async () => {
    repo = await createTempRepo();

    await repo.createConfig([
      {
        name: "timeout-check",
        executable: "node",
        args: ["-e", "process.exit(0)"],
        timeout: 60,
      },
    ]);

    const repoRoot = await getRepositoryRoot(repo.path);
    let config = await loadConfig(repoRoot);
    const gitState = await getGitState(repoRoot);
    const files = await getFileEntries(repoRoot);
    const checkResults = await executeAllChecks(config.checks, { cwd: repoRoot });
    await saveBaseline(repoRoot, "baseline with 60s timeout", gitState, files, checkResults, config);

    // Modify ONLY timeout (from 60 to 15)
    await repo.createConfig([
      {
        name: "timeout-check",
        executable: "node",
        args: ["-e", "process.exit(0)"],
        timeout: 15,
      },
    ]);

    config = await loadConfig(repoRoot);
    const baseline = await loadBaseline(repoRoot);
    const currentFiles = await getFileEntries(repoRoot);
    const currentResults = await executeAllChecks(config.checks, { cwd: repoRoot });
    const report = buildReport(baseline!, currentResults, currentFiles, config);

    expect(report.configDrift.detected).toBe(true);
    expect(report.configDrift.changedChecks).toContain("timeout-check");
    expect(report.results[0]!.result).toBe("definition-changed");
    expect(report.summary.newFailures).toBe(0);
    expect(report.summary.definitionChanged).toBe(1);
    expect(report.exitCode).toBe(0);
  });
});
