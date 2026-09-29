import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  buildAttestationStatement,
  createAttestationEnvelope,
  verifyAttestationEnvelope,
} from "../../src/attestation/manager.js";
import type { AttestationPredicate } from "../../src/attestation/types.js";

describe("Cryptographic Attestation (DSSE / Ed25519)", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const mockPredicate: AttestationPredicate = {
    repositoryIdentity: "https://github.com/zackpratamaa/safe-change",
    startingCommit: "ee1190d58a95191a3a9a31ec6cc2774fb502269d",
    endingCommit: "ee1190d58a95191a3a9a31ec6cc2774fb502269d",
    baselineId: "ee1190d58a95191a3a9a31ec6cc2774fb502269d",
    sessionId: "test-attest-session",
    agentProfile: "high-assurance-agent",
    policyVersion: 1,
    policyDigest: "abc123policy",
    safeChangeVersion: "0.4.0",
    environmentFingerprint: "fingerprint-abc",
    semanticDiffReportDigest: "diff-digest-123",
    replayManifestDigest: "replay-digest-123",
    testReportDigest: "test-digest-123",
    coverageReportDigest: "cov-digest-123",
    dependencyAuditDigest: "audit-digest-123",
    evidenceBundleDigest: "evidence-digest-123",
    producedArtifactDigests: {},
    verificationState: "verified",
    timestamp: new Date().toISOString(),
    expiresAt: null,
    signerKeyId: "test-signer-key-id",
  };

  it("creates and successfully verifies valid Ed25519 DSSE attestation", () => {
    const statement = buildAttestationStatement(mockPredicate);
    const envelope = createAttestationEnvelope(
      statement,
      "test-signer-key-id",
      privateKey
    );

    const result = verifyAttestationEnvelope(envelope, publicKey);
    expect(result.valid).toBe(true);
    expect(result.signerKeyId).toBe("test-signer-key-id");
    expect(result.statement.predicate.sessionId).toBe("test-attest-session");
  });

  it("fails closed on single byte payload mutation", () => {
    const statement = buildAttestationStatement(mockPredicate);
    const envelope = createAttestationEnvelope(
      statement,
      "test-signer-key-id",
      privateKey
    );

    // Tamper one byte in base64 payload
    const rawPayload = Buffer.from(envelope.payload, "base64").toString("utf-8");
    const tamperedPayload = rawPayload.replace("test-attest-session", "hack-session");
    const tamperedEnvelope = {
      ...envelope,
      payload: Buffer.from(tamperedPayload, "utf-8").toString("base64"),
    };

    const result = verifyAttestationEnvelope(tamperedEnvelope, publicKey);
    expect(result.valid).toBe(false);
    expect(result.failureReason).toContain("signature verification failed");
  });

  it("fails verification when verified with the wrong public key", () => {
    const otherPair = generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    const statement = buildAttestationStatement(mockPredicate);
    const envelope = createAttestationEnvelope(
      statement,
      "test-signer-key-id",
      privateKey
    );

    const result = verifyAttestationEnvelope(envelope, otherPair.publicKey);
    expect(result.valid).toBe(false);
  });

  it("detects expired attestations and rejects them", () => {
    const expiredPredicate: AttestationPredicate = {
      ...mockPredicate,
      expiresAt: new Date(Date.now() - 10000).toISOString(), // expired 10s ago
    };

    const statement = buildAttestationStatement(expiredPredicate);
    const envelope = createAttestationEnvelope(
      statement,
      "test-signer-key-id",
      privateKey
    );

    const result = verifyAttestationEnvelope(envelope, publicKey);
    expect(result.valid).toBe(false);
    expect(result.failureReason).toContain("Attestation expired");
  });

  it("detects signature stripping and rejects", () => {
    const statement = buildAttestationStatement(mockPredicate);
    const envelope = createAttestationEnvelope(
      statement,
      "test-signer-key-id",
      privateKey
    );

    const strippedEnvelope = {
      ...envelope,
      signatures: [],
    };

    const result = verifyAttestationEnvelope(strippedEnvelope, publicKey);
    expect(result.valid).toBe(false);
  });

  it("detects payload type substitution and rejects", () => {
    const statement = buildAttestationStatement(mockPredicate);
    const envelope = createAttestationEnvelope(
      statement,
      "test-signer-key-id",
      privateKey
    );

    const substitutedEnvelope = {
      ...envelope,
      payloadType: "application/vnd.malicious+json",
    };

    const result = verifyAttestationEnvelope(substitutedEnvelope, publicKey);
    expect(result.valid).toBe(false);
    expect(result.failureReason).toContain("Invalid DSSE payloadType");
  });
});
