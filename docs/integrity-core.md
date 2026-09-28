# Integrity Core

The v0.4 Integrity Core binds an editing session to one writer, one workspace identity, bounded verification output, and a checksummed evidence bundle.

## Safe workflow

```bash
safe-change lease acquire session-20260929 cursor
safe-change save "change intent"
safe-change fingerprint check

# Apply the bounded change.

safe-change assess --json
safe-change check --json
safe-change evidence session-20260929 cursor
safe-change audit verify
safe-change lease release session-20260929
```

An active lease owned by a different session is a blocking conflict. A session cannot release another session's lease. Lease state is written atomically with owner-only file permissions where supported.

## Workspace fingerprint

Every new baseline contains a fingerprint over:

- Git HEAD and branch;
- a hashed remote identity;
- `.safe-change.json`;
- safety rules;
- discovered lockfiles;
- enterprise policy version;
- canonical skill;
- agent profile;
- Node.js version;
- operating system and architecture.

Fingerprint comparison reports explicit categories such as `HEAD_DRIFT`, `CONFIGURATION_DRIFT`, `DEPENDENCY_DRIFT`, `POLICY_DRIFT`, and `ENVIRONMENT_DRIFT`. Drift prevents a fully verified conclusion until it is investigated and a new baseline is intentionally recorded.

Remote URLs are hashed before persistence so credentials or private repository locations are not copied into evidence.

## Secret-output blocking

Verification stdout and stderr pass through a streaming redactor before bounded diagnostic retention. Detection:

1. removes the value from retained output;
2. emits a secret-class marker such as `[REDACTED:github-token]`;
3. records the detected classes;
4. forces the check to fail even when the underlying process exits with code 0.

The scanner covers common token, private-key, cloud-key, authorization-header, connection-string, and secret-assignment formats. It supplements provider secret scanning and does not replace credential rotation after exposure.

## Evidence bundle

`safe-change evidence <session-id>` creates:

```text
.safe-change/evidence/<session-id>/
├── baseline-summary.json
├── diff-summary.json
├── environment-fingerprint.json
├── manifest.json
├── verification-report.json
└── checksums.txt
```

The bundle stores no source file bodies and no captured command output. It records file paths, counts, verification states, environment identity, and cryptographic digests.

## Tamper-evident audit events

Lease and evidence operations append events to `.safe-change/events.jsonl`. Every event commits to the previous event digest. `safe-change audit verify` recomputes the chain and fails if an event was changed, removed, reordered, or inserted without rebuilding all following digests.

This local hash chain detects tampering but is not yet an externally anchored signature. Sigstore signing, trusted timestamps, remote transparency anchoring, and deterministic replay remain follow-up milestones.

## Current boundaries

- The lease is enforced by Safe-Change-aware clients; operating-system mandatory locking remains future work.
- Evidence is checksummed but not yet signed by a trusted identity.
- Fingerprints intentionally hash remote identity instead of storing the remote URL.
- Secret detection is pattern-based and can produce false positives or miss unknown formats.
- Network isolation, executable allowlists, environment allowlists, and resource quotas belong to the command-sandbox milestone.