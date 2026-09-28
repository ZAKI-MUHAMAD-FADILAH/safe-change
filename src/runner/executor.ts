import { spawn } from "node:child_process";
import type {
  CheckDefinition,
  CheckResult,
  CommandSandboxPolicy,
} from "../types/index.js";
import { terminateProcessTree, BoundedTailBuffer } from "./process-controller.js";
import { StreamingSecretRedactor } from "../security/secret-redactor.js";
import { evaluateCommandSandbox } from "../enforcement/sandbox.js";

const DEFAULT_OUTPUT_LIMIT = 100 * 1024; // 100 KB per stream
const DIAGNOSTIC_TAIL_LIMIT = 8 * 1024; // 8 KB tail kept for diagnostics

export interface ExecutorOptions {
  readonly cwd: string;
  readonly outputLimit?: number; // bytes
  readonly maxBuffer?: number; // bytes (bound for output/tail)
  readonly tailLimit?: number; // bytes for diagnostic tail buffer
  readonly sandboxPolicy?: CommandSandboxPolicy;
}

/**
 * Execute a single verification check. The executable is spawned directly
 * without a shell. Bounded stdout/stderr content is captured with a sliding
 * tail buffer so that the user can diagnose the true cause of failure.
 *
 * Reliably distinguishes between:
 * - Successful completion (exitCode: 0, timedOut: false)
 * - Non-zero exit code (exitCode: N, timedOut: false)
 * - Explicit execution timeout (exitCode: null, timedOut: true)
 * - Process terminated by external signal (exitCode: null, timedOut: false)
 * - Spawn error / executable not found (exitCode: null, timedOut: false)
 */
export async function executeCheck(
  check: CheckDefinition,
  options: ExecutorOptions
): Promise<CheckResult> {
  const sandboxDecision = options.sandboxPolicy
    ? evaluateCommandSandbox(check, options.sandboxPolicy)
    : null;
  if (sandboxDecision && !sandboxDecision.allowed) {
    return {
      name: check.name,
      executable: check.executable,
      args: check.args,
      timeout: check.timeout,
      exitCode: null,
      passed: false,
      durationMs: 0,
      timedOut: false,
      outputBytes: 0,
      outputTruncated: false,
      stdout: "",
      stderr: `Command blocked by enforcement policy: ${sandboxDecision.reasons.join(
        " "
      )}`,
      outputBlocked: false,
      detectedSecretTypes: [],
    };
  }
  const outputLimit =
    options.outputLimit ??
    options.sandboxPolicy?.maxOutputBytes ??
    options.maxBuffer ??
    DEFAULT_OUTPUT_LIMIT;
  const tailLimit = options.tailLimit ?? (options.maxBuffer !== undefined ? Math.min(options.maxBuffer, DIAGNOSTIC_TAIL_LIMIT) : DIAGNOSTIC_TAIL_LIMIT);
  const timeoutMs = check.timeout * 1000;

  return new Promise<CheckResult>((resolve) => {
    const startTime = performance.now();
    const stdoutBuffer = new BoundedTailBuffer(tailLimit);
    const stderrBuffer = new BoundedTailBuffer(tailLimit);
    const stdoutRedactor = new StreamingSecretRedactor();
    const stderrRedactor = new StreamingSecretRedactor();
    let timedOut = false;
    let resolved = false;

    let timeoutTimer: NodeJS.Timeout | null = null;

    function cleanup(): void {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
    }

    function finish(exitCode: number | null): void {
      if (resolved) return;
      resolved = true;
      cleanup();

      const durationMs = Math.round(performance.now() - startTime);
      stdoutBuffer.append(stdoutRedactor.flush());
      stderrBuffer.append(stderrRedactor.flush());
      const detectedSecretTypes = [
        ...new Set([
          ...stdoutRedactor.detectedTypes,
          ...stderrRedactor.detectedTypes,
        ]),
      ].sort();
      const outputBlocked = detectedSecretTypes.length > 0;
      const totalBytes = stdoutBuffer.totalBytes + stderrBuffer.totalBytes;
      const isTruncated =
        stdoutBuffer.isTruncated ||
        stderrBuffer.isTruncated ||
        totalBytes > outputLimit;

      resolve({
        name: check.name,
        executable: check.executable,
        args: check.args,
        timeout: check.timeout,
        exitCode,
        passed: exitCode === 0 && !timedOut && !outputBlocked,
        durationMs,
        timedOut,
        outputBytes: totalBytes,
        outputTruncated: isTruncated,
        stdout: stdoutBuffer.getTailString(),
        stderr: stderrBuffer.getTailString(),
        outputBlocked,
        detectedSecretTypes,
      });
    }

    let child;
    try {
      child = spawn(check.executable, [...check.args], {
        cwd: options.cwd,
        env: sandboxDecision?.environment ?? process.env,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        windowsHide: true,
        detached: process.platform !== "win32",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      stderrBuffer.push(Buffer.from(`Spawn error: ${msg}\n`, "utf-8"));
      finish(null);
      return;
    }

    // Set execution timeout timer targeting full process tree
    timeoutTimer = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child.pid);
    }, timeoutMs);
    timeoutTimer.unref();

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBuffer.append(stdoutRedactor.push(chunk));
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrBuffer.append(stderrRedactor.push(chunk));
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      const msg = err.message || String(err);
      stderrBuffer.push(Buffer.from(`Execution error: ${msg}\n`, "utf-8"));
      if (err.code === "ETIMEDOUT") {
        timedOut = true;
      }
      finish(null);
    });

    child.on("close", (code: number | null, signal: string | null) => {
      if (signal) {
        if (!timedOut) {
          stderrBuffer.push(
            Buffer.from(`Process terminated by external signal: ${signal}\n`, "utf-8")
          );
        }
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
