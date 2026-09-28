import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

async function main() {
  const repoRoot = resolve(".");
  const isWin = process.platform === "win32";
  const tempProject = await mkdtemp(join(tmpdir(), "sc-tarball-smoke-"));

  console.log(`Testing tarball installation in: ${tempProject}`);
  let generatedTarball = null;

  try {
    // 0. Pack tarball
    console.log("Packing tarball with npm pack...");
    const packOutput = execFileSync(isWin ? "npm.cmd" : "npm", ["pack"], {
      cwd: repoRoot,
      encoding: "utf-8",
      shell: isWin,
    });
    const tarballFileName = packOutput.trim().split(/\r?\n/).pop().trim();
    const tarballPath = resolve(repoRoot, tarballFileName);
    generatedTarball = tarballPath;

    // 1. Initialize temporary package
    await writeFile(
      join(tempProject, "package.json"),
      JSON.stringify({ name: "smoke-test-project", version: "1.0.0" })
    );

    // 2. Install packed tarball
    console.log(`Installing tarball from ${tarballPath}...`);
    execFileSync(isWin ? "npm.cmd" : "npm", ["install", tarballPath, "--omit=optional"], {
      cwd: tempProject,
      stdio: "inherit",
      shell: isWin,
    });

    const binName = isWin ? "safe-change.cmd" : "safe-change";
    const binPath = join(tempProject, "node_modules", ".bin", binName);

    // 3. safe-change --version
    console.log("Testing safe-change --version...");
    const versionOutput = execFileSync(binPath, ["--version"], {
      cwd: tempProject,
      encoding: "utf-8",
      shell: isWin,
    });
    console.log(`Output: ${versionOutput.trim()}`);
    if (!versionOutput.includes("0.3.0")) {
      throw new Error(`Unexpected version: ${versionOutput}`);
    }

    // 4. Initialize git repo in temp project
    execFileSync("git", ["init"], { cwd: tempProject, stdio: "ignore" });
    execFileSync("git", ["config", "user.name", "SmokeTest"], { cwd: tempProject, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "smoke@test.local"], { cwd: tempProject, stdio: "ignore" });

    // 5. safe-change init
    console.log("Testing safe-change init...");
    const initOutput = execFileSync(binPath, ["init"], {
      cwd: tempProject,
      encoding: "utf-8",
      shell: isWin,
    });
    console.log(`Init output:\n${initOutput.trim()}`);

    // Commit baseline file
    await writeFile(join(tempProject, "hello.txt"), "world");
    execFileSync("git", ["add", "."], { cwd: tempProject, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "initial"], { cwd: tempProject, stdio: "ignore" });

    // 6. safe-change save
    console.log("Testing safe-change save...");
    const saveOutput = execFileSync(binPath, ["save", "smoke baseline"], {
      cwd: tempProject,
      encoding: "utf-8",
      shell: isWin,
    });
    console.log(`Save output:\n${saveOutput.trim()}`);

    // 7. safe-change check
    console.log("Testing safe-change check...");
    const checkOutput = execFileSync(binPath, ["check"], {
      cwd: tempProject,
      encoding: "utf-8",
      shell: isWin,
    });
    console.log(`Check output:\n${checkOutput.trim()}`);

    console.log("ALL SMOKE TESTS PASSED SUCCESSFULLY!");
  } finally {
    try {
      await rm(tempProject, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
    if (generatedTarball) {
      try {
        await rm(generatedTarball, { force: true });
      } catch {
        // Best effort cleanup
      }
    }
  }
}

main().catch((err) => {
  console.error("SMOKE TEST FAILED:", err);
  process.exit(1);
});
