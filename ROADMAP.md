# Roadmap

Status definitions:
- **Implemented**: Code written and locally tested.
- **Planned**: Designed but not yet implemented.
- **Deferred**: Intentionally postponed.
- **Exploratory**: Under consideration, no commitment.

No release dates are provided. Milestones are ordered by priority, not by calendar.

## Milestone A -- Core CLI

| Feature | Status |
| --- | --- |
| `save` command with dirty-tree support | Implemented |
| `check` command with full result matrix | Implemented |
| `diff` command with bounded output | Implemented |
| Explicit executable+args command schema | Implemented |
| Configuration drift detection | Implemented |
| Atomic baseline writes | Implemented |
| Versioned baseline and report schemas | Implemented |
| Timeouts and output bounds on checks | Implemented |
| .safe-change/ exclusion without editing .gitignore | Implemented |
| Exit codes 0-5 documented and enforced | Implemented |
| JSON output mode | Implemented |
| Unit tests (config, git, baseline, comparator) | Implemented |
| Integration tests (acceptance, drift, fail-pass) | Implemented |
| SECURITY.md with trust boundaries | Implemented |
| README with honest status labels | Implemented |
| GUIDE.md | Implemented |
| CONTRIBUTING.md | Implemented |

## Milestone B -- Agent Skill and Installer

| Feature | Status |
| --- | --- |
| Canonical Agent Skill (skills/safe-change/SKILL.md) | Planned |
| Interactive installer (npx) | Planned |
| Agent compatibility research | Planned |
| Install/update/uninstall tests | Planned |

## Milestone C -- Distribution Channels

| Feature | Status |
| --- | --- |
| npm package publication | Planned |
| skills.sh directory listing | Planned |
| Claude Code plugin | Planned |
| Antigravity plugin | Planned |
| Codex plugin | Planned |
| Cursor plugin | Planned |
| Kimi Code plugin | Planned |
| Cline plugin | Planned |

## Future

| Feature | Status |
| --- | --- |
| `recover` command with preview and confirmation | Deferred |
| Browser-flow checks | Exploratory |
| CI integration | Exploratory |
| Watch mode | Exploratory |
