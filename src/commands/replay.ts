import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import type { OutputFormat } from "../types/index.js";
import { ExitCodes } from "../types/index.js";
import { getRepositoryRoot } from "../git/inspector.js";
import { loadConfig } from "../config/loader.js";
import { loadBaseline } from "../baseline/manager.js";
import { createReplayManifest } from "../replay/recorder.js";
import { verifyReplayManifest } from "../replay/runner.js";
import type { ReplayManifest } from "../replay/types.js";
import {
  assertSafeIdentifier,
  resolveWithinRoot,
} from "../security/path-boundary.js";

export interface ReplayOptions {
  readonly action: "record" | "verify" | "inspect";
  readonly target: string; // session or bundle path
  readonly format: OutputFormat;
  readonly reexecute?: boolean;
}

export async function runReplay(options: ReplayOptions): Promise<number> {
  const repoRoot = await getRepositoryRoot(process.cwd()).catch(() => null);
  if (!repoRoot) return ExitCodes.NOT_GIT_REPO;

  const config = await loadConfig(repoRoot);

  if (options.action === "record") {
    if (!options.target) {
      process.stderr.write("Error: 'record' requires a session ID.\n");
      return ExitCodes.CONFIG_ERROR;
    }
    const sessionId = assertSafeIdentifier(options.target, "Replay session ID");

    const baseline = await loadBaseline(repoRoot);
    if (!baseline) {
      process.stderr.write("Error: No baseline found. Save a baseline first.\n");
      return ExitCodes.NO_BASELINE;
    }

    // Build recorded manifest using configured checks
    const manifest = await createReplayManifest(
      repoRoot,
      config,
      sessionId,
      "developer",
      baseline.git.headCommit ?? "unknown-commit",
      config.checks,
      baseline.checks
    );

    const outDir = resolve(repoRoot, ".safe-change", "replay");
    await mkdir(outDir, { recursive: true });
    const bundlePath = resolveWithinRoot(
      outDir,
      `${sessionId}-replay.json`,
      "Replay bundle path"
    );
    await writeFile(bundlePath, JSON.stringify(manifest, null, 2), "utf-8");

    if (options.format === "json") {
      process.stdout.write(
        `${JSON.stringify({ created: true, bundlePath, manifest }, null, 2)}\n`
      );
    } else {
      process.stdout.write(`Replay manifest recorded successfully.\n`);
      process.stdout.write(`Bundle: ${bundlePath}\n`);
      process.stdout.write(`Manifest Digest: ${manifest.manifestDigest}\n`);
    }
    return ExitCodes.OK;
  }

  if (options.action === "inspect") {
    const filePath = resolve(process.cwd(), options.target);
    let manifest: ReplayManifest;
    try {
      const raw = await readFile(filePath, "utf-8");
      manifest = JSON.parse(raw) as ReplayManifest;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Failed to read replay bundle: ${msg}\n`);
      return ExitCodes.CONFIG_ERROR;
    }

    if (options.format === "json") {
      process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
    } else {
      process.stdout.write(`Replay Manifest Inspection:\n`);
      process.stdout.write(`Session ID: ${manifest.sessionId}\n`);
      process.stdout.write(`Commit Range: ${manifest.startingCommit}..${manifest.endingCommit}\n`);
      process.stdout.write(`Platform: ${manifest.operatingSystem} (${manifest.architecture})\n`);
      process.stdout.write(`Digest: ${manifest.manifestDigest}\n`);
      process.stdout.write(`Commands: ${manifest.normalizedCommands.length}\n`);
    }
    return ExitCodes.OK;
  }

  if (options.action === "verify") {
    const filePath = resolve(process.cwd(), options.target);
    let manifest: ReplayManifest;
    try {
      const raw = await readFile(filePath, "utf-8");
      manifest = JSON.parse(raw) as ReplayManifest;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Failed to read replay bundle: ${msg}\n`);
      return ExitCodes.CONFIG_ERROR;
    }

    const report = await verifyReplayManifest(repoRoot, config, manifest, {
      reexecute: options.reexecute,
    });

    if (options.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(
        `Replay Verification: ${report.verified ? "VERIFIED" : "FAILED"}\n`
      );
      if (report.mismatches.length > 0) {
        process.stdout.write(`Detected Mismatches:\n`);
        for (const m of report.mismatches) {
          process.stdout.write(`  [${m.category}] ${m.details}\n`);
        }
      }
    }
    return report.verified ? ExitCodes.OK : ExitCodes.NEW_FAILURE;
  }

  return ExitCodes.CONFIG_ERROR;
}
