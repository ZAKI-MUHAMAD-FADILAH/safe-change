export interface DSSESignature {
  readonly keyid: string;
  readonly sig: string; // base64
}

export interface DSSEEnvelope {
  readonly payloadType: string;
  readonly payload: string; // base64
  readonly signatures: readonly DSSESignature[];
}

export interface AttestationSubject {
  readonly name: string;
  readonly digest: Record<string, string>;
}

export interface AttestationPredicate {
  readonly repositoryIdentity: string;
  readonly startingCommit: string;
  readonly endingCommit: string;
  readonly baselineId: string;
  readonly sessionId: string;
  readonly agentProfile: string;
  readonly policyVersion: number;
  readonly policyDigest: string;
  readonly safeChangeVersion: string;
  readonly environmentFingerprint: string;
  readonly semanticDiffReportDigest: string;
  readonly replayManifestDigest: string;
  readonly testReportDigest: string;
  readonly coverageReportDigest: string;
  readonly dependencyAuditDigest: string;
  readonly evidenceBundleDigest: string;
  readonly producedArtifactDigests: Record<string, string>;
  readonly verificationState: "verified" | "failed" | "not-verified";
  readonly timestamp: string;
  readonly expiresAt: string | null;
  readonly signerKeyId: string;
}

export interface AttestationStatement {
  readonly _type: "https://in-toto.io/Statement/v1";
  readonly subject: readonly AttestationSubject[];
  readonly predicateType: "https://safe-change.dev/attestation/v1";
  readonly predicate: AttestationPredicate;
}

export interface AttestationVerificationResult {
  readonly valid: boolean;
  readonly signerKeyId: string;
  readonly verifiedAt: string;
  readonly statement: AttestationStatement;
  readonly failureReason?: string;
}
