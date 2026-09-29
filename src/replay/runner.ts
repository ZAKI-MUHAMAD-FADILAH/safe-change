import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { mkdtemp, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SafeChangeConfig } from "../types/index.js";
import type {
  ReplayManifest,
  ReplayMismatch,
  ReplayVerificationReport,
  ReplayRecordedResult,
} from "./types.js";
import { enforcementPolicyDigest } from "../enforcement/policy-signature.js";
import { getGitState } from "../git/inspector.js";
import {
  hashFileIfExists,
  normalizeReplayOutput,
  repositoryIdentityDigest,
} from "./recorder.js";
import { executeCheck } from "../runner/executor.js";
import { captureWorkspaceFingerprint } from "../integrity/fingerprint.js";
import { stableStringify } from "../integrity/hash.js";

const execFileAsync = promisify(execFile);

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function verifyReplayManifest(
  repoRoot: string,
  config: SafeChangeConfig,
  manifest: ReplayManifest,
  options?: { readonly reexecute?: boolean }
): Promise<ReplayVerificationReport> {
  const mismatches: ReplayMismatch[] = [];

  // 1. Verify Manifest Integrity
  const { manifestDigest, ...rest } = manifest;
  const computedDigest = sha256(stableStringify(rest));
  if (computedDigest !== manifestDigest) {
    mismatches.push({
      category: "NON_DETERMINISTIC_RESULT",
      details: "Replay manifest digest signature mismatch (tampering detected)",
      expected: manifestDigest,
      actual: computedDigest,
    });
  }

  // 2. Repository Identity Check
  const currentRepoHash = await repositoryIdentityDigest(repoRoot);
  if (currentRepoHash !== manifest.repositoryHash) {
    mismatches.push({
      category: "REPOSITORY_DRIFT",
      details: "Workspace directory path does not match replay manifest",
      expected: manifest.repositoryHash,
      actual: currentRepoHash,
    });
  }

  // 3. Commit Identity Check
  const gitState = await getGitState(repoRoot);
  const currentHead = gitState.headCommit ?? "unknown-commit";
  if (currentHead !== manifest.endingCommit) {
    mismatches.push({
      category: "COMMIT_DRIFT",
      details: "Current HEAD commit differs from replay manifest ending commit",
      expected: manifest.endingCommit,
      actual: currentHead,
    });
  }
  if (manifest.workspaceWasClean && !gitState.isClean) {
    mismatches.push({
      category: "CONFIGURATION_DRIFT",
      details: "Current workspace is dirty; replay requires a clean exact commit.",
    });
  }

  // 4. Policy Digest Check
  const currentPolicyDigest = config.enforcementPolicy
    ? enforcementPolicyDigest(config.enforcementPolicy)
    : "";
  if (currentPolicyDigest !== manifest.policyDigest) {
    mismatches.push({
      category: "POLICY_DRIFT",
      details: "Enforcement policy digest differs from recorded replay",
      expected: manifest.policyDigest,
      actual: currentPolicyDigest,
    });
  }

  // 5. Dependency Lockfile Check
  for (const [lockFile, recordedHash] of Object.entries(
    manifest.lockfileHashes
  )) {
    const currentHash = await hashFileIfExists(resolve(repoRoot, lockFile));
    if (currentHash !== recordedHash) {
      mismatches.push({
        category: "DEPENDENCY_DRIFT",
        details: `Lockfile ${lockFile} digest mismatch`,
        expected: recordedHash,
        actual: currentHash ?? "missing",
      });
    }
  }

  // 6. Environment Check
  if (
    process.platform !== manifest.operatingSystem ||
    process.arch !== manifest.architecture
  ) {
    mismatches.push({
      category: "ENVIRONMENT_DRIFT",
      details: `Execution platform/architecture mismatch: recorded ${manifest.operatingSystem}-${manifest.architecture}, current ${process.platform}-${process.arch}`,
      expected: `${manifest.operatingSystem}-${manifest.architecture}`,
      actual: `${process.platform}-${process.arch}`,
    });
  }
  if (process.version !== manifest.runtimeVersions["node"]) {
    mismatches.push({
      category: "ENVIRONMENT_DRIFT",
      details: "Node.js runtime version differs from the recorded replay.",
      expected: manifest.runtimeVersions["node"] ?? "missing",
      actual: process.version,
    });
  }

  const fingerprint = await captureWorkspaceFingerprint(repoRoot, config);
  if (fingerprint.digest !== manifest.workspaceFingerprint) {
    mismatches.push({
      category: "CONFIGURATION_DRIFT",
      details: "Workspace fingerprint differs from the recorded replay.",
      expected: manifest.workspaceFingerprint,
      actual: fingerprint.digest,
    });
  }

  const currentCommands = config.checks.map((check, index) => ({
    name: check.name,
    executable: check.executable,
    args: [...check.args],
    approvedEnvKeys: [
      ...(config.enforcementPolicy?.commandSandbox.allowedEnvironment ?? [
        "NODE_ENV",
        "PATH",
      ]),
    ],
    workingDirectory: ".",
    order: index + 1,
    timeoutSeconds: check.timeout,
    maxOutputBytes:
      config.enforcementPolicy?.commandSandbox.maxOutputBytes ?? 100 * 1024,
  }));
  if (stableStringify(currentCommands) !== stableStringify(manifest.normalizedCommands)) {
    mismatches.push({
      category: "COMMAND_DRIFT",
      details: "Configured verification commands differ from the replay manifest.",
    });
  }

  // 7. Optional Re-execution Verification
  const replayedResults: ReplayRecordedResult[] = [];
  if (options?.reexecute) {
    const replayRoot = await mkdtemp(join(tmpdir(), "safe-change-replay-"));
    try {
      await execFileAsync(
        "git",
        ["worktree", "add", "--detach", replayRoot, manifest.endingCommit],
        { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 }
      );
      try {
        await access(join(replayRoot, "package-lock.json"));
        await execFileAsync("npm", ["ci", "--ignore-scripts"], {
          cwd: replayRoot,
          maxBuffer: 20 * 1024 * 1024,
          timeout: 180_000,
        });
      } catch {
        // Non-npm repositories and checks that do not require dependencies remain valid.
      }

      for (const cmd of manifest.normalizedCommands) {
        const rec = manifest.recordedResults.find((r) => r.name === cmd.name);
        const res = await executeCheck(
          {
            name: cmd.name,
            executable: cmd.executable,
            args: cmd.args,
            timeout: cmd.timeoutSeconds,
          },
          {
            cwd: replayRoot,
            sandboxPolicy: config.enforcementPolicy?.commandSandbox,
          }
        );

        const stdoutDigest = sha256(normalizeReplayOutput(res.stdout, replayRoot));
        const stderrDigest = sha256(normalizeReplayOutput(res.stderr, replayRoot));

        replayedResults.push({
          name: res.name,
          exitCode: res.exitCode,
          signal: null,
          stdoutDigest,
          stderrDigest,
          secretRedactionState: {
            outputBlocked: res.outputBlocked ?? false,
            detectedSecretTypes: res.detectedSecretTypes ? [...res.detectedSecretTypes] : [],
          },
          artifactHashes: {},
          durationMs: res.durationMs,
        });

        if (rec) {
          if (res.exitCode !== rec.exitCode) {
            mismatches.push({
              category: "EXIT_STATUS_DRIFT",
              details: `Command '${cmd.name}' exit status mismatch`,
              expected: String(rec.exitCode),
              actual: String(res.exitCode),
            });
          }
          if (stdoutDigest !== rec.stdoutDigest) {
            mismatches.push({
              category: "OUTPUT_DRIFT",
              details: `Command '${cmd.name}' stdout digest mismatch`,
              expected: rec.stdoutDigest,
              actual: stdoutDigest,
            });
          }
          if (stderrDigest !== rec.stderrDigest) {
            mismatches.push({
              category: "OUTPUT_DRIFT",
              details: `Command '${cmd.name}' stderr digest mismatch`,
              expected: rec.stderrDigest,
              actual: stderrDigest,
            });
          }
          if (res.durationMs > Math.max(rec.durationMs * 3, rec.durationMs + 5_000)) {
            mismatches.push({
              category: "NON_DETERMINISTIC_RESULT",
              details: `Command '${cmd.name}' duration exceeded the recorded result by more than the allowed anomaly threshold.`,
              expected: String(rec.durationMs),
              actual: String(res.durationMs),
            });
          }
          if (res.outputBlocked !== rec.secretRedactionState.outputBlocked) {
            mismatches.push({
              category: "SECRET_REDACTION_DRIFT",
              details: `Command '${cmd.name}' secret output redaction state mismatch`,
              expected: String(rec.secretRedactionState.outputBlocked),
              actual: String(res.outputBlocked),
            });
          }
        }
        if (!rec) {
          mismatches.push({
            category: "COMMAND_DRIFT",
            details: `Command '${cmd.name}' has no recorded result.`,
          });
        }
      }
    } finally {
      await execFileAsync("git", ["worktree", "remove", "--force", replayRoot], {
        cwd: repoRoot,
      }).catch(() => undefined);
      await rm(replayRoot, { recursive: true, force: true });
    }
  }

  return {
    verified: mismatches.length === 0,
    sessionId: manifest.sessionId,
    evaluatedAt: new Date().toISOString(),
    mismatches,
    replayedResults,
  };
}
