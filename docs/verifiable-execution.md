# Safe-Change Verifiable Execution Guide

This document is the operational reference for Safe-Change Ultra Enterprise Verifiable Execution (v0.4).

## Overview

Safe-Change Verifiable Execution adds five cryptographic, AST-level, and OS-level security layers:
1. **AST Semantic Diff Engine**: Detects semantic mutations (negation inversion, removed guards, test weakening, error swallowing).
2. **Deterministic Replay Subsystem**: Records and executes verification sessions in isolated environments, reporting on 13 drift categories.
3. **Cryptographic Attestation Framework**: Generates DSSE/in-toto RFC 8785 Ed25519-signed attestation envelopes for verified builds and sessions.
4. **OS-Backed Command Sandbox**: Real operating-system process isolation, direct executable path resolution, scrubbed environment, and process-tree termination.
5. **Approval Identity Signing Registry**: Ed25519-signed capability grants, identity registry management, key rotation, and revocation checking.

---

## 1. AST Semantic Diff Engine

Inspect syntactic and semantic code modifications to detect dangerous mutations before executing checks or merging.

### CLI Usage

```bash
# Compare working directory against base ref (default: HEAD)
safe-change semantic-diff

# Compare working tree against specific ref
safe-change semantic-diff --base origin/main

# Output JSON report
safe-change semantic-diff --json

# Fail with non-zero exit code if high or critical severity mutations are found
safe-change semantic-diff --fail-on high
```

### Detected Mutation Types

| Category | Mutation | Severity |
| :--- | :--- | :--- |
| **Logic Inversion** | Changing `if (auth)` to `if (!auth)` | CRITICAL |
| **Guard Removal** | Deleting authorization check or early-return | CRITICAL |
| **Test Weakening** | Adding `.skip`, `.todo`, or deleting assertions | HIGH |
| **Error Swallowing** | Empty `catch {}` block or converting throws to warnings | HIGH |
| **Visibility Mutation** | Changing private member to public | MEDIUM |
| **Dependency Injection** | Untrusted dynamic `require()` or `import()` | HIGH |

---

## 2. Deterministic Replay Subsystem

Record verification traces and replay them deterministically across environments to verify drift invariants.

### CLI Usage

```bash
# Record verification session into a replay manifest
safe-change verify --record-replay

# Replay a recorded manifest
safe-change replay .safe-change/replays/replay-manifest.json

# Enforce zero-drift policy
safe-change replay .safe-change/replays/replay-manifest.json --strict

# Output machine-readable JSON drift report
safe-change replay .safe-change/replays/replay-manifest.json --json
```

### 13 Monitored Drift Categories

1. `COMMIT_HASH_MISMATCH`: Replay executed against different git commit.
2. `DIRTY_WORKSPACE`: Working directory contains unstaged/untracked changes.
3. `LOCKFILE_HASH_MISMATCH`: `package-lock.json` or equivalent was modified.
4. `TOOLCHAIN_VERSION_MISMATCH`: Node, npm, or compiler version differs from recording.
5. `ENVIRONMENT_DRIFT`: Permitted environment variables changed values.
6. `EXIT_CODE_MISMATCH`: Command exit code differed between recording and replay.
7. `EXECUTION_DURATION_ANOMALY`: Step duration exceeded historical threshold (>300%).
8. `OUTPUT_DIGEST_MISMATCH`: SHA-256 digest of stdout/stderr deviated from recorded baseline.
9. `POLICY_DIGEST_MISMATCH`: Enforcement policy was updated after recording.
10. `FINGERPRINT_MISMATCH`: Workspace merkle root drifted.
11. `FILE_MODIFICATION_OUTSIDE_BUDGET`: Replay modified files outside change budget.
12. `UNRECORDED_COMMAND_EXECUTION`: Replay encountered unexpected sub-commands.
13. `UNAUTHORIZED_CAPABILITY_REQUEST`: Replay requested ungranted capability.

---

## 3. Cryptographic Attestation Framework

Issue DSSE (Dead Simple Signing Envelope) formatted in-toto compliant attestations over verification results, binding git commit, evidence bundle, audit log, and policy digest.

### CLI Usage

```bash
# Generate Ed25519 signing keypair
safe-change identity keygen --output .keys/attestation-key.json

# Attest the current workspace verification state
safe-change attest --key-path .keys/attestation-key.json --key-id "build-authority-1"

# Verify an attestation envelope
safe-change attest verify .safe-change/attestations/bundle.attestation.json \
  --public-key <ED25519_HEX_PUBLIC_KEY>
```

---

## 4. OS-Backed Command Sandbox

Run commands with operating system process isolation, capability enforcement, and scrubbed environment allowlists.

### Platform Isolation Matrix

| Capability | Linux | macOS (Darwin) | Windows |
| :--- | :--- | :--- | :--- |
| **Executable Resolution** | Direct path / `which` | Direct path / `which` | Direct `node.exe` + `npm-cli.js` (No `cmd.exe`) |
| **Shell Expansion** | Disabled (`shell: false`) | Disabled (`shell: false`) | Disabled (`shell: false`) |
| **Isolated HOME** | Unique temp directory | Unique temp directory | Unique temp directory |
| **Env Sterilization** | Strict allowlist | Strict allowlist | Strict allowlist |
| **Process Tree Kill** | `kill -9 -<PGID>` | `kill -9 -<PGID>` | `taskkill /pid <PID> /t /f` |
| **Network Denial** | Supported (`unshare -n` / capability check) | Supported (`sandbox-exec` / deny) | Emulated via proxy loopback (Reported capability) |
| **Read-Only Root** | Supported | Supported | Supported via workspace isolation |

---

## 5. Approval Identity Signing Registry

Cryptographically sign capability exception requests and verify approval identity chains.

### CLI Usage

```bash
# Generate approver keypair
safe-change identity keygen --output .keys/approver-lead.json

# Register approver in workspace identity registry
safe-change identity register \
  --key-id "lead-sec-01" \
  --name "Security Lead" \
  --email "sec-lead@corp.internal" \
  --role "security-lead" \
  --public-key <ED25519_PUBLIC_KEY_HEX>

# List registered approver identities
safe-change identity list

# Sign an approval request
safe-change approval sign <REQUEST_ID> \
  --key-path .keys/approver-lead.json \
  --key-id "lead-sec-01"

# Verify signed approval grants for a request
safe-change approval verify <REQUEST_ID>
```

---

## 6. Migration Guide (v0.3 -> v0.4)

### Backward Compatibility
- Existing `.safe-change.json` policy files are 100% backward compatible.
- All v0.3 commands (`check`, `verify`, `diff-budget`, `lease`, `baseline`, `policy`) function without modifications.
- The `commandSandbox` now resolves executables directly without `cmd.exe` on Windows, eliminating Node 18+ `EINVAL` warnings (CVE-2024-27980).

### Recommended Next Steps for Enterprise Repositories
1. Add `.keys/` to `.gitignore` (ensure private keys are never committed).
2. Configure trusted approver public keys in `.safe-change/identities.json`.
3. Enable attestation signing in CI pipeline post-verification.
