import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { signApprovalGrant } from "../../src/identity/signer.js";
import {
  verifySignedApprovalGrant,
  verifyApprovalThreshold,
} from "../../src/identity/verifier.js";
import type {
  IdentityPublicKey,
  TrustRegistry,
} from "../../src/identity/types.js";

describe("Approval Identity Signing & Trust Verification", () => {
  const approver1 = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const approver2 = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const identity1: IdentityPublicKey = {
    keyId: "key-alice",
    publicKeyPem: approver1.publicKey,
    owner: "alice",
    role: "security-lead",
    validFrom: new Date(Date.now() - 3600000).toISOString(),
    validUntil: new Date(Date.now() + 36000000).toISOString(),
    revoked: false,
  };

  const identity2: IdentityPublicKey = {
    keyId: "key-bob",
    publicKeyPem: approver2.publicKey,
    owner: "bob",
    role: "release-manager",
    validFrom: new Date(Date.now() - 3600000).toISOString(),
    validUntil: new Date(Date.now() + 36000000).toISOString(),
    revoked: false,
  };

  const registry: TrustRegistry = {
    version: 1,
    identities: [identity1, identity2],
  };

  const baseParams = {
    requestId: "req-12345",
    requestDigest: "digest-12345",
    repositoryIdentity: "https://github.com/zackpratamaa/safe-change",
    capability: "release:publish" as const,
    resource: "production-release",
    requester: "charlie",
    requesterSession: "session-abc",
    approverIdentity: "alice",
    approverKeyId: "key-alice",
    approverRole: "security-lead" as const,
    policyDigest: "pol-123",
    decision: "approved" as const,
    ttlSeconds: 3600,
    privateKeyPem: approver1.privateKey,
  };

  it("verifies a valid signed approval grant successfully", () => {
    const grant = signApprovalGrant(baseParams);
    const result = verifySignedApprovalGrant(grant, registry, {
      expectedRepository: "https://github.com/zackpratamaa/safe-change",
      expectedCapability: "release:publish",
      expectedResource: "production-release",
      prohibitSelfApproval: true,
    });

    expect(result.valid).toBe(true);
    expect(result.reasons).toHaveLength(0);
    expect(result.grant?.approvalId).toBeDefined();
  });

  it("rejects self-approval when requester matches approver identity", () => {
    const grant = signApprovalGrant({
      ...baseParams,
      requester: "alice", // self-approval
    });

    const result = verifySignedApprovalGrant(grant, registry, {
      prohibitSelfApproval: true,
    });

    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes("Self-approval is prohibited"))).toBe(
      true
    );
  });

  it("rejects unknown signer not in trust registry", () => {
    const grant = signApprovalGrant({
      ...baseParams,
      approverKeyId: "unknown-key-999",
    });

    const result = verifySignedApprovalGrant(grant, registry);
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes("not found in the trust registry"))).toBe(
      true
    );
  });

  it("rejects revoked approver keys", () => {
    const revokedRegistry: TrustRegistry = {
      version: 1,
      identities: [
        {
          ...identity1,
          revoked: true,
          revokedAt: new Date().toISOString(),
          revocationReason: "Key compromised",
        },
      ],
    };

    const grant = signApprovalGrant(baseParams);
    const result = verifySignedApprovalGrant(grant, revokedRegistry);

    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes("revoked"))).toBe(true);
  });

  it("rejects approval grant with wrong repository identity", () => {
    const grant = signApprovalGrant(baseParams);
    const result = verifySignedApprovalGrant(grant, registry, {
      expectedRepository: "https://github.com/different/repo",
    });

    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes("Repository identity mismatch"))).toBe(
      true
    );
  });

  it("rejects approval grant with wrong capability", () => {
    const grant = signApprovalGrant(baseParams);
    const result = verifySignedApprovalGrant(grant, registry, {
      expectedCapability: "secret:read",
    });

    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes("Capability mismatch"))).toBe(
      true
    );
  });

  it("rejects tampered grant payload (invalid signature)", () => {
    const grant = signApprovalGrant(baseParams);
    const tamperedGrant = {
      ...grant,
      resource: "different-resource-unauthorized",
    };

    const result = verifySignedApprovalGrant(tamperedGrant, registry);
    expect(result.valid).toBe(false);
    expect(
      result.reasons.some((r) => r.includes("signature verification failed"))
    ).toBe(true);
  });

  it("enforces multi-approver threshold with distinct keys", () => {
    const grant1 = signApprovalGrant(baseParams);
    const grant2 = signApprovalGrant({
      ...baseParams,
      approverIdentity: "bob",
      approverKeyId: "key-bob",
      approverRole: "release-manager",
      privateKeyPem: approver2.privateKey,
    });

    const thresholdResult = verifyApprovalThreshold(
      [grant1, grant2],
      registry,
      2
    );

    expect(thresholdResult.valid).toBe(true);
    expect(thresholdResult.distinctApproverCount).toBe(2);
  });

  it("counts duplicate signatures from the same key only once towards threshold", () => {
    const grant1 = signApprovalGrant(baseParams);
    const grant1Duplicate = signApprovalGrant(baseParams);

    const thresholdResult = verifyApprovalThreshold(
      [grant1, grant1Duplicate],
      registry,
      2 // required 2 distinct approvers
    );

    expect(thresholdResult.valid).toBe(false);
    expect(thresholdResult.distinctApproverCount).toBe(1);
    expect(
      thresholdResult.reasons.some((r) => r.includes("Insufficient approved signatures"))
    ).toBe(true);
  });
});
