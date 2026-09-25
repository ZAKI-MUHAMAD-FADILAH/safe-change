# safe-change

A local-first safety net for AI-assisted coding.

safe-change records what was working before an agent changes a project, detects what changed afterward, distinguishes new failures from pre-existing ones, and helps the user investigate without silently modifying or losing their work.

## Status

**Milestone A: locally implemented and tested.** The CLI compiles, passes all unit and integration tests (including the dirty-working-tree acceptance test), and is ready for local use from a cloned repository. There is no published npm package yet. Do not run `npx safe-change` until a package is published and verified.

## The problem

An agent adds a feature. The app looks better, but login breaks. The next prompt fixes login and breaks the dashboard. Without a known baseline, it is hard to tell which change introduced the regression or whether an error already existed.

safe-change answers three questions:

1. What was true before the agent changed the project?
2. What changed, and what became worse?
3. What can the user inspect next without losing current work?

It is not another coding agent. It is a small, independent safety layer around one.

## Installation

### From source (currently the only verified route)

```bash
git clone https://github.com/ZAKI-MUHAMAD-FADILAH/safe-change.git
cd safe-change
npm install
npm run build
```

After building, run commands with `node dist/cli.js` or link locally with `npm link`.

### npm package (planned)

An `npx safe-change` command will be documented here after the package name is reserved, published, and verified. It does not exist yet.

## Quick start

1. Create a `.safe-change.json` configuration file in your project root:

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

Each check specifies an `executable` and `args` array. The executable is spawned directly without a shell. If you need shell features (pipes, globbing), wrap them in a script.

2. Save a baseline before making changes:

```bash
safe-change save "login and dashboard work"
```

3. Make changes with Cursor, Claude Code, Codex, Antigravity, or another tool.

4. Check for regressions:

```bash
safe-change check
```

5. Review what changed:

```bash
safe-change diff
```

## Example output

```
Baseline: login and dashboard work

Check             Before    Now       Result
---------------------------------------------
build             pass      pass      unchanged
unit-tests        pass      fail      NEW FAILURE

Files:
  Added:     1
  Modified:  3
  Deleted:   0
  Unchanged: 42

NEW FAILURES: 1 check(s) that previously passed now fail.

Exit code: 1 (new regressions detected)
Note: a passing check proves only that its configured command succeeded. Unchecked behavior remains unverified.
```

## Commands

| Command | Behavior |
| --- | --- |
| `safe-change save [description]` | Record a baseline of the repository state and verification results. Works with dirty working trees. Never commits, stashes, resets, or cleans. |
| `safe-change check` | Compare current state against the baseline. Reports new failures, fixed checks, pre-existing failures, configuration drift, and file changes. |
| `safe-change diff` | Show a bounded change summary with file additions, modifications, and deletions. |

### Global options

| Flag | Effect |
| --- | --- |
| `--json` | Output in structured JSON format. |
| `--help` | Show usage information. |
| `--version` | Show version. |

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | No new regressions. Previously passing checks still pass. |
| 1 | At least one previously passing check now fails or times out. |
| 2 | No baseline found or baseline is corrupt. |
| 3 | Configuration error. |
| 4 | Not a Git repository. |
| 5 | Internal error. |

Exit code 0 with pre-existing failures means no NEW regressions were introduced. The output clearly lists checks that were already failing.

## Check result states

| Result | Meaning |
| --- | --- |
| pass-pass | Still passing |
| pass-fail | NEW FAILURE (regression) |
| pass-timeout | Was passing, now times out |
| fail-pass | Previously broken, now fixed |
| fail-fail | Was broken, still broken |
| fail-timeout | Was broken, now times out |
| timeout-pass | Was timing out, now passes |
| timeout-fail | Was timing out, now fails |
| timeout-timeout | Still timing out |
| config-removed | Check was removed from configuration since baseline |
| config-added | New check added since baseline (no baseline to compare) |

## Configuration drift

If the check configuration changes between `save` and `check`, safe-change detects and reports the drift. Removed checks are flagged as `config-removed`. Added checks are flagged as `config-added` with no baseline comparison available.

## Safety model

- All commands are read-only with respect to the Git repository. safe-change never commits, stashes, resets, cleans, or deletes user files.
- Verification commands are spawned directly (no shell) with configurable timeouts and bounded output capture.
- `.safe-change/` tool state is excluded from baselines. If it is not in `.gitignore`, a warning is printed. safe-change never modifies `.gitignore`.
- No telemetry, cloud dependency, AI API key, or account required.
- Local state writes use atomic temp-file-then-rename where practical.
- Diagnostic output sanitizes control characters to prevent terminal injection.

See [SECURITY.md](SECURITY.md) for trust boundaries and vulnerability reporting.

## What safe-change does not guarantee

A passing check proves only that the configured command exited successfully. It does not prove that every feature works, that deployment matches local behavior, or that the application is secure. Unchecked behavior remains unverified and is labeled as such.

## Not in v0.1

- Automatic code fixes or AI-generated diagnoses.
- Automatic rollback. A future `recover` command needs a preview of exact effects, preservation of current work, and explicit user confirmation. `git reset --hard` and `git clean` will never be hidden behind a friendly command.
- Browser-flow, deployment, or security guarantees.
- Cloud accounts or telemetry.

## Roadmap

See [ROADMAP.md](ROADMAP.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).

Copyright (c) 2026 ZACK.PRATAMA PT ZYNTRIX ARTIFICIAL INTELIGENCE INDONESIA (SAFE-CHANGE)
