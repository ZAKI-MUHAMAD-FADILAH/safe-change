import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { SafeChangeConfig } from "../types/index.js";
import type {
  ReplayManifest,
  ReplayMismatch,
  ReplayVerificationReport,
  ReplayRecordedResult,
} from "./types.js";
import { enforcementPolicyDigest } from "../enforcement/policy-signature.js";
import { getGitState } from "../git/inspector.js";
import { hashFileIfExists } from "./recorder.js";
import { executeCheck } from "../runner/executor.js";

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
  const computedDigest = sha256(JSON.stringify(rest));
  if (computedDigest !== manifestDigest) {
    mismatches.push({
      category: "NON_DETERMINISTIC_RESULT",
      details: "Replay manifest digest signature mismatch (tampering detected)",
      expected: manifestDigest,
      actual: computedDigest,
    });
  }

  // 2. Repository Identity Check
  const currentRepoHash = sha256(repoRoot.replace(/\\/g, "/"));
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

  // 7. Optional Re-execution Verification
  const replayedResults: ReplayRecordedResult[] = [];
  if (options?.reexecute) {
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
          cwd: repoRoot,
          sandboxPolicy: config.enforcementPolicy?.commandSandbox,
        }
      );

      const stdoutDigest = sha256(res.stdout);
      const stderrDigest = sha256(res.stderr);

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
        if (res.outputBlocked !== rec.secretRedactionState.outputBlocked) {
          mismatches.push({
            category: "SECRET_REDACTION_DRIFT",
            details: `Command '${cmd.name}' secret output redaction state mismatch`,
            expected: String(rec.secretRedactionState.outputBlocked),
            actual: String(res.outputBlocked),
          });
        }
      }
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
