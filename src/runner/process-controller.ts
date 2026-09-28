import { spawnSync } from "node:child_process";

export interface TerminateProcessTreeOptions {
  readonly gracePeriodMs?: number;
}

/**
 * Terminate a process and all its descendants cleanly without invoking a shell.
 * On POSIX systems, targets the process group created via detached spawn.
 * On Windows, uses taskkill.exe directly to terminate the full process tree.
 */
export function terminateProcessTree(
  pid: number | undefined,
  options: TerminateProcessTreeOptions = {}
): void {
  if (pid === undefined || pid <= 0) {
    return;
  }

  const isWindows = process.platform === "win32";

  if (isWindows) {
    try {
      spawnSync("taskkill.exe", ["/pid", String(pid), "/T", "/F"], {
        windowsHide: true,
        shell: false,
        stdio: "ignore",
      });
    } catch {
      try {
        process.kill(pid);
      } catch {
        // Process may already have terminated
      }
    }
    return;
  }

  // POSIX process group termination
  const gracePeriodMs = options.gracePeriodMs ?? 1500;

  try {
    process.kill(-pid, "SIGTERM");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ESRCH") {
      return;
    }
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      return;
    }
  }

  // Also signal direct descendants by PPID if pkill is available (without using shell)
  try {
    spawnSync("pkill", ["-TERM", "-P", String(pid)], { stdio: "ignore" });
  } catch {
    // pkill may not be present on minimal environments
  }

  const killTimer = setTimeout(() => {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Process may already have terminated
      }
    }
    try {
      spawnSync("pkill", ["-KILL", "-P", String(pid)], { stdio: "ignore" });
    } catch {
      // Ignored
    }
  }, gracePeriodMs);

  killTimer.unref();
}

/**
 * Bounded ring-buffer retaining the true tail of streamed output.
 * Preserves exact bytes observed while strictly capping memory usage.
 * Handles multibyte UTF-8 sequence boundaries safely when slicing.
 */
export class BoundedTailBuffer {
  private readonly maxBytes: number;
  private chunks: Buffer[] = [];
  private currentBytes = 0;
  private totalObservedBytes = 0;

  constructor(maxBytes: number) {
    this.maxBytes = Math.max(1, maxBytes);
  }

  public push(chunk: Buffer): void {
    if (chunk.length === 0) return;
    this.totalObservedBytes += chunk.length;
    this.chunks.push(chunk);
    this.currentBytes += chunk.length;

    // Prune older chunks when threshold is exceeded to avoid unbounded memory growth
    if (this.currentBytes > this.maxBytes * 2) {
      const full = Buffer.concat(this.chunks);
      const start = full.length - this.maxBytes;
      const sliced = full.subarray(start);
      this.chunks = [sliced];
      this.currentBytes = sliced.length;
    }
  }

  public append(data: string | Buffer): void {
    const buf = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
    this.push(buf);
  }

  public get totalBytes(): number {
    return this.totalObservedBytes;
  }

  public get isTruncated(): boolean {
    return this.totalObservedBytes > this.maxBytes;
  }

  public toString(): string {
    return this.getTailString();
  }

  public getTailString(): string {
    if (this.chunks.length === 0) {
      return "";
    }
    const full = Buffer.concat(this.chunks);
    if (full.length <= this.maxBytes) {
      return full.toString("utf-8");
    }

    let start = full.length - this.maxBytes;
    // Align to UTF-8 sequence boundary: continuation bytes start with 10xxxxxx (0x80..0xBF)
    while (start < full.length && (full[start]! & 0xc0) === 0x80) {
      start++;
    }

    return full.subarray(start).toString("utf-8");
  }
}
