export interface SandboxCapabilities {
  readonly processIsolation: boolean;
  readonly filesystemIsolation: boolean;
  readonly readOnlyWorkspace: boolean;
  readonly isolatedHome: boolean;
  readonly environmentIsolation: boolean;
  readonly networkIsolation: boolean;
  readonly processTreeTermination: boolean;
  readonly cpuLimit: boolean;
  readonly memoryLimit: boolean;
  readonly fileDescriptorLimit: boolean;
  readonly outputLimit: boolean;
  readonly symlinkProtection: boolean;
}

export type SandboxState = "ENFORCED" | "DEGRADED" | "UNAVAILABLE" | "BLOCKED";

export interface SandboxExecutionSpec {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly timeoutSeconds: number;
  readonly maxOutputBytes: number;
  readonly allowedEnv: readonly string[];
  readonly inheritEnv: boolean;
  readonly networkPolicy: "inherit" | "deny";
  readonly readOnlyWorkspace: boolean;
}

export interface SandboxCapabilityReport {
  readonly providerId: string;
  readonly providerName: string;
  readonly platform: NodeJS.Platform;
  readonly state: SandboxState;
  readonly enforcedCapabilities: readonly (keyof SandboxCapabilities)[];
  readonly unavailableCapabilities: readonly (keyof SandboxCapabilities)[];
  readonly degradedCapabilities: readonly (keyof SandboxCapabilities)[];
  readonly reasons: readonly string[];
}
