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

## Milestone B -- Agent Skill

| Feature | Status |
| --- | --- |
| Canonical Agent Skill (skills/safe-change/SKILL.md) | Implemented |
| Skill unit and integration tests | Implemented |

## Milestone C -- Distribution and Installation

### C.1 -- Compatibility Research and Fixture (Implemented)

| Feature | Status |
| --- | --- |
| Agent compatibility research (docs/agent-compatibility.md) | Implemented |
| Antigravity filesystem fixture (tests/integration/antigravity-fixture.test.ts) | Implemented |
| Antigravity fixture documentation (docs/antigravity-fixture.md) | Implemented |
| Home-directory boundary protection | Implemented |
| Platform-aware case-sensitivity detection | Implemented |
| Symlink, junction, and TOCTOU defense | Implemented |

### C.2 -- Installer Architecture (Implemented)

| Feature | Status |
| --- | --- |
| Installer architecture document (docs/installer-architecture.md) | Implemented |
| Command design and scope model | Implemented |
| Collision, update, uninstall, and rollback strategy | Implemented |
| Security threat model | Implemented |

### C.3 and Beyond -- Plugins and Publication (Next)

| Feature | Status |
| --- | --- |
| Interactive installer (npx) | Planned |
| Install/update/uninstall tests | Planned |
| npm package publication | Planned |
| Antigravity plugin | Planned |
| Claude Code plugin | Planned |
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
