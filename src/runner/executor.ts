// ---------------------------------------------------------------------------
// safe-change -- Process executor (bounded, timed, no-shell)
// ---------------------------------------------------------------------------

import { spawn } from "node:child_process";
import type { CheckDefinition, CheckResult } from "../types/index.js";

const DEFAULT_OUTPUT_LIMIT = 100 * 1024; // 100 KB per stream
const DIAGNOSTIC_TAIL_LIMIT = 8 * 1024; // 8 KB tail kept for diagnostics

export interface ExecutorOptions {
  readonly cwd: string;
  readonly outputLimit?: number; // bytes
}

/**
 * Execute a single verification check. The executable is spawned directly
 * without a shell. Bounded stdout/stderr content is captured so that
 * the user can diagnose why a check failed.
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
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let outputTruncated = false;
    let timedOut = false;
    let resolved = false;

    function finish(exitCode: number | null): void {
      if (resolved) return;
      resolved = true;

      const durationMs = Math.round(performance.now() - startTime);

      // Keep only the tail of captured output for diagnostics
      const stdoutFull = Buffer.concat(stdoutChunks);
      const stderrFull = Buffer.concat(stderrChunks);
      const stdout = tailString(stdoutFull, DIAGNOSTIC_TAIL_LIMIT);
      const stderr = tailString(stderrFull, DIAGNOSTIC_TAIL_LIMIT);

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
        stdout,
        stderr,
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
      if (stdoutBytes + stderrBytes <= outputLimit) {
        stdoutChunks.push(chunk);
      } else {
        outputTruncated = true;
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stdoutBytes + stderrBytes <= outputLimit) {
        stderrChunks.push(chunk);
      } else {
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

// -- Helpers -----------------------------------------------------------------

/**
 * Return the last `limit` bytes of a buffer as a UTF-8 string.
 */
function tailString(buf: Buffer, limit: number): string {
  if (buf.length <= limit) {
    return buf.toString("utf-8");
  }
  return buf.subarray(buf.length - limit).toString("utf-8");
}
