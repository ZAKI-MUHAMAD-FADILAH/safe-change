import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { OutputFormat } from "../types/index.js";
import { ExitCodes } from "../types/index.js";
import { getRepositoryRoot, getGitState } from "../git/inspector.js";
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
import {
  assertSafeIdentifier,
  resolveWithinRoot,
} from "../security/path-boundary.js";
import type { EvidenceManifest } from "../types/index.js";
import type { ReplayManifest } from "../replay/types.js";
import type { SemanticDiffReport } from "../semantic/types.js";
import { verifyReplayManifest } from "../replay/runner.js";
import {
  readAuditEvents,
  verifyAuditEvents,
} from "../integrity/audit-log.js";
import { stableDigest } from "../integrity/hash.js";

async function verifyEvidenceChecksums(directory: string): Promise<void> {
  const checksumText = await readFile(resolve(directory, "checksums.txt"), "utf8");
  for (const line of checksumText.trim().split(/\r?\n/)) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/.exec(line);
    if (!match) throw new Error("Evidence checksums.txt is malformed.");
    const [, expected, filename] = match;
    const content = await readFile(
      resolveWithinRoot(directory, filename!, "Evidence component path")
    );
    const actual = createHash("sha256").update(content).digest("hex");
    if (actual !== expected) {
      throw new Error(`Evidence component '${filename}' failed checksum verification.`);
    }
  }
}

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
    if (!options.target) {
      process.stderr.write("Error: 'create' requires a session ID.\n");
      return ExitCodes.CONFIG_ERROR;
    }
    const sessionId = assertSafeIdentifier(
      options.target,
      "Attestation session ID"
    );

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
    if (
      baseline.checks.length === 0 ||
      baseline.checks.some(
        (check) => !check.passed || check.timedOut || check.outputBlocked
      )
    ) {
      process.stderr.write(
        "BLOCKED: Attestation requires a fully passing verified baseline.\n"
      );
      return ExitCodes.NEW_FAILURE;
    }

    const gitState = await getGitState(repoRoot);
    if (
      !gitState.isClean ||
      !gitState.headCommit ||
      gitState.headCommit !== baseline.git.headCommit
    ) {
      process.stderr.write(
        "BLOCKED: Attestation requires a clean workspace at the exact baseline commit.\n"
      );
      return ExitCodes.NEW_FAILURE;
    }

    const evidenceDirectory = resolve(
      repoRoot,
      ".safe-change",
      "evidence",
      sessionId
    );
    await verifyEvidenceChecksums(evidenceDirectory);
    const evidenceManifest = JSON.parse(
      await readFile(resolve(evidenceDirectory, "manifest.json"), "utf8")
    ) as EvidenceManifest;
    if (
      evidenceManifest.sessionId !== sessionId ||
      evidenceManifest.verificationState !== "verified"
    ) {
      process.stderr.write(
        "BLOCKED: Evidence bundle is missing or is not VERIFIED.\n"
      );
      return ExitCodes.NEW_FAILURE;
    }

    const replayPath = resolve(
      repoRoot,
      ".safe-change",
      "replay",
      `${sessionId}-replay.json`
    );
    const replayManifest = JSON.parse(
      await readFile(replayPath, "utf8")
    ) as ReplayManifest;
    const replayVerification = await verifyReplayManifest(
      repoRoot,
      config,
      replayManifest
    );
    if (!replayVerification.verified) {
      process.stderr.write(
        "BLOCKED: Replay manifest failed integrity or drift verification.\n"
      );
      return ExitCodes.NEW_FAILURE;
    }

    const semanticReportRaw = await readFile(
      resolve(repoRoot, ".safe-change", "semantic", "last-report.json"),
      "utf8"
    );
    const semanticReport = JSON.parse(
      semanticReportRaw
    ) as SemanticDiffReport;
    if (semanticReport.summary.hasBlockingFindings) {
      process.stderr.write(
        "BLOCKED: Semantic diff contains critical findings.\n"
      );
      return ExitCodes.NEW_FAILURE;
    }

    const auditEvents = await readAuditEvents(repoRoot);
    if (!verifyAuditEvents(auditEvents)) {
      process.stderr.write("BLOCKED: Audit log integrity verification failed.\n");
      return ExitCodes.NEW_FAILURE;
    }

    const keyId = options.keyId ?? "organization-attestation-key";
    const fingerprint = await captureWorkspaceFingerprint(repoRoot, config);

    const commit = gitState.headCommit;
    const packageJson = JSON.parse(
      await readFile(resolve(repoRoot, "package.json"), "utf8")
    ) as { version?: string };
    const testCheck = baseline.checks.find((check) => check.name === "test");
    const coverageCheck = baseline.checks.find(
      (check) => check.name === "coverage"
    );
    const auditCheck = baseline.checks.find(
      (check) => check.name === "dependency-audit"
    );
    const predicate: AttestationPredicate = {
      repositoryIdentity: evidenceManifest.repositoryHash,
      startingCommit: commit,
      endingCommit: commit,
      baselineId: commit,
      sessionId,
      agentProfile: "automated-verifier",
      policyVersion: config.enforcementPolicy?.policyVersion ?? 1,
      policyDigest: config.enforcementPolicy
        ? enforcementPolicyDigest(config.enforcementPolicy)
        : "",
      safeChangeVersion: packageJson.version ?? "unknown",
      environmentFingerprint: fingerprint.digest,
      semanticDiffReportDigest: semanticReport.reportDigest,
      replayManifestDigest: replayManifest.manifestDigest,
      testReportDigest: stableDigest(testCheck ?? null),
      coverageReportDigest: stableDigest(coverageCheck ?? null),
      dependencyAuditDigest: stableDigest(auditCheck ?? null),
      auditLogDigest: stableDigest(
        auditEvents.map((event) => event.eventDigest)
      ),
      evidenceBundleDigest: evidenceManifest.evidenceDigest,
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
    const outPath = resolveWithinRoot(
      outDir,
      `${sessionId}.attestation.json`,
      "Attestation output path"
    );
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
