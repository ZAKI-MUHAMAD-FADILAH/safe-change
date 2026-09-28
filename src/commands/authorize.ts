import type { OutputFormat } from "../types/index.js";
import { ExitCodes } from "../types/index.js";
import { getRepositoryRoot } from "../git/inspector.js";
import { loadConfig } from "../config/loader.js";
import { evaluateOperation, isCapability } from "../enforcement/decision.js";
import { appendAuditEvent } from "../integrity/audit-log.js";

export async function runAuthorize(options: {
  readonly capability?: string;
  readonly resource?: string;
  readonly agentName?: string;
  readonly sessionId?: string;
  readonly approvalRequestId?: string;
  readonly format: OutputFormat;
}): Promise<number> {
  if (
    !options.capability ||
    !isCapability(options.capability) ||
    !options.resource ||
    !options.agentName ||
    !options.sessionId
  ) {
    process.stderr.write(
      "authorize requires a valid capability, resource, agentName, and sessionId.\n"
    );
    return ExitCodes.CONFIG_ERROR;
  }
  const repoRoot = await getRepositoryRoot(process.cwd()).catch(() => null);
  if (!repoRoot) return ExitCodes.NOT_GIT_REPO;
  const config = await loadConfig(repoRoot);
  if (!config.enforcementPolicy) {
    process.stderr.write("No enforcementPolicy is configured.\n");
    return ExitCodes.CONFIG_ERROR;
  }
  const decision = await evaluateOperation(
    repoRoot,
    config.enforcementPolicy,
    config.policySignature,
    {
      sessionId: options.sessionId,
      agentName: options.agentName,
      capability: options.capability,
      resource: options.resource,
      approvalRequestId: options.approvalRequestId,
    }
  );
  await appendAuditEvent(
    repoRoot,
    "POLICY_DECISION",
    options.sessionId,
    decision
  );
  process.stdout.write(
    options.format === "json"
      ? `${JSON.stringify(decision, null, 2)}\n`
      : `Policy decision: ${decision.decision.toUpperCase()}\n${decision.reasons.join(
          "\n"
        )}\n`
  );
  return decision.decision === "allow"
    ? ExitCodes.OK
    : ExitCodes.OWNERSHIP_CONFLICT;
}