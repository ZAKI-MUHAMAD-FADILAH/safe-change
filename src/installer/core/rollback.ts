import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { assertNoSymlinkOrJunction } from "./path-safety.js";

export class RollbackError extends Error {
  public readonly code: string;
  public readonly targetDir: string;

  constructor(message: string, code: string, targetDir: string) {
    super(message);
    this.name = "RollbackError";
    this.code = code;
    this.targetDir = targetDir;
  }
}

// Registry of active rollback sessions for cleanup
const activeRollbackSessions = new Set<RollbackSession>();
let signalsRegistered = false;

function registerRollbackSignals(): void {
  if (signalsRegistered) {
    return;
  }
  signalsRegistered = true;

  const onSignal = () => {
    for (const session of activeRollbackSessions) {
      try {
        session.restore();
        session.cleanup();
      } catch {
        // Best effort during termination
      }
    }
    activeRollbackSessions.clear();
  };

  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
}

export interface RollbackOptions {
  targetDir: string;
  backupParentDir?: string;
}

/**
 * Manages backup, restore, and isolated temporary storage of existing directories.
 */
export class RollbackSession {
  public readonly targetDir: string;
  public readonly backupDir: string;
  private hasBackup = false;
  private restored = false;
  private disposed = false;

  constructor(options: RollbackOptions) {
    this.targetDir = path.resolve(options.targetDir);
    const parentDir = options.backupParentDir ?? path.dirname(this.targetDir);

    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.backupDir = path.join(parentDir, `.rollback-safe-change-${uniqueId}`);

    registerRollbackSignals();
    activeRollbackSessions.add(this);
  }

  /**
   * Backs up the target directory to backupDir if targetDir exists.
   * Returns true if backup was created, false if target did not exist.
   */
  public backup(): boolean {
    this.ensureNotDisposed();

    if (!fs.existsSync(this.targetDir)) {
      this.hasBackup = false;
      return false;
    }

    assertNoSymlinkOrJunction(this.targetDir);

    try {
      fs.cpSync(this.targetDir, this.backupDir, {
        recursive: true,
        dereference: false,
        errorOnExist: true,
      });
      this.hasBackup = true;
      return true;
    } catch (err: any) {
      throw new RollbackError(
        `Failed to create rollback backup for '${this.targetDir}': ${err?.message}`,
        "BACKUP_FAILED",
        this.targetDir
      );
    }
  }

  /**
   * Restores target directory from backupDir if a backup exists.
   */
  public restore(): boolean {
    this.ensureNotDisposed();

    if (!this.hasBackup || !fs.existsSync(this.backupDir)) {
      return false;
    }

    try {
      // Remove whatever is in targetDir currently
      if (fs.existsSync(this.targetDir)) {
        fs.rmSync(this.targetDir, { recursive: true, force: true });
      }

      fs.cpSync(this.backupDir, this.targetDir, {
        recursive: true,
        dereference: false,
      });

      this.restored = true;
      return true;
    } catch (err: any) {
      throw new RollbackError(
        `Failed to restore target directory from backup '${this.backupDir}': ${err?.message}`,
        "RESTORE_FAILED",
        this.targetDir
      );
    }
  }

  /**
   * Cleans up the temporary backup directory.
   */
  public cleanup(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    try {
      if (fs.existsSync(this.backupDir)) {
        fs.rmSync(this.backupDir, { recursive: true, force: true });
      }
    } catch {
      // Best effort cleanup
    } finally {
      activeRollbackSessions.delete(this);
    }
  }

  public isBackedUp(): boolean {
    return this.hasBackup;
  }

  public isRestored(): boolean {
    return this.restored;
  }

  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new RollbackError(
        "Rollback session has already been cleaned up and disposed.",
        "SESSION_DISPOSED",
        this.targetDir
      );
    }
  }
}

/**
 * Executes a function within an automatic rollback context.
 * If fn throws, restores targetDir from backup and re-throws the error.
 * If fn succeeds, cleans up backup.
 */
export function executeWithRollback<T>(
  targetDir: string,
  fn: (session: RollbackSession) => T
): T {
  const session = new RollbackSession({ targetDir });

  try {
    session.backup();
    const result = fn(session);
    session.cleanup();
    return result;
  } catch (err) {
    try {
      session.restore();
    } catch (restoreErr) {
      // Log or retain restore error if needed
    }
    session.cleanup();
    throw err;
  }
}
