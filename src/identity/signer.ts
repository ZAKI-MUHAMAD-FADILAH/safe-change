import { randomUUID, sign, createHash } from "node:crypto";
import { canonicalizeJson } from "../attestation/canonical.js";
import type { Capability } from "../types/index.js";
import type { ApproverRole, SignedApprovalGrant } from "./types.js";

export interface CreateApprovalGrantParams {
  readonly requestId: string;
  readonly requestDigest: string;
  readonly repositoryIdentity: string;
  readonly capability: Capability;
  readonly resource: string;
  readonly requester: string;
  readonly requesterSession: string;
  readonly approverIdentity: string;
  readonly approverKeyId: string;
  readonly approverRole: ApproverRole;
  readonly policyDigest: string;
  readonly previousGrantDigest?: string;
  readonly decision: "approved" | "rejected";
  readonly ttlSeconds?: number;
  readonly privateKeyPem: string;
}

export function signApprovalGrant(
  params: CreateApprovalGrantParams
): SignedApprovalGrant {
  const approvalId = randomUUID();
  const nonce = randomUUID();
  const issuedAt = new Date().toISOString();
  const ttlMs = (params.ttlSeconds ?? 3600) * 1000;
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  const grantWithoutSig = {
    schemaVersion: 1 as const,
    approvalId,
    requestId: params.requestId,
    requestDigest: params.requestDigest,
    repositoryIdentity: params.repositoryIdentity,
    capability: params.capability,
    resource: params.resource,
    requester: params.requester,
    requesterSession: params.requesterSession,
    approverIdentity: params.approverIdentity,
    approverKeyId: params.approverKeyId,
    approverRole: params.approverRole,
    policyDigest: params.policyDigest,
    previousGrantDigest: params.previousGrantDigest ?? "",
    nonce,
    issuedAt,
    expiresAt,
    decision: params.decision,
  };

  const canonicalPayload = canonicalizeJson(grantWithoutSig);
  const domainSeparated = Buffer.from(
    `SAFE_CHANGE_APPROVAL_GRANT_V1:${canonicalPayload}`,
    "utf-8"
  );

  const signature = sign(null, domainSeparated, params.privateKeyPem).toString(
    "base64"
  );

  return {
    ...grantWithoutSig,
    signature,
  };
}
