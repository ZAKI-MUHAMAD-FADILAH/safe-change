# npm Publication and Release Checklist

This document defines the release engineering checklist, operational procedures, security policies, and partial-failure recovery workflows for publishing `safe-change` and its associated native platform packages to the npm registry.

---

## 1. Release Architecture Overview

Releases follow a unified, single-orchestrator pattern managed by `.github/workflows/release.yml`:

- **Single Publication Orchestrator**: Publication to npm is exclusively owned by `.github/workflows/release.yml`. Individual CI workflows (`ci.yml` and `native-build.yml`) only compile, test, and upload build artifacts without initiating npm publish operations.
- **Dependency-Ordered Publication**: Native platform packages (`@safe-change/*`) are built, validated, and published first. The root `safe-change` package is published last only after all active native platform packages are verified visible on the npm registry.
- **Provenance and Immutability**: All packages are published with `--provenance` attestation enabled and `--access public`. Because npm package versions are immutable, releases cannot be overwritten or silently modified once published.

---

## 2. Release Prerequisites

Before triggering any production release workflow:

1. **Working Tree Cleanliness**: All working tree changes must be committed. No unstaged or untracked files are allowed during checkout.
2. **Version Parity**: All active packages, manifests, and documentation must agree on the target SemVer version:
   - Root `package.json`
   - Root `package-lock.json`
   - Cargo crate `crates/safe-change-native/Cargo.toml`
   - Platform package manifests under `npm/*/package.json`
   - Root `optionalDependencies` for all active platform packages
   - Documentation and dashboard version markers
3. **Changelog Preparedness**:
   - `CHANGELOG.md` must contain an explicit release section corresponding to the target version: `## [X.Y.Z] - YYYY-MM-DD`.
   - The release section must not be empty.
4. **Local Verification**:
   - `npm run lint` passes without diagnostics.
   - `npm run build` compiles clean distribution files to `dist/`.
   - `npm test` passes all tests.
   - `npm run test:coverage` meets or exceeds all configured threshold gates.
   - `npm run version:check` verifies monorepo version parity.
   - `npm run release:validate` validates release readiness rules.
   - `npm run release:preflight -- --dry-run` confirms package versions are available on the npm registry.
   - `npm run release:dry-run` executes pack validation without publishing.
   - `node scripts/smoke-test-tarball.mjs` verifies tarball installation and CLI functionality.

---

## 3. Version Bump Procedure

To prepare a new release:

1. Run version synchronization tool:
   ```bash
   node scripts/sync-version.mjs 0.3.1
   ```
2. Verify parity across all files:
   ```bash
   npm run version:check
   ```
3. Update `CHANGELOG.md`:
   - Move relevant items from `## [Unreleased]` into a new heading:
     ```markdown
     ## [0.3.1] - 2026-09-29
     ```
4. Verify release readiness:
   ```bash
   npm run release:validate -- --tag v0.3.1
   ```
5. Commit changes:
   ```bash
   git add -A
   git commit -m "chore(release): prepare v0.3.1"
   git push origin main
   ```

---

## 4. GitHub Environment and Authorization

- **Repository Secret**: `NPM_TOKEN` must be configured with an automation token granted publish rights to the `safe-change` package and the `@safe-change` organization/scope.
- **GitHub Environment (`npm-production`)**:
  - The publication jobs in `release.yml` target the `npm-production` environment.
  - Recommended configuration: require designated repository maintainer approvals before deployment jobs execute.
- **Least-Privilege Workflow Permissions**:
  - `contents: read`: checks out code and reads artifacts.
  - `id-token: write`: generates OIDC provenance attestations for npm.

---

## 5. Ordered Publication Workflow

Publication executes in strictly enforced stages:

| Stage | Action | Verification / Gate |
| :--- | :--- | :--- |
| **1. Preflight** | `validate-release.mjs` & `preflight-npm.mjs` | Fails immediately if versions mismatch, credentials or authorization are invalid, or registry state is unsafe. It supports a verified `root-recovery` state when all native packages are already published and the root package is not. |
| **2. Native Matrix Build** | Compile on 4 distinct runners: `ubuntu-latest`, `windows-latest`, `macos-latest`, `macos-15-intel` | Fallback tests, Rust unit tests, NAPI release build, native binary load smoke tests. |
| **3. Root Build & Tarball** | Compile TypeScript, run tests, coverage, dependency audit, tarball smoke test | Generates and signs `root-package-tarball`. |
| **4. Native Publish** | Publish `@safe-change/linux-x64-gnu`, `@safe-change/win32-x64-msvc`, `@safe-change/darwin-arm64`, `@safe-change/darwin-x64` | Polls npm registry until every platform package is HTTP 200 visible. |
| **5. Root Publish** | Publish `safe-change` with `--access public --provenance` | Requires all native platform packages to be confirmed visible on npm first. |

---

## 6. Partial Release Failure Handling and Recovery

Because multi-package publication across npm is inherently non-atomic:

1. **Failure during Native Publication**:
   - The workflow aborts immediately with exit code 1.
   - Unbuilt or unverified packages are NOT published.
   - The root package job is canceled, preventing broken installations where users receive a new root package without corresponding native modules.
2. **Failure during Root Publication (after Native Publication succeeds)**:
   - Native packages remain safely on npm (immutable).
   - Maintainers can review the root build logs, resolve any transient network or npm timeout issues, and rerun the original tag workflow. Preflight enters `root-recovery` mode and the orchestrator skips immutable native versions.
3. **Rollback Limitations**:
   - npm does not allow overwriting published versions or unpublishing packages older than 72 hours.
   - If a published version contains critical defects, do NOT attempt force-publishing. Follow standard SemVer patch procedure: increment patch version (e.g. `0.3.2`), resolve the defect, and publish a new release.

---

## 7. Operational Distinctions

- **Preparation**: Updating code, docs, changelog, and running local validation tests on `main`.
- **Git Tag (`vX.Y.Z`)**: Creating an annotated Git tag on GitHub triggers `.github/workflows/release.yml`.
- **npm Publication**: Automatic execution of the release pipeline under maintainer approval, distributing artifacts to the public registry.
- **GitHub Release**: Created after npm publication succeeds, attaching release notes and changelog highlights.
