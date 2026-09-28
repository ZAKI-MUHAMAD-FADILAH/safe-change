import type { OutputFormat } from "../types/index.js";
import { ExitCodes } from "../types/index.js";
import { getRepositoryRoot } from "../git/inspector.js";
import { readAuditEvents, verifyAuditEvents } from "../integrity/audit-log.js";

export async function runAudit(options: {
  readonly format: OutputFormat;
}): Promise<number> {
  const repoRoot = await getRepositoryRoot(process.cwd()).catch(() => null);
  if (!repoRoot) return ExitCodes.NOT_GIT_REPO;
  const events = await readAuditEvents(repoRoot);
  const valid = verifyAuditEvents(events);
  const result = {
    valid,
    eventCount: events.length,
    headDigest: events.at(-1)?.eventDigest ?? null,
  };
  process.stdout.write(
    options.format === "json"
      ? `${JSON.stringify(result, null, 2)}\n`
      : `Audit log: ${valid ? "VALID" : "INVALID"} (${events.length} events)\n`
  );
  return valid ? ExitCodes.OK : ExitCodes.NEW_FAILURE;
}