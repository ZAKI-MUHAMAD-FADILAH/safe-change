import type { OutputFormat } from "../types/index.js";
import { ExitCodes } from "../types/index.js";
import { getRepositoryRoot } from "../git/inspector.js";
import { loadConfig } from "../config/loader.js";
import { verifyPolicySignature } from "../enforcement/policy-signature.js";

export async function runPolicyVerify(options: {
  readonly format: OutputFormat;
}): Promise<number> {
  const repoRoot = await getRepositoryRoot(process.cwd()).catch(() => null);
  if (!repoRoot) return ExitCodes.NOT_GIT_REPO;
  const config = await loadConfig(repoRoot);
  if (!config.enforcementPolicy) {
    process.stderr.write("No enforcementPolicy is configured.\n");
    return ExitCodes.CONFIG_ERROR;
  }
  const result = verifyPolicySignature(
    config.enforcementPolicy,
    config.policySignature
  );
  const accepted =
    result.valid || !config.enforcementPolicy.requireSignedPolicy;
  process.stdout.write(
    options.format === "json"
      ? `${JSON.stringify(
          {
            ...result,
            required: config.enforcementPolicy.requireSignedPolicy,
            accepted,
          },
          null,
          2
        )}\n`
      : `Policy signature: ${result.valid ? "VALID" : "NOT VALID"}\nRequired: ${config.enforcementPolicy.requireSignedPolicy ? "YES" : "NO"}\nDigest: ${result.computedDigest}\n${result.reason}\n`
  );
  return accepted ? ExitCodes.OK : ExitCodes.OWNERSHIP_CONFLICT;
}