import type {
  SandboxCapabilities,
  SandboxCapabilityReport,
  SandboxExecutionSpec,
} from "./types.js";

export interface SandboxProvider {
  readonly id: string;
  readonly name: string;
  readonly platform: NodeJS.Platform;

  detectCapabilities(): Promise<SandboxCapabilities>;
  evaluatePolicy(
    spec: SandboxExecutionSpec
  ): Promise<SandboxCapabilityReport>;
  prepareEnvironment(
    spec: SandboxExecutionSpec,
    tempHome: string
  ): Record<string, string>;
}
