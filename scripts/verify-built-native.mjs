import { readdirSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = resolve(".");
const target = process.argv[2];

if (!target) {
  console.error("Usage: node scripts/verify-built-native.mjs <target>");
  process.exit(1);
}

const cratesDir = join(rootDir, "crates", "safe-change-native");
const entries = readdirSync(cratesDir);
const nodeBinaryName = entries.find((e) => e.endsWith(".node"));

if (!nodeBinaryName) {
  console.error(`Error: No .node binary found in ${cratesDir}`);
  process.exit(1);
}

const sourceBinary = join(cratesDir, nodeBinaryName);
console.log(`Found built native binary: ${sourceBinary}`);

// 1. Stage into dist/native/ for loader verification
const distNativeDir = join(rootDir, "dist", "native");
mkdirSync(distNativeDir, { recursive: true });
const distBinary = join(distNativeDir, "safe-change-native.node");
copyFileSync(sourceBinary, distBinary);
console.log(`Staged binary to ${distBinary}`);

// 2. Stage into target platform package directory
const pkgDir = join(rootDir, "npm", target);
if (existsSync(pkgDir)) {
  const pkgBinary = join(pkgDir, "safe-change-native.node");
  copyFileSync(sourceBinary, pkgBinary);
  console.log(`Staged binary to ${pkgBinary}`);
}

// 3. Load and test native module
const distIndexPath = join(distNativeDir, "index.js");
const indexUrl = pathToFileURL(distIndexPath).href;

const {
  getNativeLoadStatus,
  isNativeAvailable,
  getNativeVersion,
  checkPathBoundaryNative,
} = await import(indexUrl);

const status = getNativeLoadStatus();
console.log(`Native load status: ${status}`);

if (status !== "loaded" || !isNativeAvailable()) {
  console.error(`Error: Expected native module to load, got status: "${status}"`);
  process.exit(1);
}

const version = getNativeVersion();
console.log(`Native module version: ${version}`);

const inside = checkPathBoundaryNative(join(rootDir, "package.json"), rootDir);
const outside = checkPathBoundaryNative(join(rootDir, "..", "escaped.txt"), rootDir);

if (inside !== true || outside !== false) {
  console.error(`Error: Native path boundary check failed (inside: ${inside}, outside: ${outside})`);
  process.exit(1);
}

console.log("Native module verification passed successfully.");
