import { readFileSync, existsSync, readdirSync, statSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ACTIVE_TARGETS = [
  "linux-x64-gnu",
  "win32-x64-msvc",
  "darwin-arm64",
  "darwin-x64",
];

export async function pollPackageVisibility(pkgName, version, registry = "https://registry.npmjs.org", maxAttempts = 12, delayMs = 5000) {
  const encodedName = pkgName.startsWith("@")
    ? `@${encodeURIComponent(pkgName.slice(1))}`
    : encodeURIComponent(pkgName);

  const url = `${registry.replace(/\/$/, "")}/${encodedName}/${version}`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
      if (res.status === 200) {
        return true;
      }
    } catch {
      // Ignore network blips during polling
    }
    if (attempt < maxAttempts) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, delayMs));
    }
  }
  return false;
}

export function copyNativeArtifacts(rootDir = resolve(".")) {
  const artifactsDir = join(rootDir, "artifacts");
  if (!existsSync(artifactsDir)) {
    return;
  }

  for (const target of ACTIVE_TARGETS) {
    const artifactFolder = join(artifactsDir, `native-binary-${target}`);
    const targetDir = join(rootDir, "npm", target);

    if (existsSync(artifactFolder)) {
      mkdirSync(targetDir, { recursive: true });
      const files = readdirSync(artifactFolder);
      const nodeFile = files.find((f) => f.endsWith(".node"));
      if (nodeFile) {
        const srcPath = join(artifactFolder, nodeFile);
        const destPath = join(targetDir, "safe-change-native.node");
        copyFileSync(srcPath, destPath);
        console.log(`Copied ${nodeFile} to npm/${target}/safe-change-native.node`);
      }
    }
  }
}

export function inspectPackageTarball(pkgDir) {
  const packJson = execSync("npm pack --json --dry-run", {
    cwd: pkgDir,
    encoding: "utf-8",
  });

  const parsed = JSON.parse(packJson);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`npm pack failed to produce metadata for ${pkgDir}`);
  }

  const pkgInfo = parsed[0];
  const fileNames = pkgInfo.files ? pkgInfo.files.map((f) => f.path) : [];

  return {
    name: pkgInfo.name,
    version: pkgInfo.version,
    filename: pkgInfo.filename,
    fileCount: pkgInfo.entryCount,
    unpackedSize: pkgInfo.unpackedSize,
    files: fileNames,
  };
}

export async function orchestrateNativePublish({
  rootDir = resolve("."),
  dryRun = false,
  registry = "https://registry.npmjs.org",
} = {}) {
  const pkgPath = join(rootDir, "package.json");
  const rootPkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const targetVersion = rootPkg.version;

  console.log(`\nStarting native platform publication phase for v${targetVersion}...`);
  if (dryRun) {
    console.log("[DRY-RUN] Publication steps will validate tarballs without executing npm publish.");
  }

  copyNativeArtifacts(rootDir);

  for (const target of ACTIVE_TARGETS) {
    const targetDir = join(rootDir, "npm", target);
    const subPkgJsonPath = join(targetDir, "package.json");
    if (!existsSync(subPkgJsonPath)) {
      throw new Error(`Missing package.json for target: ${target}`);
    }

    const subPkg = JSON.parse(readFileSync(subPkgJsonPath, "utf-8"));
    if (subPkg.version !== targetVersion) {
      throw new Error(
        `Version mismatch in npm/${target}/package.json: expected "${targetVersion}", found "${subPkg.version}".`
      );
    }

    const binaryPath = join(targetDir, "safe-change-native.node");
    if (!existsSync(binaryPath) || statSync(binaryPath).size === 0) {
      if (dryRun) {
        console.warn(`[DRY-RUN] Note: safe-change-native.node not present or empty in npm/${target}.`);
      } else {
        throw new Error(`Missing or empty native binary safe-change-native.node in npm/${target}.`);
      }
    }

    // Inspect tarball
    const tarballInfo = inspectPackageTarball(targetDir);
    console.log(`Validated package ${tarballInfo.name}@${tarballInfo.version} (${tarballInfo.fileCount} files, ${tarballInfo.unpackedSize} bytes).`);

    if (dryRun) {
      console.log(`[DRY-RUN] Platform package ${tarballInfo.name}@${tarballInfo.version} pack dry-run passed.`);
    } else {
      console.log(`Publishing ${tarballInfo.name}@${tarballInfo.version} to npm...`);
      execSync(`npm publish "${targetDir}" --access public --provenance`, {
        cwd: rootDir,
        stdio: "inherit",
        env: process.env,
      });

      console.log(`Verifying registry visibility for ${tarballInfo.name}@${tarballInfo.version}...`);
      const visible = await pollPackageVisibility(tarballInfo.name, targetVersion, registry);
      if (!visible) {
        throw new Error(`Package ${tarballInfo.name}@${tarballInfo.version} published but not visible on registry within timeout.`);
      }
      console.log(`Confirmed visible on registry: ${tarballInfo.name}@${tarballInfo.version}`);
    }
  }

  console.log(`\nNative platform publication phase completed successfully for all ${ACTIVE_TARGETS.length} targets.`);
}

export async function orchestrateRootPublish({
  rootDir = resolve("."),
  dryRun = false,
  registry = "https://registry.npmjs.org",
} = {}) {
  const pkgPath = join(rootDir, "package.json");
  const rootPkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const targetVersion = rootPkg.version;

  console.log(`\nStarting root package publication phase for safe-change@${targetVersion}...`);
  if (dryRun) {
    console.log("[DRY-RUN] Publication steps will validate tarballs without executing npm publish.");
  }

  // Pre-condition: verify all platform packages are on the registry
  console.log("Verifying prerequisite: native platform packages must be visible on npm...");
  for (const target of ACTIVE_TARGETS) {
    const pkgName = `@safe-change/${target}`;
    if (!dryRun) {
      const visible = await pollPackageVisibility(pkgName, targetVersion, registry, 3, 2000);
      if (!visible) {
        throw new Error(
          `Prerequisite failed: Native package ${pkgName}@${targetVersion} is not visible on npm! Cannot publish root package before native dependencies are live.`
        );
      }
      console.log(`Prerequisite verified: ${pkgName}@${targetVersion} is active on registry.`);
    } else {
      console.log(`[DRY-RUN] Skipping live registry visibility check for ${pkgName}@${targetVersion}.`);
    }
  }

  // Inspect root tarball
  const rootTarballInfo = inspectPackageTarball(rootDir);
  console.log(`Validated root package ${rootTarballInfo.name}@${rootTarballInfo.version} (${rootTarballInfo.fileCount} files, ${rootTarballInfo.unpackedSize} bytes).`);

  // Ensure key distribution files are present
  const requiredFiles = ["dist/index.js", "dist/cli.js", "skills/safe-change/SKILL.md", "README.md", "LICENSE", "CHANGELOG.md"];
  for (const req of requiredFiles) {
    if (!rootTarballInfo.files.includes(req)) {
      throw new Error(`Required file "${req}" is missing from root package distribution bundle.`);
    }
  }

  if (dryRun) {
    console.log(`[DRY-RUN] Root package ${rootTarballInfo.name}@${rootTarballInfo.version} pack dry-run passed.`);
    console.log(`[DRY-RUN] Dry run completed with zero mutations.`);
  } else {
    console.log(`Publishing ${rootTarballInfo.name}@${rootTarballInfo.version} to npm with provenance...`);
    execSync(`npm publish --access public --provenance`, {
      cwd: rootDir,
      stdio: "inherit",
      env: process.env,
    });

    console.log(`Verifying registry visibility for ${rootTarballInfo.name}@${rootTarballInfo.version}...`);
    const visible = await pollPackageVisibility(rootTarballInfo.name, targetVersion, registry);
    if (!visible) {
      throw new Error(`Root package ${rootTarballInfo.name}@${rootTarballInfo.version} published but not visible on registry within timeout.`);
    }
    console.log(`\nSuccessfully released and verified safe-change@${targetVersion} on npm registry!`);
  }
}

export async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const phaseIndex = args.indexOf("--phase");
  const phase = phaseIndex !== -1 ? args[phaseIndex + 1] : "all";

  try {
    if (phase === "native" || phase === "all") {
      await orchestrateNativePublish({ dryRun });
    }
    if (phase === "root" || phase === "all") {
      await orchestrateRootPublish({ dryRun });
    }
    process.exit(0);
  } catch (err) {
    console.error(`\nPublication Orchestrator Error: ${err.message}`);
    process.exit(1);
  }
}

const isDirectRun = Boolean(
  process.argv[1] &&
    resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
);

if (isDirectRun) {
  main();
}
