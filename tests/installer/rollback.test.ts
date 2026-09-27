import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  RollbackSession,
  executeWithRollback,
  RollbackError,
} from "../../src/installer/core/rollback.js";

describe("installer/core/rollback", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "safe-change-test-rollback-"));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // cleanup suppression
      }
    }
  });

  it("should create backup and clean up after successful operation", () => {
    const targetDir = path.join(tempDir, "target-dir");
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, "original.txt"), "original-content");

    const session = new RollbackSession({ targetDir });
    expect(session.backup()).toBe(true);
    expect(session.isBackedUp()).toBe(true);
    expect(fs.existsSync(session.backupDir)).toBe(true);

    session.cleanup();
    expect(fs.existsSync(session.backupDir)).toBe(false);
    expect(fs.readFileSync(path.join(targetDir, "original.txt"), "utf8")).toBe("original-content");
  });

  it("should restore original content when restore() is explicitly invoked", () => {
    const targetDir = path.join(tempDir, "target-restore-dir");
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, "state.txt"), "before");

    const session = new RollbackSession({ targetDir });
    session.backup();

    // Mutate targetDir (partial write / corrupted state)
    fs.writeFileSync(path.join(targetDir, "state.txt"), "corrupted-during-operation");
    fs.writeFileSync(path.join(targetDir, "partial.tmp"), "stray");

    // Restore
    expect(session.restore()).toBe(true);
    expect(session.isRestored()).toBe(true);

    expect(fs.readFileSync(path.join(targetDir, "state.txt"), "utf8")).toBe("before");
    expect(fs.existsSync(path.join(targetDir, "partial.tmp"))).toBe(false);

    session.cleanup();
    expect(fs.existsSync(session.backupDir)).toBe(false);
  });

  it("should handle executeWithRollback restoring state when callback throws", () => {
    const targetDir = path.join(tempDir, "auto-rollback-target");
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, "data.txt"), "intact");

    expect(() => {
      executeWithRollback(targetDir, () => {
        fs.writeFileSync(path.join(targetDir, "data.txt"), "ruined");
        throw new Error("Simulated failure during installation step");
      });
    }).toThrowError(/Simulated failure/);

    // State should be restored to "intact"
    expect(fs.readFileSync(path.join(targetDir, "data.txt"), "utf8")).toBe("intact");
  });

  it("should handle target that does not exist before backup gracefully", () => {
    const targetDir = path.join(tempDir, "non-existent-target");

    const session = new RollbackSession({ targetDir });
    expect(session.backup()).toBe(false);
    expect(session.isBackedUp()).toBe(false);
    expect(session.restore()).toBe(false);

    session.cleanup();
  });

  it("should throw RollbackError when session is reused after disposal", () => {
    const targetDir = path.join(tempDir, "disposed-target");
    const session = new RollbackSession({ targetDir });
    session.cleanup();

    expect(() => session.backup()).toThrowError(RollbackError);
  });
});
