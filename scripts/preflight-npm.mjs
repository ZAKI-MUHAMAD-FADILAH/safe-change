import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const PACKAGES_TO_VERIFY = [
  "safe-change",
  "@safe-change/linux-x64-gnu",
  "@safe-change/win32-x64-msvc",
  "@safe-change/darwin-arm64",
  "@safe-change/darwin-x64",
];

export async function checkPackageVersionStatus(pkgName, version, registry = "https://registry.npmjs.org") {
  const encodedName = pkgName.startsWith("@")
    ? `@${encodeURIComponent(pkgName.slice(1))}`
    : encodeURIComponent(pkgName);

  const url = `${registry.replace(/\/$/, "")}/${encodedName}/${version}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (res.status === 404) {
      return { status: "not_published", code: 404, pkg: pkgName, version };
    }
    if (res.status === 200) {
      return { status: "already_published", code: 200, pkg: pkgName, version };
    }
    if (res.status === 401 || res.status === 403) {
      return { status: "auth_error", code: res.status, pkg: pkgName, version };
    }
    return { status: "registry_error", code: res.status, pkg: pkgName, version };
  } catch (err) {
    return {
      status: "network_error",
      error: err.message,
      pkg: pkgName,
      version,
    };
  }
}

export function verifyNpmAuth({ registry = "https://registry.npmjs.org" } = {}) {
  const token = process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN;
  if (!token) {
    return { authenticated: false, error: "NODE_AUTH_TOKEN / NPM_TOKEN is not set in environment." };
  }

  try {
    const whoami = execSync(`npm whoami --registry "${registry}"`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_AUTH_TOKEN: token,
      },
    }).trim();

    return { authenticated: true, username: whoami };
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
    // Ensure no token is leaked
    const sanitizedError = stderr.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]");
    return { authenticated: false, error: sanitizedError };
  }
}

export async function preflightNpm({
  rootDir = resolve("."),
  dryRun = false,
  skipAuth = false,
  registry = "https://registry.npmjs.org",
} = {}) {
  const pkgPath = join(rootDir, "package.json");
  if (!existsSync(pkgPath)) {
    throw new Error(`Missing package.json at ${pkgPath}`);
  }
  const rootPkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const targetVersion = rootPkg.version;

  console.log(`Starting npm release preflight for v${targetVersion} on ${registry}...`);

  // 1. Authentication check
  let authUser = null;
  if (!skipAuth) {
    const authResult = verifyNpmAuth({ registry });
    if (!authResult.authenticated) {
      if (dryRun) {
        console.warn(`[WARN] npm authentication check skipped in dry-run: ${authResult.error}`);
      } else {
        throw new Error(`npm authentication preflight failed: ${authResult.error}`);
      }
    } else {
      authUser = authResult.username;
      console.log(`Verified npm credentials for user: ${authUser}`);
    }
  } else {
    console.log("Skipping npm authentication check (--skip-auth).");
  }

  // 2. Package versions check
  console.log(`Checking existing versions across ${PACKAGES_TO_VERIFY.length} release packages...`);
  const statusResults = [];
  for (const pkg of PACKAGES_TO_VERIFY) {
    const res = await checkPackageVersionStatus(pkg, targetVersion, registry);
    statusResults.push(res);
  }

  const alreadyPublished = statusResults.filter((r) => r.status === "already_published");
  const errors = statusResults.filter((r) => r.status !== "not_published" && r.status !== "already_published");
  const readyToPublish = statusResults.filter((r) => r.status === "not_published");

  console.log("\nPackage status breakdown:");
  for (const r of statusResults) {
    console.log(`  - ${r.pkg}@${r.version}: ${r.status} (HTTP ${r.code || r.error || "N/A"})`);
  }

  if (errors.length > 0) {
    const details = errors.map((e) => `${e.pkg} (${e.status}: ${e.code || e.error})`).join(", ");
    throw new Error(`Registry communication failed for one or more packages: ${details}`);
  }

  if (alreadyPublished.length > 0) {
    const existing = alreadyPublished.map((p) => `${p.pkg}@${p.version}`).join(", ");
    throw new Error(
      `Package version conflict: The following packages are already published to npm:\n  ${existing}\nnpm versions are immutable and cannot be republished. Please bump version.`
    );
  }

  console.log(`\nAll ${readyToPublish.length} packages are available for initial publication of v${targetVersion}.`);
  return {
    success: true,
    targetVersion,
    user: authUser,
    packagesReady: readyToPublish.map((p) => p.pkg),
  };
}

export async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const skipAuth = args.includes("--skip-auth") || (!process.env.NODE_AUTH_TOKEN && !process.env.NPM_TOKEN && dryRun);

  try {
    const result = await preflightNpm({ dryRun, skipAuth });
    console.log(`npm release preflight completed successfully for v${result.targetVersion}.`);
    process.exit(0);
  } catch (err) {
    console.error(`\nPreflight Error: ${err.message}`);
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
