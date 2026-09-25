# Rust Filesystem Safety Experiment (Evaluation Only)

Status:
Runtime Validation Unavailable. Rust toolchain (`rustc` and `cargo`) is not installed in the execution environment.

---

## 1. Environment Audit

During the technology evaluation phase for Milestone C.2/C.3, an environment check was performed:
- `rustc --version`: Command not found (uninstalled).
- `cargo --version`: Command not found (uninstalled).

In accordance with repository safety and honesty rules, no Rust benchmarks have been fabricated or simulated. This document records the architectural evaluation and theoretical design trade-offs without claiming empirical runtime execution.

---

## 2. Theoretical Architecture of a Rust Helper

If implemented in a future milestone, an optional Rust filesystem helper would operate as a native Node-API (`napi-rs`) add-on or a standalone auxiliary binary:

```
[safe-change CLI (TypeScript)]
             │
             ▼ (IPC / Node-API FFI)
[safe-change-fs-helper (Rust)]
             │
             ├── Direct Win32 File Handles:
             │   CreateFileW(..., FILE_FLAG_OPEN_REPARSE_POINT)
             │
             └── POSIX Descriptor Safety:
                 openat(dirfd, ..., O_NOFOLLOW | O_CLOEXEC)
```

### Theoretical Advantages of Rust
1. **Handle-Based I/O (`openat` / `CreateFileW`)**: Rust allows pinning a directory file descriptor and operating strictly relative to that descriptor via `openat(2)` or `CreateFileW` with `FILE_FLAG_OPEN_REPARSE_POINT`, closing theoretical TOCTOU windows between path inspection and file creation.
2. **Platform-Specific File Locking**: Direct access to OS locking APIs (`flock`, `fcntl`, `LockFileEx`) without relying on Node.js lockfile emulation.
3. **Strict Memory Safety**: Memory-safe implementation of low-level OS system calls.

---

## 3. Practical Trade-offs and Distribution Costs

1. **Cross-Compilation Matrix**: Distributing a pre-compiled native binary requires maintaining build pipelines for at least six target architectures:
   - `x86_64-unknown-linux-gnu`
   - `x86_64-unknown-linux-musl`
   - `aarch64-unknown-linux-gnu`
   - `x86_64-apple-darwin`
   - `aarch64-apple-darwin`
   - `x86_64-pc-windows-msvc`
2. **Package Size Overhead**: Including pre-compiled binaries for all platforms inflates the npm package size from ~48.6 kB to tens of megabytes.
3. **Installation Friction**: Environments with restrictive execution policies (e.g. `noexec` on `/tmp`, enterprise CI environments with strict native binary signing rules) frequently block post-install scripts or third-party binary execution.
4. **Maintenance Overhead**: Requires contributors to maintain and debug both a TypeScript compiler setup and a Rust toolchain.

---

## 4. Conclusion

Because standard Node.js APIs (`node:fs` and `node:path`) successfully fulfill all tested security and boundary constraints (as proven by the 108 passing tests), introducing a Rust helper at this stage introduces substantial distribution and maintenance overhead without solving an active, demonstrated limitation.
