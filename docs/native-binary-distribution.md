# Native Binary Distribution Architecture

This document describes the design and operational procedures for distributing precompiled native Rust binaries for `safe-change` across supported platforms.

---

## 1. Distribution Architecture

`safe-change` utilizes a hybrid architecture:
- **TypeScript CLI Core**: Provides user interaction, argument parsing, baseline state management, Git inspection, diff reporting, and agent skill adapter lifecycle management.
- **Rust Native Extension (`safe-change-native`)**: Implemented via `napi-rs` to provide zero-cost kernel-level primitives for path boundary safety, symbolic link/junction validation, atomic rename, and advisory file locking.
- **Platform Packages (`@safe-change/<platform>`)**: Precompiled native Node.js addons (`.node`) distributed in platform-specific scoped npm packages.

This structure eliminates the need for end users to have a Rust toolchain, C++ compiler, or Python build environment installed on their machines.

---

## 2. GitHub Actions Build and Publish Pipeline

Compilation and distribution are automated via `.github/workflows/native-build.yml`:

1. **Matrix Compilation**:
   - The `build-and-test` job executes on three runner environments: `ubuntu-latest`, `windows-latest`, and `macos-latest`.
   - Each runner compiles TypeScript, verifies TypeScript fallback (`SAFE_CHANGE_NATIVE_DISABLED=1`), executes Rust unit tests (`cargo test`), builds the native extension via `npx napi build --platform --release`, and runs the full test suite with the native extension loaded.
   - Compiled `.node` artifacts are uploaded to GitHub Actions artifact storage.

2. **Automated Publishing on Release Tags**:
   - When a Git tag matching `v*` is pushed, the `publish-native` job runs after all matrix builds pass.
   - Artifacts are downloaded and copied into corresponding directories under `npm/<platform>/`.
   - Each platform package is published to the npm registry with public access using the repository secret `NPM_TOKEN`.

---

## 3. npm Platform Selection via `optionalDependencies`

`safe-change` leverages standard npm package management behavior:
- Platform packages define target OS and CPU requirements in their respective `package.json`:
  ```json
  {
    "name": "@safe-change/win32-x64-msvc",
    "version": "0.3.0",
    "os": ["win32"],
    "cpu": ["x64"],
    "main": "safe-change-native.node"
  }
  ```
- When a user installs `safe-change`, npm inspects the host system against the `optionalDependencies` entries.
- Only the package corresponding to the current host OS and architecture is downloaded.
- If installation fails (or if the user installs with `--no-optional`), npm proceeds without aborting.

---

## 4. Supported Platforms

The following platforms are targeted:

| Package Name | Operating System | Architecture | Toolchain / Libc |
| --- | --- | --- | --- |
| `@safe-change/win32-x64-msvc` | Windows | x64 | MSVC |
| `@safe-change/win32-arm64-msvc` | Windows | ARM64 | MSVC |
| `@safe-change/darwin-x64` | macOS | x64 | Intel / Mach-O |
| `@safe-change/darwin-arm64` | macOS | ARM64 | Apple Silicon |
| `@safe-change/linux-x64-gnu` | Linux | x64 | glibc |
| `@safe-change/linux-arm64-gnu` | Linux | ARM64 | glibc |
| `@safe-change/linux-x64-musl` | Linux | x64 | musl (e.g. Alpine) |

---

## 5. TypeScript Fallback Mechanism

If no native package is available for the current host environment, or if native execution is explicitly disabled via the `SAFE_CHANGE_NATIVE_DISABLED=1` environment variable:
- The loader in `src/native/index.ts` catches import failures gracefully and returns `null`.
- Core modules ([src/installer/core/path-safety.ts](file:///c:/Users/zakim/OneDrive/Desktop/safe-change/src/installer/core/path-safety.ts) and [src/installer/core/transaction.ts](file:///c:/Users/zakim/OneDrive/Desktop/safe-change/src/installer/core/transaction.ts)) automatically fall back to pure TypeScript implementations using standard Node.js APIs (`node:fs`, `node:path`).
- All safety guarantees, boundary checks, collision detections, and rollback mechanisms continue to function identically.

---

## 6. Adding a New Target Platform

To add support for a new operating system or architecture:

1. **Add Target to Rust**:
   Configure the target in `crates/safe-change-native/Cargo.toml` and install target via `rustup target add <target>`.
2. **Create npm Platform Directory**:
   Create `npm/<new-platform>/` containing `package.json` specifying `"os"` and `"cpu"`, along with a concise `README.md`.
3. **Update Loader**:
   Add `@safe-change/<new-platform>` to the `platforms` array in [src/native/index.ts](file:///c:/Users/zakim/OneDrive/Desktop/safe-change/src/native/index.ts).
4. **Update CI Workflow**:
   Add the target runner to `.github/workflows/native-build.yml` and add the mapping in the `publish-native` job.
