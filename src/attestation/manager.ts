import { createHash } from "node:crypto";
import { canonicalizeJson } from "./canonical.js";
import { signDSSE, verifyDSSESignature } from "./dsse.js";
import type {
  AttestationPredicate,
  AttestationStatement,
  AttestationVerificationResult,
  DSSEEnvelope,
} from "./types.js";

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function buildAttestationStatement(
  predicate: AttestationPredicate
): AttestationStatement {
  return {
    _type: "https://in-toto.io/Statement/v1",
    subject: [
      {
        name: `git+commit:${predicate.endingCommit}`,
        digest: {
          sha1: predicate.endingCommit,
        },
      },
      {
        name: `evidence:${predicate.sessionId}`,
        digest: {
          sha256: predicate.evidenceBundleDigest,
        },
      },
    ],
    predicateType: "https://safe-change.dev/attestation/v1",
    predicate,
  };
}

export function createAttestationEnvelope(
  statement: AttestationStatement,
  signerKeyId: string,
  privateKeyPem: string
): DSSEEnvelope {
  const canonicalStatement = canonicalizeJson(statement);
  const payloadBytes = Buffer.from(canonicalStatement, "utf-8");
  return signDSSE(
    "application/vnd.in-toto+json",
    payloadBytes,
    signerKeyId,
    privateKeyPem
  );
}

export function verifyAttestationEnvelope(
  envelope: DSSEEnvelope,
  publicKeyPem: string,
  options?: { readonly allowExpired?: boolean }
): AttestationVerificationResult {
  // 1. Verify DSSE envelope payload type
  if (envelope.payloadType !== "application/vnd.in-toto+json") {
    return {
      valid: false,
      signerKeyId: envelope.signatures[0]?.keyid ?? "unknown",
      verifiedAt: new Date().toISOString(),
      statement: null as unknown as AttestationStatement,
      failureReason: `Invalid DSSE payloadType: expected 'application/vnd.in-toto+json', got '${envelope.payloadType}'`,
    };
  }

  // 2. Verify signature
  const validSig = verifyDSSESignature(envelope, publicKeyPem);
  if (!validSig) {
    return {
      valid: false,
      signerKeyId: envelope.signatures[0]?.keyid ?? "unknown",
      verifiedAt: new Date().toISOString(),
      statement: null as unknown as AttestationStatement,
      failureReason: "Ed25519 signature verification failed",
    };
  }

  // 3. Decode and parse statement
  let statement: AttestationStatement;
  try {
    const raw = Buffer.from(envelope.payload, "base64").toString("utf-8");
    statement = JSON.parse(raw) as AttestationStatement;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      signerKeyId: envelope.signatures[0]?.keyid ?? "unknown",
      verifiedAt: new Date().toISOString(),
      statement: null as unknown as AttestationStatement,
      failureReason: `Failed to parse attestation payload JSON: ${msg}`,
    };
  }

  // 4. Validate statement schema
  if (
    statement._type !== "https://in-toto.io/Statement/v1" ||
    statement.predicateType !== "https://safe-change.dev/attestation/v1"
  ) {
    return {
      valid: false,
      signerKeyId: envelope.signatures[0]?.keyid ?? "unknown",
      verifiedAt: new Date().toISOString(),
      statement,
      failureReason: "Statement structure does not conform to in-toto v1 / safe-change v1",
    };
  }

  // 5. Expiration check
  if (statement.predicate.expiresAt && !options?.allowExpired) {
    const expTime = new Date(statement.predicate.expiresAt).getTime();
    if (Date.now() > expTime) {
      return {
        valid: false,
        signerKeyId: envelope.signatures[0]?.keyid ?? "unknown",
        verifiedAt: new Date().toISOString(),
        statement,
        failureReason: `Attestation expired at ${statement.predicate.expiresAt}`,
      };
    }
  }

  return {
    valid: true,
    signerKeyId: envelope.signatures[0]?.keyid ?? "unknown",
    verifiedAt: new Date().toISOString(),
    statement,
  };
}
