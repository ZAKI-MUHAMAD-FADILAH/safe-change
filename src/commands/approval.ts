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
} from "../enforcement/approvals.js";
import { loadTrustRegistry } from "../identity/registry.js";
import { signApprovalGrant } from "../identity/signer.js";
import { verifySignedApprovalGrant } from "../identity/verifier.js";
import type { ApproverRole, SignedApprovalGrant } from "../identity/types.js";

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

      const privKeyAbs = resolve(process.cwd(), privateKeyPath);
      const privateKeyPem = await readFile(privKeyAbs, "utf-8");

      const role: ApproverRole = (roleText as ApproverRole) || "security-lead";
      const policyDigest = enforcementPolicyDigest(policy);

      const grant = signApprovalGrant({
        requestId: request.id,
        requestDigest: request.id,
        repositoryIdentity: repoRoot.replace(/\\/g, "/"),
        capability: request.capability,
        resource: request.resource,
        requester: request.requester,
        requesterSession: request.sessionId,
        approverIdentity,
        approverKeyId: keyId,
        approverRole: role,
        policyDigest,
        decision: "approved",
        ttlSeconds: Math.max(
          1,
          Math.round((new Date(request.expiresAt).getTime() - Date.now()) / 1000)
        ),
        privateKeyPem,
      });

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
      const [grantFilePath] = options.values;
      if (!grantFilePath) {
        throw new Error("approval verify requires <grantFile>");
      }

      const absPath = resolve(process.cwd(), grantFilePath);
      const raw = await readFile(absPath, "utf-8");
      const grant = JSON.parse(raw) as SignedApprovalGrant;

      const registry = await loadTrustRegistry(repoRoot);
      const verification = verifySignedApprovalGrant(grant, registry, {
        expectedRepository: repoRoot.replace(/\\/g, "/"),
        prohibitSelfApproval: policy.approvals.prohibitSelfApproval,
      });

      if (options.format === "json") {
        process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`);
      } else {
        process.stdout.write(
          `Approval Verification: ${verification.valid ? "VALID" : "INVALID"}\n`
        );
        if (!verification.valid) {
          for (const reason of verification.reasons) {
            process.stdout.write(`  - ${reason}\n`);
          }
        }
      }
      return verification.valid ? ExitCodes.OK : ExitCodes.NEW_FAILURE;
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