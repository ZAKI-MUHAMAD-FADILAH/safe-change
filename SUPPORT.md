# Support policy

## Supported versions

| Version line | Status | Support policy |
| --- | --- | --- |
| `0.3.x` | Active | Correctness and security fixes |
| `0.2.x` | Maintenance | Critical security fixes only |
| `<0.2.0` | Unsupported | Upgrade required |

## Support channels

- Bugs and reproducible regressions: open a GitHub issue.
- Feature requests: open a GitHub issue with the expected workflow and constraints.
- Security vulnerabilities: follow [SECURITY.md](SECURITY.md) and use private vulnerability reporting.
- Commercial licensing and enterprise support: contact the maintainer through the channels listed on the GitHub profile.

Do not include credentials, proprietary source code, private repository content, or exploit details in public issues.

## Issue severity

| Severity | Definition | Recommended operator action |
| --- | --- | --- |
| Critical | Data loss, repository escape, credential exposure, or release compromise | Stop rollout and disable the affected path |
| High | Incorrect verification decision or broad workflow outage | Pause upgrades and apply the next patch |
| Medium | Degraded functionality with a safe workaround | Track and schedule remediation |
| Low | Documentation, usability, or non-blocking behavior | Address through normal maintenance |

Response and resolution times are best-effort unless a separate written support agreement applies.
