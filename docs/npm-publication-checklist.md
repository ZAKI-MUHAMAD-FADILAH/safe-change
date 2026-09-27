# npm Publication Checklist

Status: Completed (Published v0.1.0)
- Tanggal publikasi: 2026-09-27
- URL npm: https://www.npmjs.com/package/safe-change
- Maintainer: zackpratamaa_

This document records the verification checklist completed for the public release of `safe-change` on the npm registry.

---

## 1. Repository and Access Verification

- [x] **Package Name Availability**: Confirm that package name `safe-change` is available on the npm registry.
  - Check: `https://www.npmjs.com/package/safe-change` or `curl -I https://registry.npmjs.org/safe-change` (status `404` confirms availability prior to publication).
- [x] **Name Fallback Plan**: If `safe-change` becomes unavailable before publication, decide on an alternative scoped or prefixed name (e.g. `@scope/safe-change`) before publishing.
- [x] **Private Vulnerability Reporting**: Enable GitHub private vulnerability reporting in repository settings:
  - Settings: `https://github.com/zackpratamaa/safe-change/settings/security_analysis`
- [x] **Vulnerability Link Verification**: Verify that the advisory creation form is accessible to security researchers:
  - Form: `https://github.com/zackpratamaa/safe-change/security/advisories/new`

---

## 2. Package Metadata

- [x] **Repository, Bugs, Homepage**: Confirmed filled in `package.json`:
  - `repository`: `git+https://github.com/zackpratamaa/safe-change.git`
  - `bugs`: `https://github.com/zackpratamaa/safe-change/issues`
  - `homepage`: `https://github.com/zackpratamaa/safe-change#readme`
- [x] **Keywords**: Relevant search terms included (`vibe-coding`, `cursor`, `claude-code`, `codex`, `antigravity`, `developer-tools`, `safe-change`, `agpl-3-0`, `typescript`).
- [x] **Exports Mapping**: Modern `exports` map configured for ESM consumers (`.` import and types).
- [x] **Changelog**: `CHANGELOG.md` created, up to date with `v0.1.0`, and included in `files` array.
- [x] **Distribution Files Array**: `files` list contains only necessary production artifacts:
  - `dist` (compiled JavaScript and declaration files)
  - `skills` (canonical safe-change skill definition)
  - `LICENSE` (AGPL-3.0-only license text)
  - `LICENSE_CHANGE.md` (historical transition notice)
  - `README.md` (overview and quickstart)
  - `CHANGELOG.md` (version history)
  *(Note: `plugins/` is intentionally excluded from the package distribution bundle because it represents a development prototype; all production installations consume the canonical skill directly from `skills/safe-change/SKILL.md`.)*

---

## 3. Security Checks

- [x] **No Private Paths**: Confirm no developer usernames, machine-specific paths, or private file URLs exist in code or documentation.
- [x] **No Credentials or Secrets**: Verify repository history and working tree are free of API keys, access tokens, or private credentials.
- [x] **Dependency Audit**: Review `npm audit` results for production dependencies. Ensure no high or critical runtime vulnerabilities affect production code.
- [x] **Security Policy**: Confirm `SECURITY.md` documents active reporting instructions and the installer trust model.

---

## 4. Build and Testing Verification

Execute the following in a fresh clone before publishing:

- [x] **Clean Install**: `npm ci` completes with code 0.
- [x] **Build**: `npm run build` compiles TypeScript to `dist/` without errors.
- [x] **Typecheck / Lint**: `npm run lint` completes without diagnostics.
- [x] **Test Suite**: `npm test` passes all tests across all test files (201 tests passed, 1 skipped).
- [x] **Pack Dry-Run**: `npm pack --dry-run` displays all expected files and excludes tests, source TypeScript, and fixtures.
- [x] **Local Tarball Installation**:
  ```bash
  npm pack
  npm install -g ./safe-change-0.1.0.tgz
  ```
- [x] **CLI Execution Check**:
  - `safe-change --version` prints `0.1.0`.
  - `safe-change --help` displays all commands (`save`, `check`, `diff`, `install`, `update`, `uninstall`, `status`) and exit codes.
  - `safe-change install antigravity --dry-run` runs successfully in a temporary repository without disk writes.
  ```bash
  npm uninstall -g safe-change
  rm safe-change-0.1.0.tgz
  ```

---

## 5. Documentation Integrity

- [x] **No premature npm commands**: `README.md` does not instruct users to run `npm install -g safe-change` before the package is published to npm.
- [x] **Post-publication update plan**: Immediately after public publication, update `README.md` and `GUIDE.md` to document global installation via npm:
  ```bash
  npm install -g safe-change
  ```
- [x] **Antigravity Status Transparency**: Antigravity is clearly documented as:
  *"supported (filesystem validated; runtime discovery not independently verified)"*.
- [x] **No Unsupported Agent Claims**: Documentation does not claim support for Claude Code, Cursor, Codex, or other agents before their adapters are implemented and verified.

---

## 6. Publication Execution

- [x] **Git Tagging**: Initial release commit tagged with `v0.1.0`:
  ```bash
  git tag -a v0.1.0 -m "Release v0.1.0"
  git push origin v0.1.0
  ```
- [x] **GitHub Release**: GitHub Release created corresponding to `v0.1.0` with release notes.
- [x] **npm Account and 2FA**: Ensure npm account credentials are valid and Two-Factor Authentication (2FA) is active.
- [x] **Dry-Run Publish**:
  ```bash
  npm publish --dry-run
  ```
- [x] **Public Publish**:
  ```bash
  npm publish --access public
  ```
- [x] **Post-Publish Verification**: Verify public package page on npm:
  `https://www.npmjs.com/package/safe-change`

---

## Official Status Statement

The following status statement remains active and binding upon publication:

> "Installer Antigravity production telah diimplementasikan dan diuji pada level filesystem. Penemuan skill oleh runtime Antigravity belum diverifikasi secara independen."
