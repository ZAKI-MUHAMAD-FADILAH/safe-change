// ---------------------------------------------------------------------------
// safe-change -- Process executor (bounded, timed, no-shell)
// ---------------------------------------------------------------------------

import { spawn } from "node:child_process";
import type { CheckDefinition, CheckResult } from "../types/index.js";

const DEFAULT_OUTPUT_LIMIT = 100 * 1024; // 100 KB per stream

export interface ExecutorOptions {
  readonly cwd: string;
  readonly outputLimit?: number; // bytes
}

/**
 * Execute a single verification check. The executable is spawned directly
 * without a shell. Output is captured up to the configured limit.
 */
export async function executeCheck(
  check: CheckDefinition,
  options: ExecutorOptions
): Promise<CheckResult> {
  const outputLimit = options.outputLimit ?? DEFAULT_OUTPUT_LIMIT;
  const timeoutMs = check.timeout * 1000;

  return new Promise<CheckResult>((resolve) => {
    const startTime = performance.now();
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let outputTruncated = false;
    let timedOut = false;
    let resolved = false;

    function finish(exitCode: number | null): void {
      if (resolved) return;
      resolved = true;

      const durationMs = Math.round(performance.now() - startTime);

      resolve({
        name: check.name,
        executable: check.executable,
        args: check.args,
        exitCode,
        passed: exitCode === 0 && !timedOut,
        durationMs,
        timedOut,
        outputBytes: stdoutBytes + stderrBytes,
        outputTruncated,
      });
    }

    let child;
    try {
      child = spawn(check.executable, [...check.args], {
        cwd: options.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        timeout: timeoutMs,
        windowsHide: true,
      });
    } catch (err: unknown) {
      finish(null);
      return;
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes + stderrBytes > outputLimit) {
        outputTruncated = true;
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stdoutBytes + stderrBytes > outputLimit) {
        outputTruncated = true;
      }
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ETIMEDOUT" || (err as unknown as Record<string, unknown>)["killed"] === true) {
        timedOut = true;
      }
      finish(null);
    });

    child.on("close", (code: number | null, signal: string | null) => {
      if (signal === "SIGTERM" || signal === "SIGKILL") {
        timedOut = true;
        finish(null);
      } else {
        finish(code);
      }
    });
  });
}

/**
 * Execute all configured checks sequentially.
 */
export async function executeAllChecks(
  checks: readonly CheckDefinition[],
  options: ExecutorOptions,
  onProgress?: (name: string, index: number, total: number) => void
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  for (let i = 0; i < checks.length; i++) {
    const check = checks[i]!;
    onProgress?.(check.name, i, checks.length);
    const result = await executeCheck(check, options);
    results.push(result);
  }

  return results;
}
