import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as os from "node:os";
import { fileURLToPath } from "node:url";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));

import type {
  AgentAdapter,
  AdapterInstallOptions,
  AdapterUninstallOptions,
  AdapterStatusOptions,
  AdapterOperationResult,
  AdapterStatus,
} from "./adapter.js";

import type { InstallerScope } from "../core/path-safety.js";
import {
  assertSafeScopePath,
  assertNoSymlinkOrJunction,
  getDefaultGlobalAllowlist,
  PathSafetyError,
} from "../core/path-safety.js";
import {
  inspectCollision,
  canSafelyWrite,
} from "../core/collision.js";
import {
  createOwnershipManifest,
  writeOwnershipManifest,
  readOwnershipManifest,
  validateOwnership,
  verifyManifestIntegrity,
  type OwnershipManifest,
} from "../core/ownership.js";
import { InstallationTransaction } from "../core/transaction.js";
import { RollbackSession } from "../core/rollback.js";
import {
  composeAgentSkill,
  type SkillComposition,
} from "../skills/composer.js";

export const SKILL_RELATIVE_PATH = "SKILL.md";

/**
 * Computes the SHA-256 digest of a file.
 */
export function fileSha256(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Reads the package version from the nearest package.json.
 */
export function readPackageVersion(): string {
  try {
    let dir = CURRENT_DIR;
    for (let i = 0; i < 10; i++) {
      const pkgPath = path.join(dir, "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        return pkg.version ?? "0.0.0";
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // fallback
  }
  return "0.0.0";
}

/**
 * Base adapter class extracting common installation, update, uninstall, and status logic.
 * Concrete adapters define specific agent properties and paths.
 */
export abstract class BaseAdapter implements AgentAdapter {
  public abstract readonly agentId: string;
  public abstract readonly agentName: string;
  public abstract readonly projectSkillPath: string;
  public abstract readonly globalSkillPath: string;
  public abstract readonly verificationStatus: "filesystem-validated" | "runtime-verified";
  public abstract readonly notes: string;
  public abstract readonly documentationUrl?: string;

  public get displayName(): string {
    return this.agentName;
  }

  public readonly canonicalSkillPath: string;

  constructor(canonicalSkillPath?: string) {
    if (canonicalSkillPath) {
      this.canonicalSkillPath = path.resolve(canonicalSkillPath);
    } else {
      let dir = CURRENT_DIR;
      for (let i = 0; i < 10; i++) {
        const candidate = path.join(dir, "skills", "safe-change", "SKILL.md");
        if (fs.existsSync(candidate)) {
          this.canonicalSkillPath = candidate;
          return;
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
      this.canonicalSkillPath = path.join(
        process.cwd(),
        "skills",
        "safe-change",
        "SKILL.md"
      );
    }
  }

  /**
   * Bundles or returns the content of the canonical skill file.
   */
  public bundleSkill(): string {
    return this.composeSkill().content;
  }

  public composeSkill(): SkillComposition {
    if (!fs.existsSync(this.canonicalSkillPath)) {
      throw new Error(`Canonical skill source not found: '${this.canonicalSkillPath}'.`);
    }
    return composeAgentSkill(this.canonicalSkillPath, this.agentId);
  }

  /**
   * Verifies the SHA-256 hash of a target skill file against the canonical skill.
   */
  public verifySkillHash(targetFilePath: string): {
    matches: boolean;
    expectedSha256: string;
    actualSha256: string | null;
  } {
    const expectedSha256 = this.composeSkill().composedSha256;
    if (!fs.existsSync(targetFilePath)) {
      return { matches: false, expectedSha256, actualSha256: null };
    }
    try {
      assertNoSymlinkOrJunction(targetFilePath);
      const actualSha256 = fileSha256(targetFilePath);
      return {
        matches: actualSha256 === expectedSha256,
        expectedSha256,
        actualSha256,
      };
    } catch {
      return { matches: false, expectedSha256, actualSha256: null };
    }
  }

  /**
   * Creates an ownership manifest for this adapter in the given scope.
   */
  public createOwnershipManifest(scope: InstallerScope, targetDir: string): OwnershipManifest {
    return createOwnershipManifest({
      version: readPackageVersion(),
      agent: this.agentId,
      scope,
      targetDir,
      installedFiles: [SKILL_RELATIVE_PATH],
    });
  }

  /**
   * Reads an ownership manifest from the target directory.
   */
  public readOwnershipManifest(targetDir: string): OwnershipManifest | null {
    return readOwnershipManifest(targetDir);
  }

  /**
   * Resolves the target directory for the given scope.
   */
  public resolveTargetDir(options: {
    scope: InstallerScope;
    workspaceRoot?: string;
    homeDir?: string;
  }): string {
    const { scope, workspaceRoot, homeDir = os.homedir() } = options;

    if (scope === "project") {
      if (!workspaceRoot) {
        throw new Error("Project scope requires a valid workspaceRoot.");
      }
      return path.resolve(workspaceRoot, this.projectSkillPath);
    }

    return path.resolve(homeDir, this.globalSkillPath);
  }

  /**
   * Installs the canonical skill into the target scope.
   */
  public install(options: AdapterInstallOptions): AdapterOperationResult {
    const {
      scope,
      workspaceRoot,
      homeDir = os.homedir(),
      overwrite = false,
      dryRun = false,
    } = options;

    const targetDir = this.resolveTargetDir({ scope, workspaceRoot, homeDir });

    // Validate canonical source exists
    if (!fs.existsSync(this.canonicalSkillPath)) {
      return {
        status: "cancelled",
        targetDir,
        scope,
        agent: this.agentId,
        message: `Canonical skill source not found: '${this.canonicalSkillPath}'.`,
      };
    }

    const composition = this.composeSkill();
    const canonicalSha256 = composition.composedSha256;

    // Path safety validation
    try {
      if (scope === "project") {
        assertSafeScopePath({
          scope: "project",
          targetPath: targetDir,
          workspaceRoot,
          homeDir,
        });
      } else {
        assertSafeScopePath({
          scope: "global",
          targetPath: targetDir,
          homeDir,
          allowedGlobalSubpaths: getDefaultGlobalAllowlist(homeDir),
        });
      }
    } catch (err: any) {
      if (
        err instanceof PathSafetyError &&
        (err.code === "SYMLINK_REJECTED" || err.code === "PATH_TRAVERSAL")
      ) {
        return {
          status: "cancelled",
          targetDir,
          scope,
          agent: this.agentId,
          message: err.message,
        };
      }
      throw err;
    }

    // Collision detection
    const collision = inspectCollision({
      targetPath: targetDir,
      expectedType: "directory",
      expectedSourceSha256: composition.composedSha256,
      relativeSkillFileName: SKILL_RELATIVE_PATH,
    });

    // Special handling for Amp and Antigravity shared directory (.agents/skills/safe-change)
    const isSharedAmpAntigravity =
      scope === "project" &&
      (this.agentId === "amp" || this.agentId === "antigravity");

    let isAmpAntigravityCollision = false;
    if (isSharedAmpAntigravity && collision.exists && collision.ownership.isSafeChangeOwned) {
      const existingManifest = readOwnershipManifest(targetDir);
      if (
        existingManifest &&
        (existingManifest.agent === "amp" || existingManifest.agent === "antigravity")
      ) {
        isAmpAntigravityCollision = true;
      }
    }

    const writeDecision = canSafelyWrite(collision, { overwrite });
    if (!writeDecision.canWrite && !isAmpAntigravityCollision) {
      return {
        status: collision.state === "symlink_or_junction"
          ? "cancelled"
          : collision.state === "ownership_conflict"
            ? "ownership_conflict"
            : "collision_detected",
        targetDir,
        scope,
        agent: this.agentId,
        message: writeDecision.reason ?? collision.message,
        collision,
      };
    }

    // If content is already identical and safe-change owned, report up_to_date
    if (collision.isIdentical && (collision.ownership.isSafeChangeOwned || isAmpAntigravityCollision)) {
      const warningPrefix = isAmpAntigravityCollision
        ? "amp dan antigravity berbagi direktori .agents/skills/. Keduanya akan membaca skill yang sama. "
        : "";
      return {
        status: "up_to_date",
        targetDir,
        scope,
        agent: this.agentId,
        message: `${warningPrefix}Skill is already installed and up to date.`,
        sha256: canonicalSha256,
      };
    }

    // Dry run: report what would be done
    if (dryRun) {
      const warningPrefix = isAmpAntigravityCollision
        ? "amp dan antigravity berbagi direktori .agents/skills/. Keduanya akan membaca skill yang sama. "
        : "";
      return {
        status: "dry_run",
        targetDir,
        scope,
        agent: this.agentId,
        message: `${warningPrefix}Dry run: Would install skill to '${targetDir}'. SHA-256: ${canonicalSha256}.`,
        sha256: canonicalSha256,
        collision: collision.exists ? collision : undefined,
      };
    }

    // Perform atomic installation
    const rollback = new RollbackSession({ targetDir });
    try {
      rollback.backup();

      const tx = new InstallationTransaction({ targetDir });
      try {
        tx.stageFile(SKILL_RELATIVE_PATH, composition.content);
        tx.commit();
      } catch (err) {
        tx.abort();
        throw err;
      }

      // Verify post-install integrity
      const installedSkillPath = path.join(targetDir, SKILL_RELATIVE_PATH);
      assertNoSymlinkOrJunction(installedSkillPath);
      const installedSha256 = fileSha256(installedSkillPath);

      if (installedSha256 !== canonicalSha256) {
        throw new Error(
          `Post-install integrity check failed: Expected SHA-256 '${canonicalSha256}', got '${installedSha256}'.`
        );
      }

      // Write ownership manifest: preserve original installer if shared Amp/Antigravity
      const existingManifest = readOwnershipManifest(targetDir);
      const manifestAgent =
        isAmpAntigravityCollision && existingManifest?.agent
          ? existingManifest.agent
          : this.agentId;

      const manifest = createOwnershipManifest({
        version: readPackageVersion(),
        agent: manifestAgent,
        scope,
        targetDir,
        installedFiles: [SKILL_RELATIVE_PATH],
        metadata: {
          policyVersion: composition.policyVersion,
          canonicalSha256: composition.canonicalSha256,
          profileSha256: composition.profileSha256,
          composedSha256: composition.composedSha256,
          agentProfile: this.agentId,
        },
      });
      writeOwnershipManifest(targetDir, manifest);

      rollback.cleanup();

      const warningPrefix = isAmpAntigravityCollision
        ? "amp dan antigravity berbagi direktori .agents/skills/. Keduanya akan membaca skill yang sama. "
        : "";

      return {
        status: collision.exists ? "updated" : "installed",
        targetDir,
        scope,
        agent: this.agentId,
        message: collision.exists
          ? `${warningPrefix}Skill updated at '${targetDir}'.`
          : `Skill installed to '${targetDir}'.`,
        sha256: canonicalSha256,
        manifest,
      };
    } catch (err) {
      rollback.restore();
      rollback.cleanup();
      throw err;
    }
  }

  /**
   * Updates an existing installation with the latest canonical skill.
   */
  public update(options: AdapterInstallOptions): AdapterOperationResult {
    const {
      scope,
      workspaceRoot,
      homeDir = os.homedir(),
      dryRun = false,
    } = options;

    const targetDir = this.resolveTargetDir({ scope, workspaceRoot, homeDir });

    // Check ownership (allow shared ownership between amp and antigravity)
    const isSharedAmpAntigravity =
      scope === "project" &&
      (this.agentId === "amp" || this.agentId === "antigravity");

    let ownershipCheck = validateOwnership(targetDir, {
      expectedAgent: this.agentId,
    });

    if (!ownershipCheck.isValid && isSharedAmpAntigravity) {
      const altAgent = this.agentId === "amp" ? "antigravity" : "amp";
      const altCheck = validateOwnership(targetDir, {
        expectedAgent: altAgent,
      });
      if (altCheck.isValid) {
        ownershipCheck = altCheck;
      }
    }

    if (!ownershipCheck.isValid) {
      return {
        status: "ownership_conflict",
        targetDir,
        scope,
        agent: this.agentId,
        message: ownershipCheck.errorReason ?? "Ownership validation failed. Cannot update.",
      };
    }

    // Delegate to install with overwrite
    return this.install({
      ...options,
      overwrite: true,
      dryRun,
    });
  }

  /**
   * Removes a previously installed skill from the target scope.
   */
  public uninstall(options: AdapterUninstallOptions): AdapterOperationResult {
    const {
      scope,
      workspaceRoot,
      homeDir = os.homedir(),
      dryRun = false,
    } = options;

    const targetDir = this.resolveTargetDir({ scope, workspaceRoot, homeDir });

    if (!fs.existsSync(targetDir)) {
      return {
        status: "not_found",
        targetDir,
        scope,
        agent: this.agentId,
        message: `No installation found at '${targetDir}'.`,
      };
    }

    try {
      assertNoSymlinkOrJunction(targetDir);
    } catch (err: any) {
      if (
        err instanceof PathSafetyError &&
        (err.code === "SYMLINK_REJECTED" || err.code === "PATH_TRAVERSAL")
      ) {
        return {
          status: "cancelled",
          targetDir,
          scope,
          agent: this.agentId,
          message: err.message,
        };
      }
      throw err;
    }

    // Validate ownership before deletion (allow shared between amp and antigravity)
    const isSharedAmpAntigravity =
      scope === "project" &&
      (this.agentId === "amp" || this.agentId === "antigravity");

    let ownershipCheck = validateOwnership(targetDir, {
      expectedAgent: this.agentId,
    });

    if (!ownershipCheck.isValid && isSharedAmpAntigravity) {
      const altAgent = this.agentId === "amp" ? "antigravity" : "amp";
      const altCheck = validateOwnership(targetDir, {
        expectedAgent: altAgent,
      });
      if (altCheck.isValid) {
        ownershipCheck = altCheck;
      }
    }

    if (!ownershipCheck.isValid) {
      return {
        status: "ownership_conflict",
        targetDir,
        scope,
        agent: this.agentId,
        message: ownershipCheck.errorReason ?? "Ownership validation failed. Cannot uninstall.",
      };
    }

    if (dryRun) {
      return {
        status: "dry_run",
        targetDir,
        scope,
        agent: this.agentId,
        message: `Dry run: Would remove '${targetDir}'.`,
      };
    }

    // Check for non-safe-change files (files not tracked in manifest)
    const manifest = ownershipCheck.manifest!;
    const trackedFiles = new Set(
      Object.keys(manifest.files).map((f) => f.replace(/\//g, path.sep))
    );
    trackedFiles.add(".safe-change-manifest.json");

    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    const foreignEntries = entries.filter((e) => !trackedFiles.has(e.name));
    if (foreignEntries.length > 0) {
      return {
        status: "collision_detected",
        targetDir,
        scope,
        agent: this.agentId,
        message: `Cannot uninstall: Target directory contains files not owned by safe-change: ${foreignEntries.map((e) => e.name).join(", ")}.`,
      };
    }

    // Proceed with removal
    const rollback = new RollbackSession({ targetDir });
    try {
      rollback.backup();
      fs.rmSync(targetDir, { recursive: true, force: true });

      if (fs.existsSync(targetDir)) {
        throw new Error(`Failed to remove target directory: '${targetDir}'.`);
      }

      rollback.cleanup();

      return {
        status: "uninstalled",
        targetDir,
        scope,
        agent: this.agentId,
        message: `Successfully uninstalled from '${targetDir}'.`,
      };
    } catch (err) {
      rollback.restore();
      rollback.cleanup();
      throw err;
    }
  }

  /**
   * Reports the current installation status and drift.
   */
  public status(options: AdapterStatusOptions): AdapterStatus {
    const { scope, workspaceRoot, homeDir = os.homedir() } = options;

    const targetDir = this.resolveTargetDir({ scope, workspaceRoot, homeDir });

    let canonicalSha256: string | null = null;
    let profileSha256: string | null = null;
    let composedSha256: string | null = null;
    if (fs.existsSync(this.canonicalSkillPath)) {
      try {
        const composition = this.composeSkill();
        canonicalSha256 = composition.canonicalSha256;
        profileSha256 = composition.profileSha256;
        composedSha256 = composition.composedSha256;
      } catch {
        canonicalSha256 = null;
        profileSha256 = null;
        composedSha256 = null;
      }
    }

    if (!fs.existsSync(targetDir)) {
      return {
        installed: false,
        scope,
        agent: this.agentId,
        targetDir,
        manifest: null,
        hasDrift: false,
        canonicalSha256,
        profileSha256,
        composedSha256,
        installedSha256: null,
      };
    }

    const manifest = readOwnershipManifest(targetDir);
    let installedSha256: string | null = null;
    const skillPath = path.join(targetDir, SKILL_RELATIVE_PATH);
    if (fs.existsSync(skillPath)) {
      try {
        assertNoSymlinkOrJunction(skillPath);
        installedSha256 = fileSha256(skillPath);
      } catch {
        installedSha256 = null;
      }
    }

    let hasDrift = false;
    let driftDetails: { modifiedFiles: string[]; missingFiles: string[] } | undefined;

    if (composedSha256 && installedSha256 && composedSha256 !== installedSha256) {
      hasDrift = true;
    }

    if (manifest) {
      const integrity = verifyManifestIntegrity(targetDir, manifest);
      if (!integrity.matches) {
        hasDrift = true;
        driftDetails = {
          modifiedFiles: integrity.modifiedFiles,
          missingFiles: integrity.missingFiles,
        };
      }
    }

    return {
      installed: true,
      scope,
      agent: this.agentId,
      targetDir,
      manifest,
      hasDrift,
      driftDetails,
      canonicalSha256,
      profileSha256,
      composedSha256,
      installedSha256,
    };
  }
}
