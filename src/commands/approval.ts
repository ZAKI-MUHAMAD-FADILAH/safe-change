import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Capability, OutputFormat } from "../types/index.js";
import { ExitCodes } from "../types/index.js";
import { getRepositoryRoot } from "../git/inspector.js";
import { loadConfig } from "../config/loader.js";
import { isCapability } from "../enforcement/decision.js";
import { enforcementPolicyDigest } from "../enforcement/policy-signature.js";
import {
  createApprovalRequest,
  grantApproval,
  readApprovalRequest,
  appendSignedApprovalGrant,
} from "../enforcement/approvals.js";
import { findIdentity, loadTrustRegistry } from "../identity/registry.js";
import { signApprovalGrant } from "../identity/signer.js";
import {
  verifyApprovalThreshold,
  verifySignedApprovalGrant,
} from "../identity/verifier.js";
import type { ApproverRole, SignedApprovalGrant } from "../identity/types.js";
import { canonicalizeJson } from "../attestation/canonical.js";

export interface ApprovalCommandOptions {
  readonly action: "request" | "grant" | "status" | "sign" | "verify";
  readonly values: readonly string[];
  readonly format: OutputFormat;
}

export async function runApproval(
  options: ApprovalCommandOptions
): Promise<number> {
  const repoRoot = await getRepositoryRoot(process.cwd()).catch(() => null);
  if (!repoRoot) return ExitCodes.NOT_GIT_REPO;
  try {
    const config = await loadConfig(repoRoot);
    const policy = config.enforcementPolicy;
    if (!policy) throw new Error("No enforcementPolicy is configured.");

    if (options.action === "sign") {
      const [requestId, approverIdentity, keyId, privateKeyPath, roleText] =
        options.values;
      if (!requestId || !approverIdentity || !keyId || !privateKeyPath) {
        throw new Error(
          "approval sign requires <requestId> <approverIdentity> <keyId> <privateKeyFile> [role]"
        );
      }

      const request = await readApprovalRequest(repoRoot, requestId);
      if (!request) {
        throw new Error(`Approval request '${requestId}' not found.`);
      }

      if (
        policy.approvals.prohibitSelfApproval &&
        approverIdentity.toLowerCase() === request.requester.toLowerCase()
      ) {
        throw new Error(
          `Self-approval is prohibited: requester '${request.requester}' cannot sign own request.`
        );
      }
      if (Date.parse(request.expiresAt) <= Date.now()) {
        throw new Error("Approval request has expired.");
      }

      const privKeyAbs = resolve(process.cwd(), privateKeyPath);
      const privateKeyPem = await readFile(privKeyAbs, "utf-8");

      const registry = await loadTrustRegistry(repoRoot);
      const identity = findIdentity(registry, keyId);
      if (!identity) {
        throw new Error(`Approver keyId '${keyId}' is not trusted.`);
      }
      if (
        identity.owner.toLowerCase() !== approverIdentity.toLowerCase()
      ) {
        throw new Error("Approver identity does not match the trusted key owner.");
      }
      if (roleText && roleText !== identity.role) {
        throw new Error("Requested approver role does not match the trust registry.");
      }
      const role: ApproverRole = identity.role;
      const policyDigest = enforcementPolicyDigest(policy);
      const previousGrant = request.signedGrants?.at(-1);
      const previousGrantDigest = previousGrant
        ? createHash("sha256")
            .update(canonicalizeJson(previousGrant), "utf8")
            .digest("hex")
        : "";

      const grant = signApprovalGrant({
        requestId: request.id,
        requestDigest: request.requestDigest,
        repositoryIdentity: repoRoot.replace(/\\/g, "/"),
        capability: request.capability,
        resource: request.resource,
        requester: request.requester,
        requesterSession: request.sessionId,
        approverIdentity,
        approverKeyId: keyId,
        approverRole: role,
        policyDigest,
        previousGrantDigest,
        decision: "approved",
        ttlSeconds: Math.max(
          1,
          Math.round((new Date(request.expiresAt).getTime() - Date.now()) / 1000)
        ),
        privateKeyPem,
      });

      await appendSignedApprovalGrant(repoRoot, request.id, grant);
      const outDir = resolve(repoRoot, ".safe-change", "grants");
      await mkdir(outDir, { recursive: true });
      const grantPath = resolve(outDir, `${grant.approvalId}.json`);
      await writeFile(grantPath, JSON.stringify(grant, null, 2), "utf-8");

      if (options.format === "json") {
        process.stdout.write(
          `${JSON.stringify({ signed: true, grantPath, grant }, null, 2)}\n`
        );
      } else {
        process.stdout.write(`Signed approval grant created successfully.\n`);
        process.stdout.write(`Grant ID: ${grant.approvalId}\n`);
        process.stdout.write(`File: ${grantPath}\n`);
      }
      return ExitCodes.OK;
    }

    if (options.action === "verify") {
      const [target] = options.values;
      if (!target) {
        throw new Error("approval verify requires <requestId|grantFile>");
      }

      const registry = await loadTrustRegistry(repoRoot);
      let verification: unknown;
      if (/^[A-Za-z0-9-]{8,80}$/.test(target)) {
        const request = await readApprovalRequest(repoRoot, target);
        const threshold = policy.approvals.thresholds[request.capability] ?? 1;
        verification = verifyApprovalThreshold(
          request.signedGrants ?? [],
          registry,
          threshold,
          {
            expectedRepository: repoRoot.replace(/\\/g, "/"),
            expectedCapability: request.capability,
            expectedResource: request.resource,
            expectedRequestId: request.id,
            expectedRequestDigest: request.requestDigest,
            expectedRequesterSession: request.sessionId,
            expectedPolicyDigest: enforcementPolicyDigest(policy),
            prohibitSelfApproval: policy.approvals.prohibitSelfApproval,
          }
        );
      } else {
        const absPath = resolve(process.cwd(), target);
        const raw = await readFile(absPath, "utf-8");
        const grant = JSON.parse(raw) as SignedApprovalGrant;
        verification = verifySignedApprovalGrant(grant, registry, {
          expectedRepository: repoRoot.replace(/\\/g, "/"),
          expectedPolicyDigest: enforcementPolicyDigest(policy),
          prohibitSelfApproval: policy.approvals.prohibitSelfApproval,
        });
      }
      const valid = (verification as { valid: boolean }).valid;

      if (options.format === "json") {
        process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`);
      } else {
        process.stdout.write(
          `Approval Verification: ${valid ? "VALID" : "INVALID"}\n`
        );
        if (!valid) {
          for (const reason of (verification as { reasons: readonly string[] }).reasons) {
            process.stdout.write(`  - ${reason}\n`);
          }
        }
      }
      return valid ? ExitCodes.OK : ExitCodes.NEW_FAILURE;
    }

    let result;
    if (options.action === "request") {
      const [capability, resource, requester, sessionId, ttlText, ...reason] =
        options.values;
      if (
        !capability ||
        !isCapability(capability) ||
        !resource ||
        !requester ||
        !sessionId ||
        !ttlText
      ) {
        throw new Error(
          "approval request requires capability, resource, requester, sessionId, ttlSeconds, and reason."
        );
      }
      const ttlSeconds = Number(ttlText);
      if (ttlSeconds > policy.approvals.maximumExceptionTtlSeconds) {
        throw new Error(
          `Approval TTL exceeds policy maximum of ${policy.approvals.maximumExceptionTtlSeconds} seconds.`
        );
      }
      result = await createApprovalRequest(repoRoot, {
        capability: capability as Capability,
        resource,
        requester,
        sessionId,
        ttlSeconds,
        reason: reason.join(" ") || "No reason supplied.",
      });
    } else if (options.action === "grant") {
      const [id, approver] = options.values;
      if (!id || !approver) {
        throw new Error("approval grant requires requestId and approver.");
      }
      result = await grantApproval(
        repoRoot,
        id,
        approver,
        policy.approvals.prohibitSelfApproval
      );
    } else {
      const [id] = options.values;
      if (!id) throw new Error("approval status requires requestId.");
      result = await readApprovalRequest(repoRoot, id);
    }

    process.stdout.write(
      options.format === "json"
        ? `${JSON.stringify(result, null, 2)}\n`
        : `Approval request: ${result.id}\nCapability: ${result.capability}\nApprovals: ${result.grants.length}\nExpires: ${result.expiresAt}\n`
    );
    return ExitCodes.OK;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      options.format === "json"
        ? `${JSON.stringify({ error: message, exitCode: ExitCodes.CONFIG_ERROR }, null, 2)}\n`
        : `${message}\n`
    );
    return ExitCodes.CONFIG_ERROR;
  }
}