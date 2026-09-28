# Experiments

This directory contains isolated research prototypes and proof-of-concept implementations that informed architectural decisions in safe-change. These are **not production code** and are not included in the published npm package.

## Contents

| Experiment | Purpose | Status |
| :--- | :--- | :--- |
| `rust-filesystem/` | Evaluate Rust napi-rs for kernel-level path boundary safety and file locking primitives. | Evaluation complete. Findings integrated into `crates/safe-change-native/`. |
| `typescript-filesystem/` | Validate that pure Node.js `node:fs` and `node:path` APIs satisfy all path traversal and symlink boundary constraints. | Validated. TypeScript fallback adopted as default runtime path. |

## Policy

- Experiments are kept in the repository for historical reference and architectural traceability.
- They are excluded from the npm tarball via the `files` field in `package.json`.
- Contributors should not depend on code in this directory. If an experiment matures, it is promoted into `src/` or `crates/` with full test coverage.
