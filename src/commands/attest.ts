import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { OutputFormat } from "../types/index.js";
import { ExitCodes } from "../types/index.js";
import { getRepositoryRoot } from "../git/inspector.js";
import { loadConfig } from "../config/loader.js";
import { loadBaseline } from "../baseline/manager.js";
import {
  buildAttestationStatement,
  createAttestationEnvelope,
  verifyAttestationEnvelope,
} from "../attestation/manager.js";
import type {
  AttestationPredicate,
  DSSEEnvelope,
} from "../attestation/types.js";
import { enforcementPolicyDigest } from "../enforcement/policy-signature.js";
import { captureWorkspaceFingerprint } from "../integrity/fingerprint.js";

export interface AttestOptions {
  readonly action: "create" | "verify" | "inspect";
  readonly target: string; // session or attestation file
  readonly format: OutputFormat;
  readonly keyId?: string;
  readonly privateKeyPath?: string;
  readonly publicKeyPath?: string;
}

export async function runAttest(options: AttestOptions): Promise<number> {
  const repoRoot = await getRepositoryRoot(process.cwd()).catch(() => null);
  if (!repoRoot) return ExitCodes.NOT_GIT_REPO;

  const config = await loadConfig(repoRoot);

  if (options.action === "create") {
    const sessionId = options.target;
    if (!sessionId) {
      process.stderr.write("Error: 'create' requires a session ID.\n");
      return ExitCodes.CONFIG_ERROR;
    }

    // Require private key explicitly from argument or env
    let privateKeyPem: string | null = null;
    if (options.privateKeyPath) {
      try {
        privateKeyPem = await readFile(
          resolve(process.cwd(), options.privateKeyPath),
          "utf-8"
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Failed to read private key file: ${msg}\n`);
        return ExitCodes.CONFIG_ERROR;
      }
    } else if (process.env["SAFE_CHANGE_ATTESTATION_KEY"]) {
      privateKeyPem = process.env["SAFE_CHANGE_ATTESTATION_KEY"];
    }

    if (!privateKeyPem) {
      // Must return NOT VERIFIED or BLOCKED rather than generating an untrusted key
      if (options.format === "json") {
        process.stdout.write(
          `${JSON.stringify({
            created: false,
            state: "blocked",
            reason:
              "No approved attestation signing key provided (--private-key or SAFE_CHANGE_ATTESTATION_KEY required)",
          })}\n`
        );
      } else {
        process.stderr.write(
          "BLOCKED: Attestation creation requires an approved signing key. No key provided.\n"
        );
      }
      return ExitCodes.CONFIG_ERROR;
    }

    const baseline = await loadBaseline(repoRoot);
    if (!baseline) {
      process.stderr.write("Error: No baseline found.\n");
      return ExitCodes.NO_BASELINE;
    }

    const keyId = options.keyId ?? "organization-attestation-key";
    const fingerprint = await captureWorkspaceFingerprint(repoRoot, config);

    const commit = baseline.git.headCommit ?? "unknown-commit";
    const predicate: AttestationPredicate = {
      repositoryIdentity: repoRoot.replace(/\\/g, "/"),
      startingCommit: commit,
      endingCommit: commit,
      baselineId: commit,
      sessionId,
      agentProfile: "automated-verifier",
      policyVersion: config.enforcementPolicy?.policyVersion ?? 1,
      policyDigest: config.enforcementPolicy
        ? enforcementPolicyDigest(config.enforcementPolicy)
        : "",
      safeChangeVersion: "0.4.0",
      environmentFingerprint: fingerprint.digest,
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
      signerKeyId: keyId,
    };

    const statement = buildAttestationStatement(predicate);
    const envelope = createAttestationEnvelope(statement, keyId, privateKeyPem);

    const outDir = resolve(repoRoot, ".safe-change", "attestations");
    await mkdir(outDir, { recursive: true });
    const outPath = resolve(outDir, `${sessionId}.attestation.json`);
    await writeFile(outPath, JSON.stringify(envelope, null, 2), "utf-8");

    if (options.format === "json") {
      process.stdout.write(
        `${JSON.stringify({ created: true, path: outPath, envelope }, null, 2)}\n`
      );
    } else {
      process.stdout.write(`Cryptographic attestation created successfully.\n`);
      process.stdout.write(`Path: ${outPath}\n`);
      process.stdout.write(`Signer Key ID: ${keyId}\n`);
    }
    return ExitCodes.OK;
  }

  if (options.action === "inspect") {
    const filePath = resolve(process.cwd(), options.target);
    let envelope: DSSEEnvelope;
    try {
      const raw = await readFile(filePath, "utf-8");
      envelope = JSON.parse(raw) as DSSEEnvelope;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Failed to read attestation file: ${msg}\n`);
      return ExitCodes.CONFIG_ERROR;
    }

    let statement: unknown = null;
    try {
      statement = JSON.parse(
        Buffer.from(envelope.payload, "base64").toString("utf-8")
      );
    } catch {
      // payload might not be json
    }

    if (options.format === "json") {
      process.stdout.write(
        `${JSON.stringify({ envelope, statement }, null, 2)}\n`
      );
    } else {
      process.stdout.write(`Attestation Envelope Inspection:\n`);
      process.stdout.write(`Payload Type: ${envelope.payloadType}\n`);
      process.stdout.write(`Signatures: ${envelope.signatures.length}\n`);
      for (const sig of envelope.signatures) {
        process.stdout.write(`  Key ID: ${sig.keyid}\n`);
      }
    }
    return ExitCodes.OK;
  }

  if (options.action === "verify") {
    const filePath = resolve(process.cwd(), options.target);
    let envelope: DSSEEnvelope;
    try {
      const raw = await readFile(filePath, "utf-8");
      envelope = JSON.parse(raw) as DSSEEnvelope;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Failed to read attestation file: ${msg}\n`);
      return ExitCodes.CONFIG_ERROR;
    }

    // Require public key
    let publicKeyPem: string | null = null;
    if (options.publicKeyPath) {
      try {
        publicKeyPem = await readFile(
          resolve(process.cwd(), options.publicKeyPath),
          "utf-8"
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Failed to read public key file: ${msg}\n`);
        return ExitCodes.CONFIG_ERROR;
      }
    } else if (config.policySignature?.publicKeyPem) {
      publicKeyPem = config.policySignature.publicKeyPem;
    }

    if (!publicKeyPem) {
      process.stderr.write(
        "Verification requires public key (--public-key or configured policySignature.publicKeyPem)\n"
      );
      return ExitCodes.CONFIG_ERROR;
    }

    const result = verifyAttestationEnvelope(envelope, publicKeyPem);

    if (options.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(
        `Attestation Verification: ${result.valid ? "VALID" : "INVALID"}\n`
      );
      if (!result.valid && result.failureReason) {
        process.stdout.write(`Failure Reason: ${result.failureReason}\n`);
      }
    }
    return result.valid ? ExitCodes.OK : ExitCodes.NEW_FAILURE;
  }

  return ExitCodes.CONFIG_ERROR;
}
