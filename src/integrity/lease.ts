import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SafeChangeConfig, WriteLease } from "../types/index.js";
import { loadBaseline } from "../baseline/manager.js";
import { getGitState } from "../git/inspector.js";
import { captureWorkspaceFingerprint } from "./fingerprint.js";
import { appendAuditEvent } from "./audit-log.js";

const STATE_DIR = ".safe-change";
const LEASE_FILE = "write-lease.json";
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;

export class LeaseConflictError extends Error {
  constructor(
    message: string,
    public readonly existingLease: WriteLease | null = null
  ) {
    super(message);
    this.name = "LeaseConflictError";
  }
}

function validateSessionId(sessionId: string): void {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new LeaseConflictError(
      "sessionId must contain 3-128 letters, numbers, dots, underscores, or hyphens."
    );
  }
}

function leasePath(repoRoot: string): string {
  return join(repoRoot, STATE_DIR, LEASE_FILE);
}

export async function readWriteLease(
  repoRoot: string
): Promise<WriteLease | null> {
  try {
    const parsed = JSON.parse(await readFile(leasePath(repoRoot), "utf8")) as WriteLease;
    if (
      parsed.schemaVersion !== 1 ||
      typeof parsed.sessionId !== "string" ||
      typeof parsed.leaseExpiresAt !== "string"
    ) {
      throw new LeaseConflictError("Write lease file is malformed.");
    }
    return parsed;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if (error instanceof LeaseConflictError) throw error;
    throw new LeaseConflictError(`Failed to read write lease: ${String(error)}`);
  }
}

export function isLeaseExpired(
  lease: WriteLease,
  now = Date.now()
): boolean {
  const expiresAt = Date.parse(lease.leaseExpiresAt);
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}

export async function acquireWriteLease(
  repoRoot: string,
  config: SafeChangeConfig,
  sessionId: string,
  agentName: string,
  ttlSeconds = 900
): Promise<WriteLease> {
  validateSessionId(sessionId);
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 30 || ttlSeconds > 3600) {
    throw new LeaseConflictError("Lease TTL must be an integer from 30 to 3600 seconds.");
  }
  const stateDir = join(repoRoot, STATE_DIR);
  await mkdir(stateDir, { recursive: true });
  const existing = await readWriteLease(repoRoot);
  if (existing && !isLeaseExpired(existing) && existing.sessionId !== sessionId) {
    throw new LeaseConflictError(
      `Repository already has an active write lease owned by session "${existing.sessionId}".`,
      existing
    );
  }
  if (existing && (isLeaseExpired(existing) || existing.sessionId === sessionId)) {
    await unlink(leasePath(repoRoot)).catch(() => undefined);
  }

  const [git, fingerprint, baseline] = await Promise.all([
    getGitState(repoRoot),
    captureWorkspaceFingerprint(repoRoot, config, agentName),
    loadBaseline(repoRoot),
  ]);
  const startedAt = new Date();
  const lease: WriteLease = {
    schemaVersion: 1,
    sessionId,
    agentName,
    baselineId: baseline?.git.headCommit ?? null,
    startingHead: git.headCommit,
    workspaceFingerprint: fingerprint.digest,
    leaseStartedAt: startedAt.toISOString(),
    leaseExpiresAt: new Date(startedAt.getTime() + ttlSeconds * 1000).toISOString(),
    processId: process.pid,
  };

  let handle;
  try {
    handle = await open(leasePath(repoRoot), "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(lease, null, 2)}\n`, "utf8");
  } catch (error: unknown) {
    throw new LeaseConflictError(
      `Failed to acquire write lease atomically: ${String(error)}`,
      await readWriteLease(repoRoot)
    );
  } finally {
    await handle?.close();
  }
  await appendAuditEvent(repoRoot, "WRITE_LEASE_ACQUIRED", sessionId, lease);
  return lease;
}

export async function releaseWriteLease(
  repoRoot: string,
  sessionId: string
): Promise<void> {
  validateSessionId(sessionId);
  const lease = await readWriteLease(repoRoot);
  if (!lease) return;
  if (lease.sessionId !== sessionId) {
    throw new LeaseConflictError(
      `Session "${sessionId}" cannot release lease owned by "${lease.sessionId}".`,
      lease
    );
  }
  await unlink(leasePath(repoRoot));
  await appendAuditEvent(repoRoot, "WRITE_LEASE_RELEASED", sessionId, {
    previousLeaseDigest: lease.workspaceFingerprint,
  });
}