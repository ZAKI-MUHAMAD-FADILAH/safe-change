import { sign, verify } from "node:crypto";
import type { DSSEEnvelope, DSSESignature } from "./types.js";

/**
 * Implements Dead Simple Signing Envelope (DSSE) Pre-Authentication Encoding (PAE)
 * PAE(type, body) = "DSSEv1" + " " + len(type) + " " + type + " " + len(body) + " " + body
 */
export function createPAE(payloadType: string, payloadBytes: Buffer): Buffer {
  const typeBytes = Buffer.from(payloadType, "utf-8");
  const prefix = Buffer.from(
    `DSSEv1 ${typeBytes.length} ${payloadType} ${payloadBytes.length} `,
    "utf-8"
  );
  return Buffer.concat([prefix, payloadBytes]);
}

/**
 * Sign payload using Ed25519 and produce DSSE envelope
 */
export function signDSSE(
  payloadType: string,
  payloadBytes: Buffer,
  keyId: string,
  privateKeyPem: string
): DSSEEnvelope {
  const pae = createPAE(payloadType, payloadBytes);
  const signature = sign(null, pae, privateKeyPem);

  const sigEntry: DSSESignature = {
    keyid: keyId,
    sig: signature.toString("base64"),
  };

  return {
    payloadType,
    payload: payloadBytes.toString("base64"),
    signatures: [sigEntry],
  };
}

/**
 * Verify DSSE envelope against an Ed25519 public key
 */
export function verifyDSSESignature(
  envelope: DSSEEnvelope,
  publicKeyPem: string
): boolean {
  if (!envelope.signatures || envelope.signatures.length === 0) {
    return false;
  }

  const payloadBytes = Buffer.from(envelope.payload, "base64");
  const pae = createPAE(envelope.payloadType, payloadBytes);

  for (const s of envelope.signatures) {
    try {
      const sigBytes = Buffer.from(s.sig, "base64");
      const ok = verify(null, pae, publicKeyPem, sigBytes);
      if (ok) return true;
    } catch {
      // continue checking other signatures if present
    }
  }

  return false;
}
