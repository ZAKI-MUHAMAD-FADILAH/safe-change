import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, ConfigError } from "../../src/config/loader.js";
import { runAssess } from "../../src/commands/assess.js";
import { runSave } from "../../src/commands/save.js";
import { ExitCodes } from "../../src/types/index.js";
import { createTempRepo, type TempRepo } from "../helpers/temp-repo.js";
import {
  assessChange,
  evaluateChangeBudget,
  modeForRisk,
} from "../../src/enterprise/risk-engine.js";
import { DEFAULT_ENTERPRISE_POLICY } from "../../src/enterprise/policy.js";
import type { ChangeMetrics, FileChanges } from "../../src/types/index.js";

const NO_CHANGES: FileChanges = {
  added: [],
  modified: [],
  deleted: [],
  unchangedCount: 10,
};

describe("enterprise risk engine", () => {
  it("maps documented score boundaries to enterprise modes", () => {
    expect(modeForRisk(0)).toBe("standard");
    expect(modeForRisk(19)).toBe("standard");
    expect(modeForRisk(20)).toBe("enhanced");
    expect(modeForRisk(50)).toBe("high-assurance");
    expect(modeForRisk(80)).toBe("critical-change");
    expect(modeForRisk(100)).toBe("critical-change");
  });

  it("scores each risk category once and caps the aggregate at 100", () => {
    const result = assessChange({
      files: {
        added: ["src/auth/session.ts", ".github/workflows/release.yml"],
        modified: ["package.json", "db/migrations/001.sql"],
        deleted: ["src/legacy.ts"],
        unchangedCount: 1,
      },
      linesAdded: 20,
      linesDeleted: 10,
      diffText: "",
      policy: {
        ...DEFAULT_ENTERPRISE_POLICY,
        changeBudget: {
          ...DEFAULT_ENTERPRISE_POLICY.changeBudget,
          maxFilesChanged: 10,
          maxLinesAdded: 100,
          maxLinesDeleted: 100,
          maxDeletedFiles: 10,
          allowLockfileChanges: true,
        },
      },
      hasBaseline: true,
      configuredCheckNames: ["test"],
    });

    expect(result.riskScore).toBe(100);
    expect(result.requiredMode).toBe("critical-change");
    expect(result.signals.map((signal) => signal.category)).toEqual(
      expect.arrayContaining([
        "source",
        "dependency",
        "ci",
        "file-deletion",
        "authentication",
        "migration",
        "release",
      ])
    );
  });

  it("never lets configured minimum mode lower automatic risk mode", () => {
    const result = assessChange({
      files: {
        ...NO_CHANGES,
        modified: [".github/workflows/ci.yml"],
      },
      linesAdded: 1,
      linesDeleted: 0,
      policy: { ...DEFAULT_ENTERPRISE_POLICY, minimumMode: "standard" },
      hasBaseline: true,
      configuredCheckNames: ["tests"],
    });

    expect(result.automaticMode).toBe("enhanced");
    expect(result.requiredMode).toBe("enhanced");
  });

  it("classifies adversarial test-like paths without a backtracking regular expression", () => {
    const longPath = `${".spec.".repeat(10_000)}fixture.ts`;
    const result = assessChange({
      files: { ...NO_CHANGES, modified: [longPath] },
      linesAdded: 1,
      linesDeleted: 0,
      policy: DEFAULT_ENTERPRISE_POLICY,
      hasBaseline: true,
      configuredCheckNames: ["test"],
    });

    expect(result.signals.some((signal) => signal.category === "test")).toBe(true);
  });

  it("detects anti-policy-downgrade diff patterns as blocking", () => {
    const result = assessChange({
      files: {
        ...NO_CHANGES,
        modified: [".github/workflows/ci.yml", "tests/auth.test.ts"],
      },
      linesAdded: 2,
      linesDeleted: 1,
      diffText:
        "+    continue-on-error: true\n+  it.skip('rejects invalid token', () => {})\n",
      policy: DEFAULT_ENTERPRISE_POLICY,
      hasBaseline: true,
      configuredCheckNames: ["test"],
    });

    expect(result.signals.some((signal) => signal.category === "guardrail-downgrade")).toBe(true);
    expect(result.policyBlockers).toContain(
      "Potential policy downgrade requires explicit approval and high-assurance review."
    );
    expect(result.approvalRequired).toBe(true);
  });

  it("reports every exceeded change budget dimension", () => {
    const metrics: ChangeMetrics = {
      filesChanged: 5,
      filesDeleted: 2,
      linesAdded: 101,
      linesDeleted: 51,
      publicApisChanged: 2,
      lockfilesChanged: ["package-lock.json"],
    };
    const violations = evaluateChangeBudget(metrics, {
      maxFilesChanged: 4,
      maxDeletedFiles: 1,
      maxLinesAdded: 100,
      maxLinesDeleted: 50,
      maxPublicApisChanged: 1,
      allowLockfileChanges: false,
    });

    expect(violations.map((violation) => violation.field).sort()).toEqual([
      "allowLockfileChanges",
      "maxDeletedFiles",
      "maxFilesChanged",
      "maxLinesAdded",
      "maxLinesDeleted",
      "maxPublicApisChanged",
    ]);
  });

  it("requires configured evidence named for mandatory coverage and audit gates", () => {
    const result = assessChange({
      files: NO_CHANGES,
      linesAdded: 0,
      linesDeleted: 0,
      policy: {
        ...DEFAULT_ENTERPRISE_POLICY,
        requireCoverage: true,
        requireDependencyAudit: true,
      },
      hasBaseline: true,
      configuredCheckNames: ["build", "unit-test"],
    });

    expect(result.policyBlockers).toEqual([
      "Coverage is required but no coverage-like check is configured.",
      "Dependency audit is required but no audit-like check is configured.",
    ]);
    expect(result.verificationState).toBe("not-verified");
  });
});

describe("enterprise policy configuration", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "safe-change-enterprise-policy-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("loads a machine-readable enterprise policy and fills safe defaults", async () => {
    await writeFile(
      join(directory, ".safe-change.json"),
      JSON.stringify({
        version: 1,
        checks: [],
        enterprisePolicy: {
          policyVersion: 1,
          minimumMode: "high-assurance",
          changeBudget: { maxFilesChanged: 20 },
        },
      })
    );

    const config = await loadConfig(directory);
    expect(config.enterprisePolicy?.minimumMode).toBe("high-assurance");
    expect(config.enterprisePolicy?.changeBudget.maxFilesChanged).toBe(20);
    expect(config.enterprisePolicy?.changeBudget.maxDeletedFiles).toBe(0);
    expect(config.enterprisePolicy?.allowForcePush).toBe(false);
  });

  it("rejects policy attempts to enable destructive Git behavior", async () => {
    await writeFile(
      join(directory, ".safe-change.json"),
      JSON.stringify({
        version: 1,
        checks: [],
        enterprisePolicy: {
          policyVersion: 1,
          allowForcePush: true,
        },
      })
    );

    await expect(loadConfig(directory)).rejects.toThrow(ConfigError);
    await expect(loadConfig(directory)).rejects.toThrow(
      "cannot enable force push or destructive Git operations"
    );
  });
});

describe("enterprise assess command", () => {
  let repo: TempRepo;
  const originalStdoutWrite = process.stdout.write;
  let stdout = "";

  beforeEach(async () => {
    repo = await createTempRepo();
    stdout = "";
    process.stdout.write = ((chunk: string | Buffer) => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(async () => {
    process.stdout.write = originalStdoutWrite;
    await repo.cleanup();
  });

  it("returns a blocking JSON assessment when the configured budget is exceeded", async () => {
    await repo.writeFile(
      ".safe-change.json",
      JSON.stringify({
        version: 1,
        checks: [
          {
            name: "test",
            executable: process.execPath,
            args: ["-e", "process.exit(0)"],
            timeout: 5,
          },
        ],
        enterprisePolicy: {
          policyVersion: 1,
          minimumMode: "standard",
          changeBudget: { maxFilesChanged: 0 },
        },
      })
    );
    const originalCwd = process.cwd();
    process.chdir(repo.path);

    try {
      expect(
        await runSave({ description: "assessment baseline", format: "json" })
      ).toBe(ExitCodes.OK);
      await repo.writeFile("src/feature.ts", "export const enabled = true;\n");
      stdout = "";

      expect(await runAssess({ format: "json" })).toBe(ExitCodes.NEW_FAILURE);
      const result = JSON.parse(stdout);
      expect(result.signals.map((signal: { category: string }) => signal.category)).toContain(
        "source"
      );
      expect(result.budgetPassed).toBe(false);
      expect(result.budgetViolations[0].field).toBe("maxFilesChanged");
      expect(result.verificationState).toBe("not-verified");
    } finally {
      process.chdir(originalCwd);
    }
  });
});