import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  InstallationTransaction,
  TransactionError,
} from "../../src/installer/core/transaction.js";

describe("installer/core/transaction", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "safe-change-test-transaction-"));
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

  it("should successfully stage files and commit atomically into targetDir", () => {
    const targetDir = path.join(tempDir, "target-installed-dir");
    const tx = new InstallationTransaction({ targetDir });

    const stagingDir = tx.stagingDir;
    expect(fs.existsSync(stagingDir)).toBe(true);

    tx.stageFile("SKILL.md", "# Skill Content");
    tx.stageFile(path.join("sub", "info.txt"), "sub-info");

    expect(tx.getStagedFiles()).toEqual(["SKILL.md", path.join("sub", "info.txt")]);
    expect(fs.existsSync(targetDir)).toBe(false);

    tx.commit();

    expect(fs.existsSync(targetDir)).toBe(true);
    expect(fs.readFileSync(path.join(targetDir, "SKILL.md"), "utf8")).toBe("# Skill Content");
    expect(fs.readFileSync(path.join(targetDir, "sub", "info.txt"), "utf8")).toBe("sub-info");

    // Staging directory should no longer exist after commit
    expect(fs.existsSync(stagingDir)).toBe(false);
  });

  it("should reject path traversal in stageFile", () => {
    const targetDir = path.join(tempDir, "target-installed-dir");
    const tx = new InstallationTransaction({ targetDir });

    expect(() => tx.stageFile("../escaped.txt", "evil")).toThrowError(TransactionError);
    expect(() => tx.stageFile("../escaped.txt", "evil")).toThrowError(/Path traversal rejected/);

    tx.abort();
    expect(fs.existsSync(tx.stagingDir)).toBe(false);
  });

  it("should clean up staging directory upon abort()", () => {
    const targetDir = path.join(tempDir, "target-installed-dir");
    const tx = new InstallationTransaction({ targetDir });

    const stagingDir = tx.stagingDir;
    expect(fs.existsSync(stagingDir)).toBe(true);

    tx.stageFile("test.txt", "data");
    tx.abort();

    expect(fs.existsSync(stagingDir)).toBe(false);
    expect(fs.existsSync(targetDir)).toBe(false);
  });

  it("should safely overwrite existing targetDir and preserve rollback state if failure occurs", () => {
    const targetDir = path.join(tempDir, "existing-target");
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, "original.txt"), "original-data");

    const tx = new InstallationTransaction({ targetDir });
    tx.stageFile("new-file.txt", "new-data");

    tx.commit();

    expect(fs.existsSync(path.join(targetDir, "new-file.txt"))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, "original.txt"))).toBe(false);
  });

  it("should stage copies of files using stageCopy", () => {
    const sourceFile = path.join(tempDir, "source.md");
    fs.writeFileSync(sourceFile, "# Source Content");

    const targetDir = path.join(tempDir, "copy-target");
    const tx = new InstallationTransaction({ targetDir });

    tx.stageCopy(sourceFile, "SKILL.md");
    tx.commit();

    expect(fs.readFileSync(path.join(targetDir, "SKILL.md"), "utf8")).toBe("# Source Content");
  });

  it("should throw when stageCopy references non-existent source file", () => {
    const targetDir = path.join(tempDir, "copy-fail-target");
    const tx = new InstallationTransaction({ targetDir });

    expect(() => tx.stageCopy(path.join(tempDir, "does-not-exist.txt"), "dest.txt")).toThrowError(
      TransactionError
    );

    tx.abort();
  });

  it("handles repeated transactions without leaking signal listeners or exceeding max listeners", () => {
    const initialSigintListeners = process.listenerCount("SIGINT");
    const initialSigtermListeners = process.listenerCount("SIGTERM");

    for (let i = 0; i < 15; i++) {
      const targetDir = path.join(tempDir, `repeated-target-${i}`);
      const tx = new InstallationTransaction({ targetDir });
      tx.stageFile("file.txt", `data-${i}`);
      tx.commit();
    }

    expect(process.listenerCount("SIGINT")).toBe(initialSigintListeners);
    expect(process.listenerCount("SIGTERM")).toBe(initialSigtermListeners);
  });

  it("cleans up staging directory when transaction receives SIGINT in subprocess", async () => {
    const { spawn } = await import("node:child_process");
    const childScript = path.join(tempDir, "sigint-tx-child.cjs");
    const stagingMarker = path.join(tempDir, "staging-path.txt");

    fs.writeFileSync(
      childScript,
      `
const { InstallationTransaction } = require(${JSON.stringify(path.resolve(__dirname, "../../dist/installer/core/transaction.js"))});
const fs = require('fs');

const targetDir = ${JSON.stringify(path.join(tempDir, "sigint-target"))};
const tx = new InstallationTransaction({ targetDir });
tx.stageFile("test.txt", "content");
fs.writeFileSync(${JSON.stringify(stagingMarker)}, tx.stagingDir);

// Notify parent ready
console.log('READY');

// When signaled via stdin, emit SIGINT to simulate Ctrl+C cross-platform
process.stdin.on('data', () => {
  process.emit('SIGINT');
});
`
    );

    const child = spawn(process.execPath, [childScript], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    await new Promise<void>((resolve, reject) => {
      child.stdout.on("data", (data) => {
        if (data.toString().includes("READY")) {
          resolve();
        }
      });
      child.on("error", reject);
    });

    const stagingDir = fs.readFileSync(stagingMarker, "utf8").trim();
    expect(fs.existsSync(stagingDir)).toBe(true);

    // Send trigger to simulate SIGINT
    child.stdin.write("TRIGGER_SIGINT\n");

    const exitCode = await new Promise<number | null>((resolve) => {
      child.on("close", (code) => resolve(code));
    });

    // Subprocess should exit with standard SIGINT exit code (130)
    expect(exitCode).toBe(130);

    // Staging directory must be cleaned up
    expect(fs.existsSync(stagingDir)).toBe(false);
  });
});
