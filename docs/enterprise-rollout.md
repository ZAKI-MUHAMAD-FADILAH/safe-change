# Enterprise Rollout Guide

This guide defines a controlled organization-wide deployment model for `safe-change` across developer workstations, CI systems, and AI coding agents.

## 1. Deployment principles

- Treat `.safe-change.json`, package scripts, build files, and CI workflows as executable policy.
- Pin `safe-change` to an approved version. Do not deploy from a moving branch.
- Use project-scoped agent installation unless global installation is explicitly managed.
- Keep native execution optional. Set `SAFE_CHANGE_NATIVE_DISABLED=1` when platform validation or incident containment requires the TypeScript fallback.
- Never use a baseline as a source backup. Existing Git and backup controls remain mandatory.
- Review verification commands before running them on untrusted pull requests.

## 2. Organizational roles

| Role | Responsibility |
| --- | --- |
| Platform owner | Approves versions, rollout rings, CI policy, and rollback decisions |
| Security owner | Reviews advisories, dependency risk, and release provenance |
| Repository owner | Maintains `.safe-change.json` and repository-specific checks |
| Developer | Reviews the baseline and verification report before accepting AI edits |
| Incident lead | Coordinates containment, rollback, evidence preservation, and communication |

Separate approval is recommended for release publication and organization-wide policy changes.

## 3. Rollout rings

### Ring 0: validation

- Use disposable repositories and representative technology stacks.
- Validate CLI installation, MCP transport, agent adapters, native loading, and TypeScript fallback.
- Confirm no source files, Git metadata, or unrelated configuration are modified.

Exit criteria:
- Supported platform smoke tests pass.
- Security and legal review is complete.
- Rollback procedure is rehearsed.

### Ring 1: engineering pilot

- Deploy to a small set of volunteer repositories.
- Pin the exact package version.
- Record false positives, false negatives, command duration, timeout frequency, and rollback events outside `safe-change`.
- Require human review of `.safe-change.json` changes.

Exit criteria:
- No critical safety incident.
- Verification commands are stable and bounded.
- Repository owners approve their policies.

### Ring 2: department rollout

- Distribute an approved configuration template through the organization's normal configuration-management system.
- Require protected pull requests for changes to `.safe-change.json`, lockfiles, agent skills, and CI workflows.
- Use the same package version across the rollout ring.
- Maintain a documented exception process for unsupported platforms.

Exit criteria:
- Support ownership and escalation paths are active.
- Upgrade and rollback drills pass.
- Required repositories report successful validation.

### Ring 3: organization-wide rollout

- Promote only the exact version and artifact digest validated in earlier rings.
- Enforce version pinning, CODEOWNERS, required CI checks, and release provenance.
- Monitor adoption and failures using organization-owned systems; `safe-change` sends no telemetry.
- Review supported versions and dependency advisories on a fixed cadence.

## 4. Standard repository policy

Each repository should define checks that are deterministic, non-interactive, and safe to run with developer permissions. Recommended gates include:

1. Static type checking or compilation.
2. Unit and integration tests.
3. Formatting or lint validation.
4. Generated-file or schema validation.
5. Security checks appropriate for the stack.

Timeouts should reflect measured execution time and remain below the maximum supported limit. Commands must not require secrets unless they run in an isolated CI environment designed for that purpose.

## 5. Agent deployment

Use `safe-change install <agent> --scope project` for repository-scoped installation. Validate every supported agent against [agent-compatibility.md](agent-compatibility.md) and [runtime-verification.md](runtime-verification.md).

Global installations must be deployed by endpoint management and limited to the documented agent directories. Do not redirect installation targets through symlinks or junctions.

## 6. Upgrade policy

1. Review the changelog, security policy, and provenance for the target version.
2. Validate the new version in Ring 0 and Ring 1.
3. Confirm configuration compatibility and version parity.
4. Promote the exact version without version ranges.
5. Retain the previous approved version for rollback.

Do not combine a `safe-change` upgrade with unrelated repository migrations.

## 7. Rollback and containment

- Pin or reinstall the previous approved package version.
- Set `SAFE_CHANGE_NATIVE_DISABLED=1` if the incident is isolated to native loading.
- Disable affected agent integrations without deleting repository baselines.
- Preserve `.safe-change` state and CI logs for investigation.
- Re-run the previous approved verification suite.
- Follow [operations-runbook.md](operations-runbook.md) for detailed response procedures.

## 8. Enterprise acceptance checklist

- [ ] Approved version and integrity evidence recorded.
- [ ] npm provenance verified.
- [ ] Required CI checks and CODEOWNERS enabled.
- [ ] Private vulnerability reporting enabled.
- [ ] Security, support, and incident owners assigned.
- [ ] Pilot results reviewed and approved.
- [ ] Upgrade and rollback procedures rehearsed.
- [ ] Unsupported platform exceptions documented.
- [ ] Organization-owned monitoring and audit retention configured.
