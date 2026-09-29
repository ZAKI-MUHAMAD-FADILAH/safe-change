# Enforcement Core

The Enforcement Core adds capability authorization, a policy decision and enforcement contract, command isolation, detached policy signatures, and expiring multi-party approvals.

## Capability authorization

An agent receives only explicitly configured capabilities:

```json
{
  "agent": "codex",
  "allow": [
    "repository:read",
    "source:write",
    "tests:execute"
  ],
  "deny": [
    "secret:read",
    "release:publish"
  ],
  "resourcePatterns": [
    "src/**",
    "tests/**"
  ],
  "expiresAt": null
}
```

Explicit denial overrides allow. Missing agents and capabilities are denied when `defaultDecision` is `deny`. Expired grants and out-of-scope resources are also denied.

Evaluate an operation before executing it:

```bash
safe-change authorize source:write src/auth/session.ts codex session-123
```

Decisions are `allow`, `deny`, or `require-approval` and are appended to the tamper-evident audit chain.

## Command sandbox

Configured checks can be restricted by:

- executable allowlist;
- exact denied arguments;
- environment-variable allowlist;
- disabled environment inheritance;
- bounded output;
- direct process spawning without a shell;
- mandatory process-tree timeout termination;
- secret redaction before retention.

`networkPolicy: "deny"` fails closed because the current portable runtime does not provide mandatory operating-system network isolation. It never claims that proxy variables or application cooperation equal network denial.

## Approval workflow

Request a scoped approval:

```bash
safe-change approval request \
  release:publish \
  release/safe-change-0.4.0.tgz \
  codex \
  session-release \
  900 \
  "Publish the exact verified artifact"
```

Grant independent approvals:

```bash
safe-change approval grant <request-id> release-owner
safe-change approval grant <request-id> security-owner
```

Authorize the exact approved operation:

```bash
safe-change authorize \
  release:publish \
  release/safe-change-0.4.0.tgz \
  codex \
  session-release \
  <request-id>
```

Requests bind capability, resource, requester, session, reason, and expiration. Grant chains bind each approval to the previous grant and request digest. The requester cannot self-approve when policy prohibits it.

Approver identity is currently a local identifier, not a cryptographically authenticated enterprise identity. Identity-provider integration and signed approval grants remain future work.

## Signed policy root

`policySignature` supports detached Ed25519 verification:

```json
{
  "algorithm": "ed25519",
  "keyId": "security-owner-2026",
  "publicKeyPem": "-----BEGIN PUBLIC KEY-----...",
  "policyDigest": "sha256:...",
  "signatureBase64": "..."
}
```

The signature covers canonical serialization of the complete `enforcementPolicy`. Any policy-byte-equivalent semantic change produces a different digest and invalidates the signature.

```bash
safe-change policy verify
```

When `requireSignedPolicy` is true, missing, malformed, stale, or invalid signatures prevent configuration loading. The repository does not ship a fabricated organizational private key. Activation requires an owner-controlled external signing key.

## Current boundaries

- The authorization command is a machine-enforced contract for Safe-Change-aware clients; universal interception of arbitrary operating-system operations remains future work.
- Approver identity is backed by local identifiers or cryptographically signed Ed25519 identity assertions (see [Verifiable Execution Guide](file:///c:/Users/zakim/OneDrive/Desktop/safe-change/docs/verifiable-execution.md)).
- Network denial and process isolation are handled via the OS Sandbox Provider layer (see [Verifiable Execution Architecture](file:///c:/Users/zakim/OneDrive/Desktop/safe-change/docs/verifiable-execution-architecture.md)).
- Exceptions cannot override explicit capability denial.
- Publishing, tagging, and release creation remain separately approval-gated operations.