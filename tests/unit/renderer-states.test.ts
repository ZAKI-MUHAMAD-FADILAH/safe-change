import { describe, it, expect } from "vitest";
import {
  renderSaveResult,
  renderCheckReport,
} from "../../src/output/renderer.js";
import type { CheckReport } from "../../src/types/index.js";

describe("Renderer State Representations", () => {
  it("renders save result states in terminal and json formats", () => {
    const verifiedRender = renderSaveResult(
      "terminal",
      "test desc",
      2,
      2,
      10,
      "/path/to/baseline.json",
      false,
      {
        state: "verified",
        reason: "All checks passed",
        configuredChecksCount: 2,
        executedChecksCount: 2,
        activeRulesCount: 0,
      }
    );
    expect(verifiedRender).toContain("VERIFIED");

    const notVerifiedRender = renderSaveResult(
      "terminal",
      "test desc",
      0,
      0,
      10,
      "/path/to/baseline.json",
      true,
      {
        state: "not-verified",
        reason: "Zero checks and zero rules",
        configuredChecksCount: 0,
        executedChecksCount: 0,
        activeRulesCount: 0,
      }
    );
    expect(notVerifiedRender).toContain("NOT VERIFIED");
    expect(notVerifiedRender).toContain("Warning: .safe-change/ is not in .gitignore");

    const jsonRender = renderSaveResult(
      "json",
      "test desc",
      1,
      1,
      5,
      "/path/to/baseline.json",
      false
    );
    expect(JSON.parse(jsonRender).description).toBe("test desc");
  });

  it("renders check report with branch mismatch, failure output, and rules violations", () => {
    const report: CheckReport = {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      baseline: {
        createdAt: "2026-09-29T00:00:00.000Z",
        description: "Baseline before test",
      },
      configDrift: {
        detected: true,
        removedChecks: ["removed-task"],
        addedChecks: ["added-task"],
        changedChecks: [],
        message: "Check definitions drift detected",
      },
      branchMismatch: {
        baselineBranch: "main",
        currentBranch: "feature-branch",
      },
      results: [
        {
          name: "failing-task",
          before: "pass",
          now: "fail",
          result: "pass-fail",
          durationMs: 120,
          timedOut: false,
          stdout: "stdout diagnostic tail line 1\nstdout diagnostic tail line 2",
          stderr: "stderr diagnostic tail line 1\nstderr diagnostic tail line 2",
          exitCode: 1,
        },
      ],
      files: {
        added: ["new-file.txt"],
        modified: ["mod-file.txt"],
        deleted: ["old-file.txt"],
        unchangedCount: 42,
      },
      summary: {
        newFailures: 1,
        fixed: 0,
        stillFailing: 0,
        stillPassing: 0,
        configDrift: true,
        definitionChanged: 0,
      },
      exitCode: 1,
      ruleViolations: [
        {
          ruleId: "protect-lockfile",
          ruleName: "Protect Lockfile",
          severity: "error",
          message: "package-lock.json must not be modified directly",
        },
        {
          ruleId: "warn-files",
          ruleName: "Max Files Warning",
          severity: "warn",
          message: "More than 5 files modified",
        },
      ],
      verification: {
        state: "failed",
        reason: "Regression detected in check results",
        configuredChecksCount: 1,
        executedChecksCount: 1,
        activeRulesCount: 2,
      },
      rulesState: {
        status: "loaded",
        rules: [],
      },
    };

    const terminalOutput = renderCheckReport("terminal", report);
    expect(terminalOutput).toContain("Configuration drift detected");
    expect(terminalOutput).toContain("Branch mismatch");
    expect(terminalOutput).toContain("Failure output:");
    expect(terminalOutput).toContain("failing-task");
    expect(terminalOutput).toContain("stderr diagnostic tail line 2");
    expect(terminalOutput).toContain("Added:     1");
    expect(terminalOutput).toContain("Modified:  1");
    expect(terminalOutput).toContain("Deleted:   1");
    expect(terminalOutput).toContain("State: FAILED");
    expect(terminalOutput).toContain("SAFETY VIOLATIONS: 1 blocking safety rule violation");

    const jsonOutput = renderCheckReport("json", report);
    const parsed = JSON.parse(jsonOutput);
    expect(parsed.verification.state).toBe("failed");
    expect(parsed.ruleViolations).toHaveLength(2);
  });
});
