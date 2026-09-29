import { describe, it, expect } from "vitest";
import { createReplayManifest } from "../../src/replay/recorder.js";
import { verifyReplayManifest } from "../../src/replay/runner.js";
import type { SafeChangeConfig } from "../../src/types/index.js";

describe("Deterministic Replay Engine", () => {
  const mockConfig: SafeChangeConfig = {
    version: 1,
    checks: [
      {
        name: "dummy-check",
        executable: "node",
        args: ["-e", "console.log('replayed')"],
        timeout: 10,
      },
    ],
  };

  it("verifies identical replay manifest cleanly", async () => {
    const cwd = process.cwd();
    const manifest = await createReplayManifest(
      cwd,
      mockConfig,
      "test-session",
      "test-agent",
      "starting-commit-123",
      mockConfig.checks,
      [
        {
          name: "dummy-check",
          executable: "node",
          args: ["-e", "console.log('replayed')"],
          timeout: 10,
          exitCode: 0,
          passed: true,
          durationMs: 50,
          timedOut: false,
          outputBytes: 10,
          outputTruncated: false,
          stdout: "replayed\n",
          stderr: "",
          outputBlocked: false,
          detectedSecretTypes: [],
        },
      ]
    );

    const report = await verifyReplayManifest(cwd, mockConfig, manifest);
    expect(report.verified).toBe(true);
    expect(report.mismatches).toHaveLength(0);
  });

  it("detects commit drift when ending commit differs", async () => {
    const cwd = process.cwd();
    const manifest = await createReplayManifest(
      cwd,
      mockConfig,
      "test-session",
      "test-agent",
      "starting-commit-123",
      mockConfig.checks,
      []
    );

    const driftedManifest = {
      ...manifest,
      endingCommit: "drifted-commit-999",
    };

    const report = await verifyReplayManifest(cwd, mockConfig, driftedManifest);
    expect(report.verified).toBe(false);
    expect(report.mismatches.some((m) => m.category === "COMMIT_DRIFT")).toBe(
      true
    );
  });

  it("detects dependency lockfile drift", async () => {
    const cwd = process.cwd();
    const manifest = await createReplayManifest(
      cwd,
      mockConfig,
      "test-session",
      "test-agent",
      "starting-commit-123",
      mockConfig.checks,
      []
    );

    const driftedManifest = {
      ...manifest,
      lockfileHashes: {
        "package-lock.json": "tampered-lock-hash",
      },
    };

    const report = await verifyReplayManifest(cwd, mockConfig, driftedManifest);
    expect(report.verified).toBe(false);
    expect(report.mismatches.some((m) => m.category === "DEPENDENCY_DRIFT")).toBe(
      true
    );
  });

  it("detects policy drift when enforcement policy digest changes", async () => {
    const cwd = process.cwd();
    const manifest = await createReplayManifest(
      cwd,
      mockConfig,
      "test-session",
      "test-agent",
      "starting-commit-123",
      mockConfig.checks,
      []
    );

    const driftedManifest = {
      ...manifest,
      policyDigest: "different-policy-digest-abc",
    };

    const report = await verifyReplayManifest(cwd, mockConfig, driftedManifest);
    expect(report.verified).toBe(false);
    expect(report.mismatches.some((m) => m.category === "POLICY_DRIFT")).toBe(
      true
    );
  });

  it("detects environment drift when platform or architecture differs", async () => {
    const cwd = process.cwd();
    const manifest = await createReplayManifest(
      cwd,
      mockConfig,
      "test-session",
      "test-agent",
      "starting-commit-123",
      mockConfig.checks,
      []
    );

    const driftedManifest = {
      ...manifest,
      operatingSystem: "freebsd",
    };

    const report = await verifyReplayManifest(cwd, mockConfig, driftedManifest);
    expect(report.verified).toBe(false);
    expect(report.mismatches.some((m) => m.category === "ENVIRONMENT_DRIFT")).toBe(
      true
    );
  });

  it("detects tampering of manifest digest (NON_DETERMINISTIC_RESULT)", async () => {
    const cwd = process.cwd();
    const manifest = await createReplayManifest(
      cwd,
      mockConfig,
      "test-session",
      "test-agent",
      "starting-commit-123",
      mockConfig.checks,
      []
    );

    const tamperedManifest = {
      ...manifest,
      safeChangeVersion: "9.9.9-compromised",
    };

    const report = await verifyReplayManifest(cwd, mockConfig, tamperedManifest);
    expect(report.verified).toBe(false);
    expect(
      report.mismatches.some((m) => m.category === "NON_DETERMINISTIC_RESULT")
    ).toBe(true);
  });
});
