import type { InstallerScope } from "../core/path-safety.js";
import type { CollisionInspection } from "../core/collision.js";
import type { OwnershipManifest } from "../core/ownership.js";

/**
 * Result of an adapter install, update, or uninstall operation.
 */
export interface AdapterOperationResult {
  status:
    | "installed"
    | "updated"
    | "uninstalled"
    | "up_to_date"
    | "collision_detected"
    | "cancelled"
    | "not_found"
    | "ownership_conflict"
    | "dry_run";
  targetDir: string;
  scope: InstallerScope;
  agent: string;
  message: string;
  sha256?: string;
  collision?: CollisionInspection;
  manifest?: OwnershipManifest;
}

/**
 * Options for adapter install or update operations.
 */
export interface AdapterInstallOptions {
  scope: InstallerScope;
  workspaceRoot?: string;
  homeDir?: string;
  overwrite?: boolean;
  dryRun?: boolean;
  nonInteractive?: boolean;
}

/**
 * Options for adapter uninstall operations.
 */
export interface AdapterUninstallOptions {
  scope: InstallerScope;
  workspaceRoot?: string;
  homeDir?: string;
  dryRun?: boolean;
  nonInteractive?: boolean;
}

/**
 * Options for adapter status operations.
 */
export interface AdapterStatusOptions {
  scope: InstallerScope;
  workspaceRoot?: string;
  homeDir?: string;
}

/**
 * Status report for an installed adapter.
 */
export interface AdapterStatus {
  installed: boolean;
  scope: InstallerScope;
  agent: string;
  targetDir: string;
  manifest: OwnershipManifest | null;
  hasDrift: boolean;
  driftDetails?: {
    modifiedFiles: string[];
    missingFiles: string[];
  };
  canonicalSha256: string | null;
  installedSha256: string | null;
}

/**
 * Contract that all agent adapters must implement.
 * Each adapter is responsible for a single agent type (e.g. Antigravity, Claude Code).
 * Adapters delegate path safety, collision detection, ownership, transactions,
 * and rollback to the core modules.
 */
export interface AgentAdapter {
  /** Unique identifier for the agent this adapter supports. */
  readonly agentName: string;

  /** Human-readable display name. */
  readonly displayName: string;

  /** Path to the canonical skill source file. */
  readonly canonicalSkillPath: string;

  /**
   * Resolves the target directory for the given scope.
   */
  resolveTargetDir(options: {
    scope: InstallerScope;
    workspaceRoot?: string;
    homeDir?: string;
  }): string;

  /**
   * Installs the canonical skill into the target scope.
   */
  install(options: AdapterInstallOptions): AdapterOperationResult;

  /**
   * Updates an existing installation with the latest canonical skill.
   */
  update(options: AdapterInstallOptions): AdapterOperationResult;

  /**
   * Removes a previously installed skill from the target scope.
   */
  uninstall(options: AdapterUninstallOptions): AdapterOperationResult;

  /**
   * Reports the current installation status and drift.
   */
  status(options: AdapterStatusOptions): AdapterStatus;
}
