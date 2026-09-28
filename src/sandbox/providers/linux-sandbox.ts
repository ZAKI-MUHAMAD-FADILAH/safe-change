import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SandboxProvider } from "../provider.js";
import type {
  SandboxCapabilities,
  SandboxCapabilityReport,
  SandboxExecutionSpec,
} from "../types.js";

const execFileAsync = promisify(execFile);

export class LinuxSandboxProvider implements SandboxProvider {
  readonly id = "linux-sandbox";
  readonly name = "Linux Container/Namespace Sandbox";
  readonly platform: NodeJS.Platform = "linux";

  private cachedCapabilities: SandboxCapabilities | null = null;

  async detectCapabilities(): Promise<SandboxCapabilities> {
    if (this.cachedCapabilities) {
      return this.cachedCapabilities;
    }

    let hasBwrap = false;
    try {
      await execFileAsync("bwrap", ["--version"]);
      hasBwrap = true;
    } catch {
      hasBwrap = false;
    }

    this.cachedCapabilities = {
      processIsolation: true,
      filesystemIsolation: hasBwrap,
      readOnlyWorkspace: hasBwrap,
      isolatedHome: true,
      environmentIsolation: true,
      networkIsolation: hasBwrap,
      processTreeTermination: true,
      cpuLimit: false,
      memoryLimit: false,
      fileDescriptorLimit: false,
      outputLimit: true,
      symlinkProtection: true,
    };

    return this.cachedCapabilities;
  }

  async evaluatePolicy(
    spec: SandboxExecutionSpec
  ): Promise<SandboxCapabilityReport> {
    const caps = await this.detectCapabilities();
    const enforced: (keyof SandboxCapabilities)[] = [];
    const unavailable: (keyof SandboxCapabilities)[] = [];
    const degraded: (keyof SandboxCapabilities)[] = [];
    const reasons: string[] = [];

    for (const [k, v] of Object.entries(caps)) {
      const key = k as keyof SandboxCapabilities;
      if (v) enforced.push(key);
      else unavailable.push(key);
    }

    let isBlocked = false;

    if (spec.networkPolicy === "deny" && !caps.networkIsolation) {
      isBlocked = true;
      reasons.push(
        "Network deny requested but bubblewrap (bwrap) network namespace isolation is unavailable on this Linux host"
      );
    }

    if (spec.readOnlyWorkspace && !caps.readOnlyWorkspace) {
      isBlocked = true;
      reasons.push(
        "Read-only workspace requested but filesystem isolation is unavailable"
      );
    }

    const state = isBlocked
      ? "BLOCKED"
      : unavailable.length > 0
        ? "DEGRADED"
        : "ENFORCED";

    return {
      providerId: this.id,
      providerName: this.name,
      platform: this.platform,
      state,
      enforcedCapabilities: enforced,
      unavailableCapabilities: unavailable,
      degradedCapabilities: degraded,
      reasons,
    };
  }

  prepareEnvironment(
    spec: SandboxExecutionSpec,
    tempHome: string
  ): Record<string, string> {
    const env: Record<string, string> = {};

    if (spec.inheritEnv) {
      for (const [k, v] of Object.entries(process.env)) {
        if (v !== undefined) env[k] = v;
      }
    }

    for (const key of spec.allowedEnv) {
      const val = process.env[key];
      if (val !== undefined) env[key] = val;
    }

    env["HOME"] = tempHome;
    env["USER"] = "sandbox-user";
    env["TMPDIR"] = tempHome;

    return env;
  }
}
