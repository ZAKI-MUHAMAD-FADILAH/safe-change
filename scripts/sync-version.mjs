import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const targetVersion = process.argv[2] || "0.3.0";

console.log(`Synchronizing repository version to ${targetVersion}...`);

const rootDir = resolve(".");

// 1. Root package.json
const pkgPath = join(rootDir, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
pkg.version = targetVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
console.log(`Updated ${pkgPath}`);

// 2. Root package-lock.json
const lockPath = join(rootDir, "package-lock.json");
if (readFileSync(lockPath, "utf-8")) {
  const lock = JSON.parse(readFileSync(lockPath, "utf-8"));
  lock.version = targetVersion;
  if (lock.packages && lock.packages[""]) {
    lock.packages[""].version = targetVersion;
  }
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n", "utf-8");
  console.log(`Updated ${lockPath}`);
}

// 3. Cargo.toml
const cargoPath = join(rootDir, "crates", "safe-change-native", "Cargo.toml");
let cargoContent = readFileSync(cargoPath, "utf-8");
cargoContent = cargoContent.replace(/^version\s*=\s*"[^"]+"/m, `version = "${targetVersion}"`);
writeFileSync(cargoPath, cargoContent, "utf-8");
console.log(`Updated ${cargoPath}`);

// 4. npm platform packages
const npmDir = join(rootDir, "npm");
const entries = readdirSync(npmDir);
for (const entry of entries) {
  const subPkgPath = join(npmDir, entry, "package.json");
  try {
    if (statSync(subPkgPath).isFile()) {
      const subPkg = JSON.parse(readFileSync(subPkgPath, "utf-8"));
      subPkg.version = targetVersion;
      writeFileSync(subPkgPath, JSON.stringify(subPkg, null, 2) + "\n", "utf-8");
      console.log(`Updated ${subPkgPath}`);
    }
  } catch {
    // skip non-directories
  }
}

// 5. Dashboard template badge
const templatePath = join(rootDir, "src", "dashboard", "template.ts");
let templateContent = readFileSync(templatePath, "utf-8");
templateContent = templateContent.replace(
  /<span class="badge badge-info"[^>]*>v[^<]+<\/span>/g,
  `<span class="badge badge-info" style="font-size: 10px; padding: 1px 6px;">v${targetVersion}</span>`
);
writeFileSync(templatePath, templateContent, "utf-8");
console.log(`Updated ${templatePath}`);

// 6. Native binary distribution docs
const nativeDocPath = join(rootDir, "docs", "native-binary-distribution.md");
let nativeDocContent = readFileSync(nativeDocPath, "utf-8");
nativeDocContent = nativeDocContent.replace(/"version":\s*"[^"]+"/g, `"version": "${targetVersion}"`);
writeFileSync(nativeDocPath, nativeDocContent, "utf-8");
console.log(`Updated ${nativeDocPath}`);

console.log(`All packages and files successfully synchronized to v${targetVersion}.`);
