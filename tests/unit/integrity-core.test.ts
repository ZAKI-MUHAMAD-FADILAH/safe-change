import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, type TempRepo } from "../helpers/temp-repo.js";
import { loadConfig } from "../../src/config/loader.js";
import { runSave } from "../../src/commands/save.js";
import { runCheck } from "../../src/commands/check.js";
import { loadBaseline } from "../../src/baseline/manager.js";
import {
  captureWorkspaceFingerprint,
  compareWorkspaceFingerprints,
} from "../../src/integrity/fingerprint.js";
import {
  acquireWriteLease,
  LeaseConflictError,
  readWriteLease,
  releaseWriteLease,
} from "../../src/integrity/lease.js";
import {
  readAuditEvents,
  verifyAuditEvents,
} from "../../src/integrity/audit-log.js";
import { createEvidenceBundle } from "../../src/integrity/evidence.js";
import { ExitCodes } from "../../src/types/index.js";
import { runLease } from "../../src/commands/lease.js";
import { runFingerprint } from "../../src/commands/fingerprint.js";
import { runEvidence } from "../../src/commands/evidence.js";
import { runAudit } from "../../src/commands/audit.js";

describe("Integrity Core", () => {
  let repo: TempRepo;
  let stdout = "";
  let stderr = "";
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;

  beforeEach(async () => {
    repo = await createTempRepo();
    await repo.createConfig([
      {
        name: "test",
        executable: process.execPath,
        args: ["-e", "process.exit(0)"],
        timeout: 5,
      },
    ]);
    stdout = "";
    stderr = "";
    process.stdout.write = ((chunk: string | Buffer) => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Buffer) => {
      stderr += chunk.toString();
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(async () => {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    await repo.cleanup();
  });

  it("binds a new baseline to a workspace fingerprint", async () => {
    const originalCwd = process.cwd();
    process.chdir(repo.path);
    try {
      expect(
        await runSave({ description: "fingerprinted baseline", format: "json" })
      ).toBe(ExitCodes.OK);
      const baseline = await loadBaseline(repo.path);
      expect(baseline?.workspaceFingerprint?.digest).toMatch(
        /^sha256:[a-f0-9]{64}$/
      );
      expect(baseline?.workspaceFingerprint?.git.headCommit).toMatch(
        /^[a-f0-9]{40}$/
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("classifies dependency and configuration drift independently", async () => {
    const config = await loadConfig(repo.path);
    const before = await captureWorkspaceFingerprint(repo.path, config);
    await repo.writeFile("package-lock.json", '{"lockfileVersion":3}\n');
    const dependencyChanged = await captureWorkspaceFingerprint(repo.path, config);
    expect(
      compareWorkspaceFingerprints(before, dependencyChanged).categories
    ).toContain("DEPENDENCY_DRIFT");

    await repo.writeFile(
      ".safe-change.json",
      JSON.stringify({ version: 1, checks: [] })
    );
    const newConfig = await loadConfig(repo.path);
    const configurationChanged = await captureWorkspaceFingerprint(
      repo.path,
      newConfig
    );
    expect(
      compareWorkspaceFingerprints(dependencyChanged, configurationChanged)
        .categories
    ).toContain("CONFIGURATION_DRIFT");
  });

  it("permits one active writer and rejects a competing session", async () => {
    const config = await loadConfig(repo.path);
    const first = await acquireWriteLease(
      repo.path,
      config,
      "session-alpha",
      "cursor"
    );
    expect(first.sessionId).toBe("session-alpha");
    await expect(
      acquireWriteLease(repo.path, config, "session-beta", "codex")
    ).rejects.toBeInstanceOf(LeaseConflictError);
    expect((await readWriteLease(repo.path))?.sessionId).toBe("session-alpha");

    await expect(
      releaseWriteLease(repo.path, "session-beta")
    ).rejects.toBeInstanceOf(LeaseConflictError);
    await releaseWriteLease(repo.path, "session-alpha");
    expect(await readWriteLease(repo.path)).toBeNull();
  });

  it("creates and verifies a tamper-evident audit chain", async () => {
    const config = await loadConfig(repo.path);
    await acquireWriteLease(repo.path, config, "session-audit", "claude-code");
    await releaseWriteLease(repo.path, "session-audit");
    const events = await readAuditEvents(repo.path);
    expect(events.map((event) => event.type)).toEqual([
      "WRITE_LEASE_ACQUIRED",
      "WRITE_LEASE_RELEASED",
    ]);
    expect(verifyAuditEvents(events)).toBe(true);

    const eventPath = join(repo.path, ".safe-change", "events.jsonl");
    const content = await readFile(eventPath, "utf8");
    await writeFile(eventPath, content.replace("WRITE_LEASE_ACQUIRED", "ALTERED"));
    expect(verifyAuditEvents(await readAuditEvents(repo.path))).toBe(false);
  });

  it("creates a checksummed evidence bundle without source contents", async () => {
    const originalCwd = process.cwd();
    process.chdir(repo.path);
    try {
      expect(
        await runSave({ description: "evidence baseline", format: "json" })
      ).toBe(ExitCodes.OK);
      stdout = "";
      expect(await runCheck({ format: "json" })).toBe(ExitCodes.OK);
      await repo.writeFile(
        "src/private.ts",
        "export const sourceMustNotEnterEvidence = true;\n"
      );
      const config = await loadConfig(repo.path);
      const result = await createEvidenceBundle(
        repo.path,
        config,
        "session-evidence",
        "cursor"
      );
      expect(result.manifest.files).toEqual([
        "baseline-summary.json",
        "diff-summary.json",
        "environment-fingerprint.json",
        "verification-report.json",
      ]);
      expect(result.manifest.evidenceDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
      const evidenceFiles = [
        ...result.manifest.files,
        "manifest.json",
        "checksums.txt",
      ];
      for (const file of evidenceFiles) {
        const content = await readFile(join(result.directory, file), "utf8");
        expect(content).not.toContain("sourceMustNotEnterEvidence");
      }
      expect(
        await readFile(join(result.directory, "checksums.txt"), "utf8")
      ).toContain("manifest.json");
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("exposes lease lifecycle through the CLI command contract", async () => {
    const originalCwd = process.cwd();
    process.chdir(repo.path);
    try {
      stdout = "";
      expect(
        await runLease({
          action: "acquire",
          sessionId: "session-command",
          agentName: "codex",
          format: "json",
        })
      ).toBe(ExitCodes.OK);
      expect(JSON.parse(stdout).sessionId).toBe("session-command");

      stdout = "";
      expect(
        await runLease({ action: "status", format: "json" })
      ).toBe(ExitCodes.OK);
      expect(JSON.parse(stdout).active).toBe(true);

      stdout = "";
      expect(
        await runLease({
          action: "release",
          sessionId: "session-command",
          format: "json",
        })
      ).toBe(ExitCodes.OK);
      expect(JSON.parse(stdout).released).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("exposes fingerprint, evidence, and audit verification commands", async () => {
    const originalCwd = process.cwd();
    process.chdir(repo.path);
    try {
      expect(
        await runSave({ description: "command baseline", format: "json" })
      ).toBe(ExitCodes.OK);
      stdout = "";
      expect(await runCheck({ format: "json" })).toBe(ExitCodes.OK);

      stdout = "";
      expect(
        await runFingerprint({ format: "json", compare: true })
      ).toBe(ExitCodes.OK);
      expect(JSON.parse(stdout).detected).toBe(false);

      stdout = "";
      expect(
        await runEvidence({
          sessionId: "session-command-evidence",
          agentProfile: "cursor",
          format: "json",
        })
      ).toBe(ExitCodes.OK);
      expect(JSON.parse(stdout).created).toBe(true);

      stdout = "";
      expect(await runAudit({ format: "json" })).toBe(ExitCodes.OK);
      expect(JSON.parse(stdout).valid).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });
});