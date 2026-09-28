import type { Capability } from "../types/index.js";

export type ApproverRole =
  | "security-lead"
  | "release-manager"
  | "lead-maintainer"
  | "developer";

export interface IdentityPublicKey {
  readonly keyId: string;
  readonly publicKeyPem: string;
  readonly owner: string;
  readonly role: ApproverRole;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly revoked: boolean;
  readonly revokedAt?: string;
  readonly revocationReason?: string;
}

export interface TrustRegistry {
  readonly version: 1;
  readonly identities: readonly IdentityPublicKey[];
}

export interface SignedApprovalGrant {
  readonly schemaVersion: 1;
  readonly approvalId: string;
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
  readonly previousGrantDigest: string;
  readonly nonce: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly decision: "approved" | "rejected";
  readonly signature: string;
}

export interface SignedApprovalVerification {
  readonly valid: boolean;
  readonly reasons: readonly string[];
  readonly grant?: SignedApprovalGrant;
  readonly identity?: IdentityPublicKey;
}
