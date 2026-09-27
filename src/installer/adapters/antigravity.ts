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
} from "../core/ownership.js";
import { InstallationTransaction } from "../core/transaction.js";
import { RollbackSession } from "../core/rollback.js";

const AGENT_NAME = "antigravity";
const DISPLAY_NAME = "Antigravity (Google DeepMind)";
const SKILL_RELATIVE_PATH = "SKILL.md";
const PROJECT_TARGET_PREFIX = path.join(".agents", "skills", "safe-change");
const GLOBAL_TARGET_PREFIX = path.join(".gemini", "config", "skills", "safe-change");

/**
 * Computes the SHA-256 digest of a file.
 */
function fileSha256(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Reads the package version from the nearest package.json.
 */
function readPackageVersion(): string {
  try {
    // Walk up from CURRENT_DIR to find package.json
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

export class AntigravityAdapter implements AgentAdapter {
  public readonly agentName = AGENT_NAME;
  public readonly displayName = DISPLAY_NAME;
  public readonly canonicalSkillPath: string;

  constructor(canonicalSkillPath?: string) {
    if (canonicalSkillPath) {
      this.canonicalSkillPath = path.resolve(canonicalSkillPath);
    } else {
      // Default: resolve relative to repository root
      // Walk up from CURRENT_DIR to find skills/safe-change/SKILL.md
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

  public resolveTargetDir(options: {
    scope: InstallerScope;
    workspaceRoot?: string;
    homeDir?: string;
  }): string {
    const { scope, workspaceRoot, homeDir = os.homedir() } = options;

    if (scope === "project") {
      if (!workspaceRoot) {
        throw new Error(
          "Project scope requires a valid workspaceRoot."
        );
      }
      return path.resolve(workspaceRoot, PROJECT_TARGET_PREFIX);
    }

    return path.resolve(homeDir, GLOBAL_TARGET_PREFIX);
  }

  public install(options: AdapterInstallOptions): AdapterOperationResult {
    const {
      scope,
      workspaceRoot,
      homeDir = os.homedir(),
      overwrite = false,
      dryRun = false,
    } = options;

    const targetDir = this.resolveTargetDir({ scope, workspaceRoot, homeDir });
    const skillTargetPath = path.join(targetDir, SKILL_RELATIVE_PATH);

    // Validate canonical source exists
    if (!fs.existsSync(this.canonicalSkillPath)) {
      return {
        status: "cancelled",
        targetDir,
        scope,
        agent: AGENT_NAME,
        message: `Canonical skill source not found: '${this.canonicalSkillPath}'.`,
      };
    }

    assertNoSymlinkOrJunction(this.canonicalSkillPath);
    const canonicalSha256 = fileSha256(this.canonicalSkillPath);

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
          agent: AGENT_NAME,
          message: err.message,
        };
      }
      throw err;
    }

    // Collision detection
    const collision = inspectCollision({
      targetPath: targetDir,
      expectedType: "directory",
      sourceSkillFile: this.canonicalSkillPath,
      relativeSkillFileName: SKILL_RELATIVE_PATH,
    });

    const writeDecision = canSafelyWrite(collision, { overwrite });
    if (!writeDecision.canWrite) {
      return {
        status: collision.state === "symlink_or_junction"
          ? "cancelled"
          : collision.state === "ownership_conflict"
            ? "ownership_conflict"
            : "collision_detected",
        targetDir,
        scope,
        agent: AGENT_NAME,
        message: writeDecision.reason ?? collision.message,
        collision,
      };
    }

    // If content is already identical and safe-change owned, report up_to_date
    if (collision.isIdentical && collision.ownership.isSafeChangeOwned) {
      return {
        status: "up_to_date",
        targetDir,
        scope,
        agent: AGENT_NAME,
        message: "Skill is already installed and up to date.",
        sha256: canonicalSha256,
      };
    }

    // Dry run: report what would be done
    if (dryRun) {
      return {
        status: "dry_run",
        targetDir,
        scope,
        agent: AGENT_NAME,
        message: `Dry run: Would install skill to '${targetDir}'. SHA-256: ${canonicalSha256}.`,
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
        tx.stageCopy(this.canonicalSkillPath, SKILL_RELATIVE_PATH);
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

      // Write ownership manifest
      const manifest = createOwnershipManifest({
        version: readPackageVersion(),
        agent: AGENT_NAME,
        scope,
        targetDir,
        installedFiles: [SKILL_RELATIVE_PATH],
      });
      writeOwnershipManifest(targetDir, manifest);

      rollback.cleanup();

      return {
        status: collision.exists ? "updated" : "installed",
        targetDir,
        scope,
        agent: AGENT_NAME,
        message: collision.exists
          ? `Skill updated at '${targetDir}'.`
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

  public update(options: AdapterInstallOptions): AdapterOperationResult {
    const {
      scope,
      workspaceRoot,
      homeDir = os.homedir(),
      dryRun = false,
    } = options;

    const targetDir = this.resolveTargetDir({ scope, workspaceRoot, homeDir });

    // Check ownership
    const ownershipCheck = validateOwnership(targetDir, {
      expectedAgent: AGENT_NAME,
    });

    if (!ownershipCheck.isValid) {
      return {
        status: "ownership_conflict",
        targetDir,
        scope,
        agent: AGENT_NAME,
        message: ownershipCheck.errorReason
          ?? "Ownership validation failed. Cannot update.",
      };
    }

    // Delegate to install with overwrite
    return this.install({
      ...options,
      overwrite: true,
      dryRun,
    });
  }

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
        agent: AGENT_NAME,
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
          agent: AGENT_NAME,
          message: err.message,
        };
      }
      throw err;
    }

    // Validate ownership before deletion
    const ownershipCheck = validateOwnership(targetDir, {
      expectedAgent: AGENT_NAME,
    });

    if (!ownershipCheck.isValid) {
      return {
        status: "ownership_conflict",
        targetDir,
        scope,
        agent: AGENT_NAME,
        message: ownershipCheck.errorReason
          ?? "Ownership validation failed. Cannot uninstall.",
      };
    }

    if (dryRun) {
      return {
        status: "dry_run",
        targetDir,
        scope,
        agent: AGENT_NAME,
        message: `Dry run: Would remove '${targetDir}'.`,
      };
    }

    // Check for non-safe-change files (files not tracked in manifest)
    const manifest = ownershipCheck.manifest!;
    const trackedFiles = new Set(
      Object.keys(manifest.files).map((f) =>
        f.replace(/\//g, path.sep)
      )
    );
    // Also consider manifest itself
    trackedFiles.add(".safe-change-manifest.json");

    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    const foreignEntries = entries.filter((e) => !trackedFiles.has(e.name));
    if (foreignEntries.length > 0) {
      return {
        status: "collision_detected",
        targetDir,
        scope,
        agent: AGENT_NAME,
        message: `Cannot uninstall: Target directory contains files not owned by safe-change: ${foreignEntries.map((e) => e.name).join(", ")}.`,
      };
    }

    // Proceed with removal
    const rollback = new RollbackSession({ targetDir });
    try {
      rollback.backup();
      fs.rmSync(targetDir, { recursive: true, force: true });

      if (fs.existsSync(targetDir)) {
        throw new Error(
          `Failed to remove target directory: '${targetDir}'.`
        );
      }

      rollback.cleanup();

      return {
        status: "uninstalled",
        targetDir,
        scope,
        agent: AGENT_NAME,
        message: `Successfully uninstalled from '${targetDir}'.`,
      };
    } catch (err) {
      rollback.restore();
      rollback.cleanup();
      throw err;
    }
  }

  public status(options: AdapterStatusOptions): AdapterStatus {
    const {
      scope,
      workspaceRoot,
      homeDir = os.homedir(),
    } = options;

    const targetDir = this.resolveTargetDir({ scope, workspaceRoot, homeDir });

    // Canonical SHA-256
    let canonicalSha256: string | null = null;
    if (fs.existsSync(this.canonicalSkillPath)) {
      try {
        assertNoSymlinkOrJunction(this.canonicalSkillPath);
        canonicalSha256 = fileSha256(this.canonicalSkillPath);
      } catch {
        canonicalSha256 = null;
      }
    }

    if (!fs.existsSync(targetDir)) {
      return {
        installed: false,
        scope,
        agent: AGENT_NAME,
        targetDir,
        manifest: null,
        hasDrift: false,
        canonicalSha256,
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

    // Check content drift vs canonical
    if (canonicalSha256 && installedSha256 && canonicalSha256 !== installedSha256) {
      hasDrift = true;
    }

    // Check manifest integrity drift
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
      agent: AGENT_NAME,
      targetDir,
      manifest,
      hasDrift,
      driftDetails,
      canonicalSha256,
      installedSha256,
    };
  }
}
