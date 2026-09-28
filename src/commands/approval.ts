import type { Capability, OutputFormat } from "../types/index.js";
import { ExitCodes } from "../types/index.js";
import { getRepositoryRoot } from "../git/inspector.js";
import { loadConfig } from "../config/loader.js";
import { isCapability } from "../enforcement/decision.js";
import {
  createApprovalRequest,
  grantApproval,
  readApprovalRequest,
} from "../enforcement/approvals.js";

export interface ApprovalCommandOptions {
  readonly action: "request" | "grant" | "status";
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