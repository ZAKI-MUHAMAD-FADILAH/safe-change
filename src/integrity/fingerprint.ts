import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  SafeChangeConfig,
  WorkspaceDrift,
  WorkspaceDriftCategory,
  WorkspaceFingerprint,
} from "../types/index.js";
import { computeFileHash, getGitState } from "../git/inspector.js";
import { stableDigest } from "./hash.js";

const LOCKFILE_NAMES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "Cargo.lock",
  "poetry.lock",
  "Pipfile.lock",
  "go.sum",
]);

async function readOptionalHash(path: string): Promise<string | null> {
  try {
    return await computeFileHash(path);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function getRemoteHash(repoRoot: string): Promise<string | null> {
  const remote = await new Promise<string | null>((resolve) => {
    execFile(
      "git",
      ["remote", "get-url", "origin"],
      { cwd: repoRoot, encoding: "utf8", timeout: 10_000 },
      (error, stdout) => resolve(error ? null : stdout.trim())
    );
  });
  return remote ? stableDigest({ remote }) : null;
}

async function findLockfiles(
  root: string,
  relative = "",
  depth = 0
): Promise<string[]> {
  if (depth > 6) return [];
  const absolute = join(root, relative);
  let entries;
  try {
    entries = await readdir(absolute, { withFileTypes: true });
  } catch {
    return [];
  }
  const results: string[] = [];
  for (const entry of entries) {
    if (
      entry.name === ".git" ||
      entry.name === ".safe-change" ||
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === "target"
    ) {
      continue;
    }
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...(await findLockfiles(root, child, depth + 1)));
    } else if (entry.isFile() && LOCKFILE_NAMES.has(entry.name)) {
      results.push(child);
    }
  }
  return results.sort();
}

export async function captureWorkspaceFingerprint(
  repoRoot: string,
  config: SafeChangeConfig,
  agentProfile: string | null = null
): Promise<WorkspaceFingerprint> {
  const git = await getGitState(repoRoot);
  const lockfilePaths = await findLockfiles(repoRoot);
  const lockfiles: Record<string, string> = Object.create(null);
  for (const path of lockfilePaths) {
    lockfiles[path] = await computeFileHash(join(repoRoot, path));
  }

  const configurationHash =
    (await readOptionalHash(join(repoRoot, ".safe-change.json"))) ??
    stableDigest(config);
  const rulesHash = await readOptionalHash(
    join(repoRoot, ".safe-change", "rules.json")
  );
  const skillHash = await readOptionalHash(
    join(repoRoot, "skills", "safe-change", "SKILL.md")
  );
  const remoteHash = await getRemoteHash(repoRoot);
  const policyVersion = config.enterprisePolicy?.policyVersion ?? null;
  const stableFields = {
    git: {
      headCommit: git.headCommit,
      headBranch: git.headBranch,
      remoteHash,
    },
    configurationHash,
    rulesHash,
    lockfiles,
    policyVersion,
    skillHash,
    agentProfile,
    runtime: {
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
  };

  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    digest: stableDigest(stableFields),
    ...stableFields,
  };
}

export function compareWorkspaceFingerprints(
  expected: WorkspaceFingerprint,
  current: WorkspaceFingerprint
): WorkspaceDrift {
  const categories: WorkspaceDriftCategory[] = [];
  if (expected.git.headCommit !== current.git.headCommit) categories.push("HEAD_DRIFT");
  if (expected.git.headBranch !== current.git.headBranch) categories.push("BRANCH_DRIFT");
  if (expected.git.remoteHash !== current.git.remoteHash) categories.push("REMOTE_DRIFT");
  if (expected.configurationHash !== current.configurationHash) {
    categories.push("CONFIGURATION_DRIFT");
  }
  if (expected.rulesHash !== current.rulesHash) categories.push("RULES_DRIFT");
  if (stableDigest(expected.lockfiles) !== stableDigest(current.lockfiles)) {
    categories.push("DEPENDENCY_DRIFT");
  }
  if (expected.policyVersion !== current.policyVersion) categories.push("POLICY_DRIFT");
  if (expected.skillHash !== current.skillHash) categories.push("SKILL_DRIFT");
  if (expected.agentProfile !== current.agentProfile) {
    categories.push("AGENT_PROFILE_DRIFT");
  }
  if (
    expected.runtime.nodeVersion !== current.runtime.nodeVersion ||
    expected.runtime.platform !== current.runtime.platform ||
    expected.runtime.architecture !== current.runtime.architecture
  ) {
    categories.push("ENVIRONMENT_DRIFT");
  }

  return {
    detected: categories.length > 0,
    categories,
    expectedDigest: expected.digest,
    currentDigest: current.digest,
  };
}