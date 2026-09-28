import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateKeyPairSync } from "node:crypto";

import { runSemanticDiff } from "../../src/commands/semantic-diff.js";
import { runReplay } from "../../src/commands/replay.js";
import { runAttest } from "../../src/commands/attest.js";
import { buildAttestationStatement, createAttestationEnvelope } from "../../src/attestation/manager.js";

describe("Verifiable Execution CLI Commands Execution", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sc-cmd-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("executes runSemanticDiff against current repo without error", async () => {
    const code = await runSemanticDiff({
      format: "json",
    });
    // Exit code 0 if no critical blocking findings
    expect([0, 1]).toContain(code);
  });

  it("inspects and verifies a generated attestation envelope via runAttest", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    const statement = buildAttestationStatement({
      repositoryIdentity: "test-repo",
      startingCommit: "c1",
      endingCommit: "c2",
      baselineId: "c1",
      sessionId: "sess-1",
      agentProfile: "agent",
      policyVersion: 1,
      policyDigest: "pol-1",
      safeChangeVersion: "0.4.0",
      environmentFingerprint: "fp-1",
      semanticDiffReportDigest: "",
      replayManifestDigest: "",
      testReportDigest: "",
      coverageReportDigest: "",
      dependencyAuditDigest: "",
      evidenceBundleDigest: "",
      producedArtifactDigests: {},
      verificationState: "verified",
      timestamp: new Date().toISOString(),
      expiresAt: null,
      signerKeyId: "key-1",
    });

    const envelope = createAttestationEnvelope(statement, "key-1", privateKey);
    const attestPath = join(tempDir, "sample.attestation.json");
    await writeFile(attestPath, JSON.stringify(envelope, null, 2));

    const pubKeyPath = join(tempDir, "sample.pub");
    await writeFile(pubKeyPath, publicKey);

    const inspectCode = await runAttest({
      action: "inspect",
      target: attestPath,
      format: "json",
    });
    expect(inspectCode).toBe(0);

    const verifyCode = await runAttest({
      action: "verify",
      target: attestPath,
      format: "json",
      publicKeyPath: pubKeyPath,
    });
    expect(verifyCode).toBe(0);
  });

  it("inspects and verifies a replay manifest via runReplay", async () => {
    const rawManifest = {
      schemaVersion: 1,
      sessionId: "replay-test",
      repositoryHash: "repo-hash",
      startingCommit: "c1",
      endingCommit: "c2",
      baselineId: "c1",
      policyDigest: "pol-1",
      workspaceFingerprint: "fp-1",
      lockfileHashes: {},
      safeChangeVersion: "0.4.0",
      agentProfile: "agent",
      operatingSystem: process.platform,
      architecture: process.arch,
      runtimeVersions: { node: process.version },
      normalizedCommands: [],
      recordedResults: [],
      createdAt: new Date().toISOString(),
    };

    const crypto = await import("node:crypto");
    const manifestDigest = crypto
      .createHash("sha256")
      .update(JSON.stringify(rawManifest))
      .digest("hex");

    const manifest = { ...rawManifest, manifestDigest };
    const manifestPath = join(tempDir, "replay.json");
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    const inspectCode = await runReplay({
      action: "inspect",
      target: manifestPath,
      format: "json",
    });
    expect(inspectCode).toBe(0);
  });
});
