import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateTagFormat, validateRelease, ACTIVE_NATIVE_TARGETS } from "../../scripts/validate-release.mjs";

function setupMockReleaseRepo(dir: string, version = "0.3.1", options: { changelogSection?: string } = {}): void {
  // 1. package.json
  const optDeps: Record<string, string> = {};
  for (const target of ACTIVE_NATIVE_TARGETS) {
    optDeps[`@safe-change/${target}`] = version;
  }

  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: "safe-change",
        version,
        optionalDependencies: optDeps,
      },
      null,
      2
    ) + "\n",
    "utf-8"
  );

  // 2. package-lock.json
  writeFileSync(
    join(dir, "package-lock.json"),
    JSON.stringify(
      {
        name: "safe-change",
        version,
        lockfileVersion: 3,
        packages: {
          "": {
            name: "safe-change",
            version,
            optionalDependencies: optDeps,
          },
        },
      },
      null,
      2
    ) + "\n",
    "utf-8"
  );

  // 3. Cargo.toml
  const cargoDir = join(dir, "crates", "safe-change-native");
  mkdirSync(cargoDir, { recursive: true });
  writeFileSync(
    join(cargoDir, "Cargo.toml"),
    `[package]\nname = "safe-change-native"\nversion = "${version}"\n`,
    "utf-8"
  );

  // 4. npm platform packages
  for (const target of ACTIVE_NATIVE_TARGETS) {
    const targetDir = join(dir, "npm", target);
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(
      join(targetDir, "package.json"),
      JSON.stringify(
        {
          name: `@safe-change/${target}`,
          version,
        },
        null,
        2
      ) + "\n",
      "utf-8"
    );
  }

  // 5. Dashboard template badge
  const dashDir = join(dir, "src", "dashboard");
  mkdirSync(dashDir, { recursive: true });
  writeFileSync(
    join(dashDir, "template.ts"),
    `<span class="badge badge-info" style="font-size: 10px; padding: 1px 6px;">v${version}</span>\n`,
    "utf-8"
  );

  // 6. Docs
  const docsDir = join(dir, "docs");
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(
    join(docsDir, "native-binary-distribution.md"),
    `"version": "${version}"\n`,
    "utf-8"
  );

  // 7. CHANGELOG.md
  const changelogBody = options.changelogSection ?? `## [${version}] - 2026-09-29\n\n### Added\n- Verified release candidate features.\n`;
  writeFileSync(join(dir, "CHANGELOG.md"), `# Changelog\n\n${changelogBody}`, "utf-8");
}

describe("scripts/validate-release.mjs", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "sc-release-val-test-"));
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("validateTagFormat", () => {
    it("accepts valid SemVer release tags starting with v", () => {
      expect(validateTagFormat("v0.3.1")).toEqual({ valid: true, version: "0.3.1" });
      expect(validateTagFormat("v1.0.0-rc.1")).toEqual({ valid: true, version: "1.0.0-rc.1" });
      expect(validateTagFormat("v2.10.5")).toEqual({ valid: true, version: "2.10.5" });
    });

    it("rejects tags without leading v or malformed versions", () => {
      expect(validateTagFormat("0.3.1").valid).toBe(false);
      expect(validateTagFormat("v0.3").valid).toBe(false);
      expect(validateTagFormat("v0.3.1.2").valid).toBe(false);
      expect(validateTagFormat("release-v1").valid).toBe(false);
      expect(validateTagFormat("").valid).toBe(false);
    });
  });

  describe("validateRelease", () => {
    it("passes when all files, versions, and changelog section match the release tag", () => {
      setupMockReleaseRepo(testDir, "0.3.1");

      const result = validateRelease({
        rootDir: testDir,
        tag: "v0.3.1",
        checkGitStatus: false,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.expectedVersion).toBe("0.3.1");
    });

    it("rejects when tag version does not match root package.json", () => {
      setupMockReleaseRepo(testDir, "0.3.1");

      const result = validateRelease({
        rootDir: testDir,
        tag: "v0.3.2",
        checkGitStatus: false,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("package.json version mismatch"))).toBe(true);
    });

    it("rejects when an active native optionalDependency version mismatches", () => {
      setupMockReleaseRepo(testDir, "0.3.1");

      const pkgPath = join(testDir, "package.json");
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      pkg.optionalDependencies["@safe-change/linux-x64-gnu"] = "0.3.0";
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");

      const result = validateRelease({
        rootDir: testDir,
        tag: "v0.3.1",
        checkGitStatus: false,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("@safe-change/linux-x64-gnu"))).toBe(true);
    });

    it("rejects when Cargo.toml version mismatches", () => {
      setupMockReleaseRepo(testDir, "0.3.1");

      const cargoPath = join(testDir, "crates", "safe-change-native", "Cargo.toml");
      writeFileSync(cargoPath, `[package]\nname = "safe-change-native"\nversion = "0.3.0"\n`, "utf-8");

      const result = validateRelease({
        rootDir: testDir,
        tag: "v0.3.1",
        checkGitStatus: false,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Cargo.toml version mismatch"))).toBe(true);
    });

    it("rejects when a platform package version mismatches", () => {
      setupMockReleaseRepo(testDir, "0.3.1");

      const subPkgPath = join(testDir, "npm", "win32-x64-msvc", "package.json");
      writeFileSync(subPkgPath, JSON.stringify({ name: "@safe-change/win32-x64-msvc", version: "0.2.0" }) + "\n", "utf-8");

      const result = validateRelease({
        rootDir: testDir,
        tag: "v0.3.1",
        checkGitStatus: false,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("npm/win32-x64-msvc/package.json version mismatch"))).toBe(true);
    });

    it("rejects when CHANGELOG does not contain the target version in strict mode", () => {
      setupMockReleaseRepo(testDir, "0.3.1", {
        changelogSection: "## [Unreleased]\n\n- Some changes\n",
      });

      const result = validateRelease({
        rootDir: testDir,
        tag: "v0.3.1",
        allowUnreleased: false,
        checkGitStatus: false,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("CHANGELOG.md does not contain release section"))).toBe(true);
    });

    it("accepts [Unreleased] section when allowUnreleased is enabled with a warning", () => {
      setupMockReleaseRepo(testDir, "0.3.1", {
        changelogSection: "## [Unreleased]\n\n- Some changes\n",
      });

      const result = validateRelease({
        rootDir: testDir,
        tag: "v0.3.1",
        allowUnreleased: true,
        checkGitStatus: false,
      });

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("rejects when CHANGELOG target release section is empty", () => {
      setupMockReleaseRepo(testDir, "0.3.1", {
        changelogSection: "## [0.3.1] - 2026-09-29\n\n## [0.3.0] - 2026-09-28\n- Prior version\n",
      });

      const result = validateRelease({
        rootDir: testDir,
        tag: "v0.3.1",
        checkGitStatus: false,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("release section for [0.3.1] is empty"))).toBe(true);
    });
  });
});
