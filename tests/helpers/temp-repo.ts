// ---------------------------------------------------------------------------
// Test helper -- Create temporary Git repositories for testing
// ---------------------------------------------------------------------------

import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface TempRepo {
  readonly path: string;
  writeFile(relativePath: string, content: string): Promise<void>;
  git(...args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  createConfig(checks: Array<{ name: string; executable: string; args: string[]; timeout?: number }>): Promise<void>;
  cleanup(): Promise<void>;
}

/**
 * Create a temporary Git repository for testing.
 * Initializes with git init and a configurable initial commit.
 */
export async function createTempRepo(options?: {
  initialCommit?: boolean;
}): Promise<TempRepo> {
  const path = await mkdtemp(join(tmpdir(), "safe-change-test-"));
  const shouldCommit = options?.initialCommit !== false;

  const repo: TempRepo = {
    path,

    async writeFile(relativePath: string, content: string): Promise<void> {
      const fullPath = join(path, relativePath);
      const dir = join(fullPath, "..");
      await mkdir(dir, { recursive: true });
      await writeFile(fullPath, content, "utf-8");
    },

    async git(...args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
      return new Promise((resolve) => {
        execFile(
          "git",
          args,
          { cwd: path, maxBuffer: 10 * 1024 * 1024, encoding: "utf-8" },
          (error, stdout, stderr) => {
            if (error && typeof error.code === "number") {
              resolve({ exitCode: error.code, stdout: stdout ?? "", stderr: stderr ?? "" });
            } else if (error) {
              resolve({ exitCode: 128, stdout: stdout ?? "", stderr: stderr ?? "" });
            } else {
              resolve({ exitCode: 0, stdout: stdout ?? "", stderr: stderr ?? "" });
            }
          }
        );
      });
    },

    async createConfig(checks): Promise<void> {
      const config = {
        version: 1,
        checks: checks.map((c) => ({
          name: c.name,
          executable: c.executable,
          args: c.args,
          timeout: c.timeout ?? 60,
        })),
      };
      await writeFile(
        join(path, ".safe-change.json"),
        JSON.stringify(config, null, 2),
        "utf-8"
      );
    },

    async cleanup(): Promise<void> {
      try {
        await rm(path, { recursive: true, force: true });
      } catch {
        // Best effort cleanup
      }
    },
  };

  // Initialize git repo
  await repo.git("init");
  await repo.git("config", "user.email", "test@safe-change.local");
  await repo.git("config", "user.name", "Test");

  if (shouldCommit) {
    // Create an initial commit so HEAD exists
    await repo.writeFile(".gitkeep", "");
    await repo.git("add", ".gitkeep");
    await repo.git("commit", "-m", "initial commit");
  }

  return repo;
}
