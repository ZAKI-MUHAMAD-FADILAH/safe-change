import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  Baseline,
  CheckReport,
  EvidenceManifest,
  SafeChangeConfig,
  VerificationState,
  WorkspaceFingerprint,
} from "../types/index.js";
import { loadBaseline } from "../baseline/manager.js";
import { compareFiles } from "../comparator/engine.js";
import { getDiffText, getFileEntries } from "../git/inspector.js";
import { captureWorkspaceFingerprint } from "./fingerprint.js";
import { appendAuditEvent } from "./audit-log.js";
import { sha256, stableDigest } from "./hash.js";

const STATE_DIR = ".safe-change";
const REPORT_FILE = "last-verification-summary.json";
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;

export interface VerificationSummary {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly state: VerificationState;
  readonly reason: string;
  readonly exitCode: number;
  readonly checks: readonly {
    readonly name: string;
    readonly result: string;
    readonly exitCode: number | null;
    readonly timedOut: boolean;
    readonly outputBlocked: boolean;
    readonly detectedSecretTypes: readonly string[];
  }[];
  readonly workspaceDrift: CheckReport["workspaceDrift"];
}

function validateSessionId(sessionId: string): void {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error(
      "sessionId must contain 3-128 letters, numbers, dots, underscores, or hyphens."
    );
  }
}

export async function persistVerificationSummary(
  repoRoot: string,
  report: CheckReport
): Promise<VerificationSummary> {
  const summary: VerificationSummary = {
    schemaVersion: 1,
    generatedAt: report.generatedAt,
    state: report.verification?.state ?? "not-verified",
    reason: report.verification?.reason ?? "Verification state unavailable.",
    exitCode: report.exitCode,
    checks: report.results.map((result) => ({
      name: result.name,
      result: result.result,
      exitCode: result.exitCode ?? null,
      timedOut: result.timedOut,
      outputBlocked: Boolean(result.outputBlocked),
      detectedSecretTypes: result.detectedSecretTypes ?? [],
    })),
    workspaceDrift: report.workspaceDrift,
  };
  const stateDir = join(repoRoot, STATE_DIR);
  await mkdir(stateDir, { recursive: true });
  await writeFile(
    join(stateDir, REPORT_FILE),
    `${JSON.stringify(summary, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 }
  );
  return summary;
}

async function readVerificationSummary(
  repoRoot: string
): Promise<VerificationSummary | null> {
  try {
    return JSON.parse(
      await readFile(join(repoRoot, STATE_DIR, REPORT_FILE), "utf8")
    ) as VerificationSummary;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function baselineSummary(baseline: Baseline): object {
  return {
    schemaVersion: baseline.schemaVersion,
    createdAt: baseline.createdAt,
    description: baseline.description,
    headCommit: baseline.git.headCommit,
    headBranch: baseline.git.headBranch,
    checksConfigHash: baseline.checksConfigHash,
    configuredChecks: baseline.checks.map((check) => ({
      name: check.name,
      passed: check.passed,
      timedOut: check.timedOut,
      outputBlocked: Boolean(check.outputBlocked),
    })),
    trackedFileCount: Object.keys(baseline.files).length,
    workspaceFingerprint: baseline.workspaceFingerprint?.digest ?? null,
  };
}

async function writeJson(
  directory: string,
  filename: string,
  value: unknown
): Promise<{ filename: string; digest: string }> {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(join(directory, filename), content, {
    encoding: "utf8",
    mode: 0o600,
  });
  return { filename, digest: sha256(content) };
}

export async function createEvidenceBundle(
  repoRoot: string,
  config: SafeChangeConfig,
  sessionId: string,
  agentProfile: string | null = null
): Promise<{ directory: string; manifest: EvidenceManifest }> {
  validateSessionId(sessionId);
  const baseline = await loadBaseline(repoRoot);
  if (!baseline) throw new Error("Cannot create evidence without a baseline.");
  const [currentFiles, diff, fingerprint, verification] = await Promise.all([
    getFileEntries(repoRoot),
    getDiffText(repoRoot),
    captureWorkspaceFingerprint(repoRoot, config, agentProfile),
    readVerificationSummary(repoRoot),
  ]);
  const changes = compareFiles(baseline.files, currentFiles);
  const directory = join(repoRoot, STATE_DIR, "evidence", sessionId);
  await mkdir(directory, { recursive: true, mode: 0o700 });

  const components = await Promise.all([
    writeJson(directory, "baseline-summary.json", baselineSummary(baseline)),
    writeJson(directory, "diff-summary.json", {
      added: changes.added,
      modified: changes.modified,
      deleted: changes.deleted,
      unchangedCount: changes.unchangedCount,
      linesAdded: diff.linesAdded,
      linesDeleted: diff.linesRemoved,
      diffContentStored: false,
    }),
    writeJson(
      directory,
      "verification-report.json",
      verification ?? {
        schemaVersion: 1,
        state: "not-verified",
        reason: "No persisted verification summary is available.",
      }
    ),
    writeJson(directory, "environment-fingerprint.json", fingerprint),
  ]);
  const evidenceDigest = stableDigest(
    Object.fromEntries(
      components.map((component) => [component.filename, component.digest])
    )
  );
  const manifest: EvidenceManifest = {
    schemaVersion: 1,
    sessionId,
    createdAt: new Date().toISOString(),
    repositoryHash:
      fingerprint.git.remoteHash ?? stableDigest({ repository: "local" }),
    baselineId: baseline.git.headCommit ?? baseline.createdAt,
    workspaceFingerprint: fingerprint.digest,
    verificationState: verification?.state ?? "not-verified",
    files: components.map((component) => component.filename).sort(),
    evidenceDigest,
  };
  const manifestFile = await writeJson(directory, "manifest.json", manifest);
  const checksums = [...components, manifestFile]
    .sort((left, right) => left.filename.localeCompare(right.filename))
    .map((entry) => `${entry.digest.replace("sha256:", "")}  ${entry.filename}`)
    .join("\n");
  await writeFile(join(directory, "checksums.txt"), `${checksums}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await appendAuditEvent(repoRoot, "EVIDENCE_BUNDLE_CREATED", sessionId, manifest);
  return { directory, manifest };
}