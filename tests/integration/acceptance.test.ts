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

  it("should show zero diff lines when uncommitted changes existed before baseline and no new edits were made", async () => {
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
    // 4. Now run diff comparison against baseline
    const baseline = await loadBaseline(repoRoot);
    expect(baseline).not.toBeNull();

    const currentFiles = await getFileEntries(repoRoot);
    const fileChanges = compareFiles(baseline!.files, currentFiles);

    // Baseline file comparison must report 0 changes
    expect(fileChanges.modified).toHaveLength(0);
    expect(fileChanges.added).toHaveLength(0);
    expect(fileChanges.deleted).toHaveLength(0);

    // Line diff filtered by changed files must return 0 lines added/removed
    const changedFiles = [
      ...fileChanges.modified,
      ...fileChanges.added,
      ...fileChanges.deleted,
    ];
    let diffData;
    if (changedFiles.length === 0) {
      diffData = { text: "", truncated: false, linesAdded: 0, linesRemoved: 0 };
    } else {
      diffData = await getDiffText(repoRoot, changedFiles);
    }

    expect(diffData.linesAdded).toBe(0);
    expect(diffData.linesRemoved).toBe(0);

    const rendered = renderDiffSummary(
      "terminal",
      {
        files: fileChanges,
        hasBaseline: true,
        totalLinesAdded: diffData.linesAdded,
        totalLinesRemoved: diffData.linesRemoved,
        truncated: diffData.truncated,
        diffText: diffData.text,
      },
      baseline
    );

    expect(rendered).toContain("No changes detected since baseline");
    expect(rendered).not.toContain("Lines: +1");
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
});
