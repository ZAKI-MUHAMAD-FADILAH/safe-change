# Verifiable Execution Architecture & Threat Model

This document defines the architectural specification, threat model, trust boundaries, cryptographic invariants, and failure semantics for Safe-Change Ultra Enterprise (v0.4 Verifiable Execution).

## 1. System Overview and Goals

Safe-Change v0.4 establishes a verifiable-execution security layer for AI-assisted and automated software engineering workflows. The architecture binds code modifications, policy decisions, sandbox constraints, execution traces, semantic changes, and multi-party approvals into a tamper-evident, cryptographically verifiable provenance chain.

The five primary security subsystems are:
1. **AST Semantic Diff Engine**: Syntactic and semantic structural analysis comparing code states across AST representations to detect security-sensitive code mutations (negation inversions, guard removals, error swallowing, test weakening, assertion stripping).
2. **Deterministic Replay Subsystem**: Isolated, environment-controlled reproduction of verification sessions with strict drift classification across 13 distinct drift categories.
3. **Cryptographic Attestation Framework**: DSSE/in-toto-compatible Ed25519 signing of canonicalized verification manifests binding repository state, policies, logs, diffs, and evidence.
4. **OS-Backed Command Sandbox**: Real operating-system process isolation, capability detection, environment sterilization, process-tree termination, and fail-closed enforcement when mandatory isolation guarantees cannot be proven.
5. **Signed Approval Identity Registry**: Cryptographically signed Ed25519 approval grants with tamper-evident chain linking, distinct multi-party thresholds, key rotation, and revocation tracking.

---

## 2. Trust Boundaries & Actor Model

```
+-----------------------------------------------------------------------------------+
| UNTRUSTED REALM                                                                   |
| - AI Agents / LLMs (Claude Code, Cursor, Antigravity, Copilot, etc.)              |
| - Pull Request text, Commit messages, Issues, README files, Source comments       |
| - Dependency code, third-party packages, external environment variables           |
| - Terminal input, shell configuration, test fixture contents                      |
+-----------------------------------------------------------------------------------+
                                      |
                                      | Capability Request / Proposed Change
                                      v
+-----------------------------------------------------------------------------------+
| POLICY ENFORCEMENT POINT (PEP) & SIGNED TRUST LAYER                              |
| - Ed25519 Policy Signature Verification (fails closed on untrusted policy)         |
| - Signed Approval Identity Registry (Ed25519 public keys, roles, revocation)      |
| - Write Lease Controller (single-agent concurrent modification lock)              |
+-----------------------------------------------------------------------------------+
                                      |
                                      | Verified Operation & Sandbox Spec
                                      v
+-----------------------------------------------------------------------------------+
| OS-BACKED SANDBOX RUNNER & SEMANTIC DIFF ENGINE                                   |
| - Direct executable spawn without shell expansion                                 |
| - Isolated temporary HOME, scrubbed environment allowlist                         |
| - Capability verification (Network Deny, ReadOnly, ProcessTree termination)        |
| - TypeScript/JavaScript/JSON AST semantic diffing                                 |
+-----------------------------------------------------------------------------------+
                                      |
                                      | Execution Telemetry & Artifact Digests
                                      v
+-----------------------------------------------------------------------------------+
| INTEGRITY, REPLAY & ATTESTATION CHAIN                                             |
| - Tamper-evident SHA-256 audit log chain                                          |
| - Deterministic replay manifest with 13-category drift detection                  |
| - DSSE canonical JSON serialization and Ed25519 Attestation envelope              |
| - State Decision: VERIFIED | FAILED | NOT VERIFIED | BLOCKED                     |
+-----------------------------------------------------------------------------------+
```

---

## 3. Threat Model and Mitigations

| Threat ID | Threat Description | Attack Vector | Machine-Enforced Mitigation |
| :--- | :--- | :--- | :--- |
| **THREAT-01** | One-character authorization inversion | Agent modifies `if (authorized)` to `if (!authorized)` | AST Semantic Diff parses unary negation changes and flags as `CRITICAL` severity with automatic assurance elevation. |
| **THREAT-02** | Guard and early-return removal | Agent removes auth check or error throw before sensitive operation | AST Diff tracks control flow branch nodes and flags removed guards. |
| **THREAT-03** | Test assertion weakening or skip injection | Agent adds `it.skip()` or removes `expect()` assertions to make suite pass | AST Diff detects `.skip`, `.todo`, and removed assertion statements in test suites. |
| **THREAT-04** | Error swallowing | Agent changes `throw err` to `console.warn` or empty `catch {}` block | AST Diff identifies catch clauses with empty or non-rethrowing bodies. |
| **THREAT-05** | Shell injection via untrusted commands | Arbitrary shell syntax (`|`, `;`, `&&`, `$()`) in command arguments | Sandbox forbids shell execution (`shell: false`), resolving executable paths directly. |
| **THREAT-06** | Inherited credential leakage | Process inherits `AWS_SECRET_ACCESS_KEY`, `NPM_TOKEN`, or private tokens | Strict environment allowlist scrubs all unapproved variables; streaming secret redactor blocks output on leak. |
| **THREAT-07** | Process tree escape on timeout | Child spawns detached background daemons surviving timeout | Recursive process-tree termination kills all descendant PIDs before finalizing check. |
| **THREAT-08** | Symlink and path traversal breakout | Symlinks pointing outside repo root or `../` path components | Path-safety resolver checks realpath and aborts if canonical path escapes workspace boundary. |
| **THREAT-09** | Replay spoofing and environment drift | Replay executed against different commit or modified dependencies | Replay runner validates commit hash, lockfile hashes, policy digest, and workspace fingerprint. |
| **THREAT-10** | Forged or replayed approval grants | Attacker reuses approval from previous session or modifies resource | Ed25519 signature binds request ID, repo hash, resource, capability, nonce, and previous grant digest. |
| **THREAT-11** | Self-approval by rogue agent | Agent attempts to sign its own capability grant | Approval verification checks `requester !== approverIdentity` and validates role against capability owner. |
| **THREAT-12** | Revoked or expired approver key | Attacker signs using revoked or expired private key | Registry enforces validity timestamps (`validFrom`, `validUntil`) and explicit revocation list. |
| **THREAT-13** | Attestation tampering or payload confusion | Attacker modifies 1 byte in evidence bundle or substitutes payload | DSSE envelope domain-separates type and payload; RFC 8785 canonical serialization validates Ed25519 signature. |
| **THREAT-14** | Unsupported sandbox false claim | Environment claims network denial without OS enforcement | Capability detector fails closed (`BLOCKED`) if required isolation is unsupported by OS provider. |

---

## 4. Cryptographic Key Management & Ownership

- **Algorithms**: Ed25519 (RFC 8032) for all signatures; SHA-256 (FIPS 180-4) for digests; RFC 8785 JSON Canonicalization Scheme (JCS) for deterministic serialization.
- **Key Separation**:
  - `Policy Key`: Root organizational key used to sign `.safe-change.json`.
  - `Approver Keys`: Individual user/approver keys with defined roles (`security-lead`, `maintainer`, `release-manager`).
  - `Attestation Key`: Verification authority key used by automated high-assurance build/sync pipelines.
- **Key Storage**:
  - Private keys are NEVER stored in repository files, logs, artifacts, diffs, or evidence bundles.
  - The repository stores only public keys, key IDs, validity windows, and revocation lists in `.safe-change/identities.json` or config.
  - Signing operations consume private keys via secure in-memory buffers or environment paths without echoing to output.

---

## 5. Verification Pipeline State Machine

```
   [Start Verification]
             |
             v
   [Lease & Baseline Check] --------(Fail)------> [NOT VERIFIED]
             |
             v
   [Workspace Fingerprint] ---------(Drift)-----> [FAILED]
             |
             v
   [Capability & Signed Approvals] -(Denied)----> [BLOCKED]
             |
             v
   [Sandbox Capability Check] ------(Missing)----> [BLOCKED]
             |
             v
   [Sandboxed Command Execution] ---(Non-zero)--> [FAILED]
             |
             v
   [AST Semantic Diff] -------------(Critical)--> [FAILED / ESCALATE]
             |
             v
   [Deterministic Replay] ----------(Mismatch)--> [FAILED]
             |
             v
   [Evidence & DSSE Attestation] ---(Invalid)---> [NOT VERIFIED]
             |
             v
        [VERIFIED]
```

---

## 6. Backward Compatibility & Failure Modes

1. **Non-breaking Defaults**: Existing v0.3 configurations remain valid; optional features (attestation, semantic diff, signed approvals) activate when configured or invoked via CLI.
2. **Fail-Closed Principle**: If a high-assurance policy requires a security capability (such as OS network isolation or signed approval) and the environment cannot enforce or verify it, the system returns `BLOCKED` or `NOT VERIFIED`, never a false `VERIFIED`.
3. **Clear Diagnostic Codes**: All failures specify exact failure codes, missing capabilities, or differing AST node ranges.
