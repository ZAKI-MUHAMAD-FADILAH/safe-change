import type { SandboxProvider } from "./provider.js";
import { LinuxSandboxProvider } from "./providers/linux-sandbox.js";
import { PosixRestrictedProvider } from "./providers/posix.js";
import { WindowsRestrictedProvider } from "./providers/windows.js";
import type { SandboxCapabilityReport, SandboxExecutionSpec } from "./types.js";

let defaultProvider: SandboxProvider | null = null;

export function getSandboxProvider(): SandboxProvider {
  if (defaultProvider) return defaultProvider;

  if (process.platform === "win32") {
    defaultProvider = new WindowsRestrictedProvider();
  } else if (process.platform === "linux") {
    defaultProvider = new LinuxSandboxProvider();
  } else {
    defaultProvider = new PosixRestrictedProvider();
  }

  return defaultProvider;
}

export function setCustomSandboxProvider(provider: SandboxProvider | null): void {
  defaultProvider = provider;
}

export async function evaluateSandbox(
  spec: SandboxExecutionSpec
): Promise<SandboxCapabilityReport> {
  const provider = getSandboxProvider();
  return provider.evaluatePolicy(spec);
}
