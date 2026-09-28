import type { OutputFormat } from "../types/index.js";
import { ExitCodes } from "../types/index.js";
import { getRepositoryRoot } from "../git/inspector.js";
import { loadConfig } from "../config/loader.js";
import {
  acquireWriteLease,
  isLeaseExpired,
  LeaseConflictError,
  readWriteLease,
  releaseWriteLease,
} from "../integrity/lease.js";

export interface LeaseOptions {
  readonly action: "acquire" | "status" | "release";
  readonly sessionId?: string;
  readonly agentName?: string;
  readonly format: OutputFormat;
}

export async function runLease(options: LeaseOptions): Promise<number> {
  const repoRoot = await getRepositoryRoot(process.cwd()).catch(() => null);
  if (!repoRoot) return ExitCodes.NOT_GIT_REPO;
  try {
    if (options.action === "status") {
      const lease = await readWriteLease(repoRoot);
      const result = {
        active: Boolean(lease && !isLeaseExpired(lease)),
        expired: Boolean(lease && isLeaseExpired(lease)),
        lease,
      };
      process.stdout.write(
        options.format === "json"
          ? `${JSON.stringify(result, null, 2)}\n`
          : lease
            ? `Write lease: ${result.active ? "ACTIVE" : "EXPIRED"}\nSession: ${lease.sessionId}\nAgent: ${lease.agentName}\nExpires: ${lease.leaseExpiresAt}\n`
            : "Write lease: NONE\n"
      );
      return ExitCodes.OK;
    }
    if (!options.sessionId) {
      throw new LeaseConflictError(`${options.action} requires a sessionId.`);
    }
    if (options.action === "release") {
      await releaseWriteLease(repoRoot, options.sessionId);
      process.stdout.write(
        options.format === "json"
          ? `${JSON.stringify({ released: true, sessionId: options.sessionId })}\n`
          : `Write lease released for session ${options.sessionId}.\n`
      );
      return ExitCodes.OK;
    }
    const config = await loadConfig(repoRoot);
    const lease = await acquireWriteLease(
      repoRoot,
      config,
      options.sessionId,
      options.agentName ?? "unknown-agent"
    );
    process.stdout.write(
      options.format === "json"
        ? `${JSON.stringify(lease, null, 2)}\n`
        : `Write lease acquired.\nSession: ${lease.sessionId}\nAgent: ${lease.agentName}\nExpires: ${lease.leaseExpiresAt}\n`
    );
    return ExitCodes.OK;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      options.format === "json"
        ? `${JSON.stringify({ error: message, exitCode: ExitCodes.OWNERSHIP_CONFLICT }, null, 2)}\n`
        : `${message}\n`
    );
    return ExitCodes.OWNERSHIP_CONFLICT;
  }
}