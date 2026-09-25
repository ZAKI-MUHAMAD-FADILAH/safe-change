# safe-change

A local-first safety net for AI-assisted coding.

safe-change records what was working before an agent changes your project, detects what changed afterward, and distinguishes new failures from pre-existing ones -- all without silently modifying or losing your work.

## The problem

An agent adds a feature. The app looks better, but login breaks. The next prompt fixes login and breaks the dashboard. Without a known baseline, it is hard to tell which change introduced the regression or whether an error already existed. More prompts can consume time and credits without making progress.

safe-change answers three questions:

1. What was true before the agent changed the project?
2. What changed, and what became worse?
3. What can the user inspect next without losing current work?

It is not another coding agent. It is a small, independent safety layer around one.

## How it works

```bash
# Before the agent makes changes
safe-change save "login and dashboard work"

# Let the agent work...
# Then check for regressions
safe-change check

# Review what changed
safe-change diff
```

```
Baseline: login and dashboard work

Check             Before    Now       Result
---------------------------------------------
build             pass      pass      unchanged
unit-tests        pass      fail      NEW FAILURE

Files:
  Added:     1
  Modified:  3
  Unchanged: 42

NEW FAILURES: 1 check(s) that previously passed now fail.

Exit code: 1 (new regressions detected)
Note: a passing check proves only that its configured command succeeded.
      Unchecked behavior remains unverified.
```

## Commands

| Command | Description |
| --- | --- |
| `safe-change save [description]` | Record a baseline of the repository state and verification results. |
| `safe-change check` | Compare the current state against the baseline. Report new failures, fixes, and drift. |
| `safe-change diff` | Show file-level changes since the baseline. |

All commands accept `--json` for structured output and `--help` for usage information.

## Configuration

Create a `.safe-change.json` in your project root:

```json
{
  "version": 1,
  "checks": [
    {
      "name": "build",
      "executable": "npm",
      "args": ["run", "build"],
      "timeout": 60
    },
    {
      "name": "test",
      "executable": "npx",
      "args": ["vitest", "run"],
      "timeout": 120
    }
  ]
}
```

Checks use an explicit `executable` and `args` array. No shell interpretation occurs.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | No new regressions detected. |
| 1 | At least one previously passing check now fails. |
| 2 | No baseline found or baseline is corrupt. |
| 3 | Configuration error. |
| 4 | Not a Git repository. |
| 5 | Internal error. |

## Who it is for

- Builders who use coding agents and want a readable before-and-after report.
- Developers who want to catch a newly failing check immediately after an agent edit.
- Small teams that want a local, agent-agnostic change safety workflow.

## Safety model

- Never commits, stashes, resets, cleans, or deletes user files.
- No telemetry, cloud dependency, AI API key, or account required.
- Verification commands are spawned directly without a shell.
- Configurable timeouts and bounded output capture.
- Local-only operation, fully offline.

See [SECURITY.md](SECURITY.md) for trust boundaries and vulnerability reporting.

## Documentation

| Document | Contents |
| --- | --- |
| [GUIDE.md](GUIDE.md) | Setup, usage, and troubleshooting |
| [ROADMAP.md](ROADMAP.md) | Shipped and planned features |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development setup and contribution guidelines |
| [SECURITY.md](SECURITY.md) | Trust boundaries and vulnerability reporting |
| [LICENSE_CHANGE.md](LICENSE_CHANGE.md) | Historical licensing transition notice |

## Roadmap

| Milestone | Goal | Status |
| --- | --- | --- |
| Core CLI | `save`, `check`, `diff` with tests | Implemented |
| Agent Skill | Canonical skill for coding agents | Planned |
| Distribution | Plugins for Cursor, Claude Code, Codex, Antigravity, and others | Planned |
| Recovery | Reviewed rollback with preview and confirmation | Deferred |

See [ROADMAP.md](ROADMAP.md) for the full breakdown.

## License

GNU Affero General Public License v3.0 only (SPDX: `AGPL-3.0-only`). See [LICENSE](LICENSE).

For details on the prospective license transition from MIT, see [LICENSE_CHANGE.md](LICENSE_CHANGE.md).

Copyright (c) 2026 ZACK.PRATAMA PT ZYNTRIX ARTIFICIAL INTELIGENCE INDONESIA (SAFE-CHANGE)
