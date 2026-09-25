import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as os from "node:os";

export const ADAPTER_CLASSIFICATION =
  "Candidate adapter; filesystem packaging validated; Antigravity runtime discovery not independently verified.";

export interface AdapterFileSystem {
  existsSync(p: string): boolean;
  lstatSync(p: string): {
    isSymbolicLink(): boolean;
    isDirectory(): boolean;
    isFile(): boolean;
  };
  readFileSync(p: string, encoding?: any): any;
  writeFileSync(p: string, data: any): void;
  mkdirSync(p: string, options?: any): any;
  rmSync(p: string, options?: any): void;
  readdirSync(p: string): string[];
}

export interface GenerateBundleOptions {
  sourceSkillPath?: string;
  targetPluginDir?: string;
  allowHomeDirInTest?: boolean;
  fsImpl?: AdapterFileSystem;
}

export interface GenerateBundleResult {
  status: "success" | "drift_detected" | "error";
  targetSkillPath: string;
  canonicalHash: string;
  bundledHash: string;
  bytesWritten: number;
  classification: string;
  message: string;
}

export interface VerifyDriftResult {
  matches: boolean;
  canonicalHash: string;
  bundledHash: string;
  error?: string;
}

const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
const PRIVATE_PATH_REGEX = new RegExp(
  "(?:" +
    ["file:", "///"].join("") +
    "|" +
    ["One", "Drive"].join("") +
    "|" +
    ["C:", "\\", "Users", "\\"].join("") + "[a-zA-Z0-9_-]+" +
    "|" +
    ["/", "Users", "/"].join("") + "[a-zA-Z0-9_-]+" +
    "|" +
    ["/", "home", "/"].join("") + "[a-zA-Z0-9_-]+" +
    ")"
);

function isPathInside(childPath: string, parentPath: string): boolean {
  const rel = path.relative(parentPath, childPath);
  return !rel.startsWith("..") && !path.isAbsolute(rel) && rel !== "";
}

export function validateSafePath(targetPath: string, allowHomeInTest = false): void {
  const resolved = path.resolve(targetPath);
  const home = path.resolve(os.homedir());
  const tmp = path.resolve(os.tmpdir());

  // Prevent writing directly to home directory root
  if (resolved.toLowerCase() === home.toLowerCase()) {
    throw new Error(`Safety violation: target cannot be the home directory root: ${resolved}`);
  }

  // If inside home, must be inside tmpdir if allowHomeInTest is false
  if (!allowHomeInTest) {
    const isUnderHome = isPathInside(resolved, home);
    const isUnderTmp = isPathInside(resolved, tmp);
    if (isUnderHome && !isUnderTmp) {
      // Check if it's within current workspace repository
      const repoRoot = path.resolve(__dirname, "..", "..");
      const isUnderRepo = isPathInside(resolved, repoRoot) || resolved === repoRoot;
      if (!isUnderRepo) {
        throw new Error(
          `Safety violation: path cannot reside under home directory outside temporary fixture or workspace repo: ${resolved}`
        );
      }
    }
  }
}

export function generateAntigravityBundle(
  options: GenerateBundleOptions = {}
): GenerateBundleResult {
  const fsImpl = options.fsImpl || fs;
  const defaultSource = path.resolve(__dirname, "..", "..", "skills", "safe-change", "SKILL.md");
  const defaultTarget = path.resolve(__dirname, "..", "..", "plugins", "antigravity");

  const sourceFile = path.resolve(options.sourceSkillPath || defaultSource);
  const targetPluginDir = path.resolve(options.targetPluginDir || defaultTarget);
  const targetSkillDir = path.join(targetPluginDir, "skills", "safe-change");
  const targetSkillFile = path.join(targetSkillDir, "SKILL.md");

  validateSafePath(targetPluginDir, options.allowHomeDirInTest);

  // 1. Verify canonical source exists and is a regular file
  if (!fsImpl.existsSync(sourceFile)) {
    throw new Error(`Canonical skill file not found: ${sourceFile}`);
  }

  const srcStat = fsImpl.lstatSync(sourceFile);
  if (srcStat.isSymbolicLink()) {
    throw new Error(`Safety violation: canonical skill must not be a symbolic link: ${sourceFile}`);
  }
  if (!srcStat.isFile()) {
    throw new Error(`Canonical skill must be a regular file: ${sourceFile}`);
  }

  const canonicalBuffer = fsImpl.readFileSync(sourceFile);
  const canonicalContent = canonicalBuffer.toString("utf8");

  // 2. Validate frontmatter in canonical source
  const lines = canonicalContent.split(/\r?\n/);
  if (lines.length < 3 || lines[0].trim() !== "---") {
    throw new Error("Canonical skill lacks opening YAML frontmatter delimiter (---)");
  }
  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      closingIndex = i;
      break;
    }
  }
  if (closingIndex === -1) {
    throw new Error("Canonical skill lacks closing YAML frontmatter delimiter (---)");
  }

  const frontmatterText = lines.slice(1, closingIndex).join("\n");
  if (!frontmatterText.includes("name: safe-change")) {
    throw new Error("Canonical skill frontmatter must define name: safe-change");
  }
  if (!frontmatterText.includes("description:")) {
    throw new Error("Canonical skill frontmatter must define a description");
  }

  // 3. Check for emoji and private paths in source
  if (EMOJI_REGEX.test(canonicalContent)) {
    throw new Error("Safety violation: canonical skill contains emoji");
  }
  if (PRIVATE_PATH_REGEX.test(canonicalContent)) {
    throw new Error("Safety violation: canonical skill contains private machine-specific paths");
  }

  // 4. Calculate SHA-256 of canonical skill
  const canonicalHash = crypto.createHash("sha256").update(canonicalBuffer).digest("hex");

  // 5. Inspect target destination paths for symlinks or junctions
  if (fsImpl.existsSync(targetPluginDir)) {
    const stat = fsImpl.lstatSync(targetPluginDir);
    if (stat.isSymbolicLink()) {
      throw new Error(`Safety violation: target plugin directory is a symlink: ${targetPluginDir}`);
    }
  }

  if (fsImpl.existsSync(targetSkillDir)) {
    const stat = fsImpl.lstatSync(targetSkillDir);
    if (stat.isSymbolicLink()) {
      throw new Error(`Safety violation: target skill directory is a symlink: ${targetSkillDir}`);
    }
  }

  if (fsImpl.existsSync(targetSkillFile)) {
    const stat = fsImpl.lstatSync(targetSkillFile);
    if (stat.isSymbolicLink()) {
      throw new Error(`Safety violation: target skill file is a symlink: ${targetSkillFile}`);
    }
  }

  // 6. Ensure target directory structure exists
  fsImpl.mkdirSync(targetSkillDir, { recursive: true });

  // 7. Deterministically write the skill file
  fsImpl.writeFileSync(targetSkillFile, canonicalBuffer);

  // 8. Verify post-write integrity
  const bundledBuffer = fsImpl.readFileSync(targetSkillFile);
  const bundledHash = crypto.createHash("sha256").update(bundledBuffer).digest("hex");

  if (Buffer.compare(canonicalBuffer, bundledBuffer) !== 0 || canonicalHash !== bundledHash) {
    return {
      status: "drift_detected",
      targetSkillPath: targetSkillFile,
      canonicalHash,
      bundledHash,
      bytesWritten: bundledBuffer.length,
      classification: ADAPTER_CLASSIFICATION,
      message: "Generated bundle does not match canonical skill hash.",
    };
  }

  return {
    status: "success",
    targetSkillPath: targetSkillFile,
    canonicalHash,
    bundledHash,
    bytesWritten: bundledBuffer.length,
    classification: ADAPTER_CLASSIFICATION,
    message: "Antigravity adapter bundle generated and verified with byte-for-byte identity.",
  };
}

export function verifyAntigravityBundleDrift(
  options: GenerateBundleOptions = {}
): VerifyDriftResult {
  const fsImpl = options.fsImpl || fs;
  const defaultSource = path.resolve(__dirname, "..", "..", "skills", "safe-change", "SKILL.md");
  const defaultTarget = path.resolve(
    __dirname,
    "..",
    "..",
    "plugins",
    "antigravity",
    "skills",
    "safe-change",
    "SKILL.md"
  );

  const sourceFile = path.resolve(options.sourceSkillPath || defaultSource);
  const targetFile = options.targetPluginDir
    ? path.join(path.resolve(options.targetPluginDir), "skills", "safe-change", "SKILL.md")
    : defaultTarget;

  if (!fsImpl.existsSync(sourceFile)) {
    return {
      matches: false,
      canonicalHash: "",
      bundledHash: "",
      error: `Canonical skill file not found: ${sourceFile}`,
    };
  }

  if (!fsImpl.existsSync(targetFile)) {
    return {
      matches: false,
      canonicalHash: "",
      bundledHash: "",
      error: `Bundled skill file not found: ${targetFile}`,
    };
  }

  const srcBuf = fsImpl.readFileSync(sourceFile);
  const dstBuf = fsImpl.readFileSync(targetFile);

  const canonicalHash = crypto.createHash("sha256").update(srcBuf).digest("hex");
  const bundledHash = crypto.createHash("sha256").update(dstBuf).digest("hex");

  const matches = Buffer.compare(srcBuf, dstBuf) === 0 && canonicalHash === bundledHash;

  return {
    matches,
    canonicalHash,
    bundledHash,
  };
}

export function cleanDirectoryWithRetry(
  dirPath: string,
  options: { maxRetries?: number; retryDelayMs?: number; fsImpl?: AdapterFileSystem } = {}
): void {
  const fsImpl = options.fsImpl || fs;
  const maxRetries = options.maxRetries ?? 5;
  const retryDelayMs = options.retryDelayMs ?? 100;

  if (!fsImpl.existsSync(dirPath)) {
    return;
  }

  let lastError: any = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      fsImpl.rmSync(dirPath, { recursive: true, force: true });
      if (!fsImpl.existsSync(dirPath)) {
        return;
      }
    } catch (err) {
      lastError = err;
    }
    const end = Date.now() + retryDelayMs;
    while (Date.now() < end) {
      // Busy wait for file lock release on Windows
    }
  }

  if (fsImpl.existsSync(dirPath)) {
    throw new Error(
      `Failed to clean directory after ${maxRetries} attempts: ${dirPath}. Reason: ${
        lastError?.message || "Directory still exists."
      }`
    );
  }
}
