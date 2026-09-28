import type { SandboxProvider } from "../provider.js";
import type {
  SandboxCapabilities,
  SandboxCapabilityReport,
  SandboxExecutionSpec,
} from "../types.js";

export class PosixRestrictedProvider implements SandboxProvider {
  readonly id = "posix-restricted";
  readonly name = "POSIX Restricted Process Sandbox";
  readonly platform: NodeJS.Platform = process.platform;

  async detectCapabilities(): Promise<SandboxCapabilities> {
    return {
      processIsolation: true,
      filesystemIsolation: false,
      readOnlyWorkspace: false,
      isolatedHome: true,
      environmentIsolation: true,
      networkIsolation: false,
      processTreeTermination: true,
      cpuLimit: false,
      memoryLimit: false,
      fileDescriptorLimit: false,
      outputLimit: true,
      symlinkProtection: true,
    };
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

    if (spec.networkPolicy === "deny") {
      isBlocked = true;
      reasons.push(
        `Network denial requested but operating-system network namespace isolation is unavailable on ${process.platform}`
      );
    }

    if (spec.readOnlyWorkspace) {
      isBlocked = true;
      reasons.push(
        `Read-only workspace requested but filesystem isolation is unavailable on ${process.platform}`
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
