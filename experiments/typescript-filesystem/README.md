# TypeScript Filesystem Safety Experiment

Status:
Isolated Research Prototype only. Not part of production CLI or `src/`.

---

## 1. Objective

To empirically evaluate whether standard Node.js `node:fs` and `node:path` APIs can satisfy all required safety primitives for safe-change installer operations:
- Path boundary enforcement (preventing traversal escapes via `..`);
- Rejection of home directory root writes;
- Symlink and NTFS junction detection via `fs.lstatSync`;
- Staging-based atomic file replacement via `fs.renameSync`;
- Graceful exception handling and cleanup guarantees.

---

## 2. Experimental Findings

1. **Path Boundary Enforcement**: Standard `path.resolve` combined with `path.relative` reliably identifies paths escaping a designated root directory across POSIX and Windows separators.
2. **Symlink and Junction Inspection**: `fs.lstatSync` reliably detects symbolic links and junction reparse points on Windows NTFS and POSIX platforms without traversing to the target.
3. **Atomic File Replacement**: Staging files to hidden temporary files in the same directory (`.staging-*.tmp`) and moving them via `fs.renameSync` achieves atomic replacement semantics on POSIX and safe replacement on Windows.
4. **Zero Native Dependencies**: All primitives function using built-in Node.js runtime APIs without requiring compiled C/C++ or Rust add-ons.
