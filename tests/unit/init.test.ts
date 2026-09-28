import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { detectProjectChecks, runInit } from "../../src/commands/init.js";
import { ExitCodes } from "../../src/types/index.js";

const execFileAsync = promisify(execFile);

describe("init command", () => {
  let tempDir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sc-init-test-"));
    await execFileAsync("git", ["init"], { cwd: tempDir });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  it("auto-detects npm test, build, and lint from package.json", async () => {
    const pkg = {
      name: "demo",
      scripts: {
        test: "vitest run",
        build: "tsc",
        lint: "eslint .",
      },
    };
    await writeFile(join(tempDir, "package.json"), JSON.stringify(pkg));

    const detected = await detectProjectChecks(tempDir);
    expect(detected.ecosystem).toContain("Node.js");
    expect(detected.checks).toHaveLength(3);
    expect(detected.checks[0]?.name).toBe("test");
    expect(detected.checks[1]?.name).toBe("build");
    expect(detected.checks[2]?.name).toBe("lint");
  });

  it("auto-detects Rust project from Cargo.toml", async () => {
    await writeFile(join(tempDir, "Cargo.toml"), '[package]\nname = "demo"\n');

    const detected = await detectProjectChecks(tempDir);
    expect(detected.ecosystem).toContain("Rust");
    expect(detected.checks.map((c) => c.name)).toEqual(["test", "check"]);
  });

  it("creates .safe-change.json and adds .safe-change/ to .gitignore", async () => {
    const pkg = {
      name: "demo",
      scripts: { test: "jest" },
    };
    await writeFile(join(tempDir, "package.json"), JSON.stringify(pkg));
    await writeFile(join(tempDir, ".gitignore"), "node_modules/\n");

    process.chdir(tempDir);
    const code = await runInit({ format: "json" });
    expect(code).toBe(ExitCodes.OK);

    const configRaw = await readFile(join(tempDir, ".safe-change.json"), "utf-8");
    const config = JSON.parse(configRaw);
    expect(config.version).toBe(1);
    expect(config.checks).toHaveLength(1);
    expect(config.checks[0].name).toBe("test");

    const gitignoreContent = await readFile(join(tempDir, ".gitignore"), "utf-8");
    expect(gitignoreContent).toContain(".safe-change/");
  });

  it("aborts with COLLISION_DETECTED if .safe-change.json exists without overwrite", async () => {
    await writeFile(join(tempDir, ".safe-change.json"), "{}");

    process.chdir(tempDir);
    const code = await runInit({ format: "json" });
    expect(code).toBe(ExitCodes.COLLISION_DETECTED);
  });

  it("succeeds when overwrite is true", async () => {
    await writeFile(join(tempDir, ".safe-change.json"), "{}");

    process.chdir(tempDir);
    const code = await runInit({ format: "json", overwrite: true });
    expect(code).toBe(ExitCodes.OK);
  });
});
