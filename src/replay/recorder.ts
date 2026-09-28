import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { CheckDefinition, CheckResult, SafeChangeConfig } from "../types/index.js";
import type { ReplayCommandSpec, ReplayManifest, ReplayRecordedResult } from "./types.js";
import { captureWorkspaceFingerprint } from "../integrity/fingerprint.js";
import { enforcementPolicyDigest } from "../enforcement/policy-signature.js";
import { getGitState } from "../git/inspector.js";

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function hashFileIfExists(path: string): Promise<string | null> {
  try {
    const data = await readFile(path);
    return sha256(data);
  } catch {
    return null;
  }
}

export async function createReplayManifest(
  repoRoot: string,
  config: SafeChangeConfig,
  sessionId: string,
  agentProfile: string,
  baselineId: string,
  checks: readonly CheckDefinition[],
  results: readonly CheckResult[]
): Promise<ReplayManifest> {
  const gitState = await getGitState(repoRoot);
  const currentHead = gitState.headCommit ?? "unknown-commit";
  const repoHash = sha256(repoRoot.replace(/\\/g, "/"));
  const fingerprint = await captureWorkspaceFingerprint(repoRoot, config);
  const policyDigest = config.enforcementPolicy
    ? enforcementPolicyDigest(config.enforcementPolicy)
    : "";

  // Collect lockfile hashes
  const lockfileHashes: Record<string, string> = {};
  const lockCandidates = [
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
  ];
  for (const cand of lockCandidates) {
    const h = await hashFileIfExists(resolve(repoRoot, cand));
    if (h) lockfileHashes[cand] = h;
  }

  // Read Safe-Change package version
  let safeChangeVersion = "0.4.0";
  try {
    const pkgRaw = await readFile(resolve(repoRoot, "package.json"), "utf-8");
    const pkg = JSON.parse(pkgRaw) as { version?: string };
    if (pkg.version) safeChangeVersion = pkg.version;
  } catch {
    // fallback
  }

  const allowedEnvKeys =
    config.enforcementPolicy?.commandSandbox.allowedEnvironment ?? [
      "NODE_ENV",
      "PATH",
    ];
  const maxOutputBytes =
    config.enforcementPolicy?.commandSandbox.maxOutputBytes ?? 100 * 1024;

  const normalizedCommands: ReplayCommandSpec[] = checks.map((c, idx) => ({
    name: c.name,
    executable: c.executable,
    args: [...c.args],
    approvedEnvKeys: [...allowedEnvKeys],
    workingDirectory: ".",
    order: idx + 1,
    timeoutSeconds: c.timeout,
    maxOutputBytes,
  }));

  const recordedResults: ReplayRecordedResult[] = results.map((r) => ({
    name: r.name,
    exitCode: r.exitCode,
    signal: null,
    stdoutDigest: sha256(r.stdout),
    stderrDigest: sha256(r.stderr),
    secretRedactionState: {
      outputBlocked: r.outputBlocked ?? false,
      detectedSecretTypes: r.detectedSecretTypes ? [...r.detectedSecretTypes] : [],
    },
    artifactHashes: {},
    durationMs: r.durationMs,
  }));

  const rawManifest = {
    schemaVersion: 1 as const,
    sessionId,
    repositoryHash: repoHash,
    startingCommit: baselineId,
    endingCommit: currentHead,
    baselineId,
    policyDigest,
    workspaceFingerprint: fingerprint.digest,
    lockfileHashes,
    safeChangeVersion,
    agentProfile,
    operatingSystem: process.platform,
    architecture: process.arch,
    runtimeVersions: {
      node: process.version,
    },
    normalizedCommands,
    recordedResults,
    createdAt: new Date().toISOString(),
  };

  const manifestDigest = sha256(JSON.stringify(rawManifest));

  return {
    ...rawManifest,
    manifestDigest,
  };
}
