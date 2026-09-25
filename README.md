# safe-change

**A safety net for AI-assisted code changes.**

safe-change is a planned local-first CLI for people building software with coding agents. It records what was working before a change, then shows what changed and which previously passing checks now fail. It is designed to help users investigate regressions without silently altering or discarding their work.

> **Project status: specification, not a released CLI.** The commands below describe the intended v0.1 interface. There is no verified package or installation command yet. Do not publish this README as if the software already works; update this status only after the commands, tests, and package are implemented and verified.

## The problem

An agent adds a feature. The app looks better, but login breaks. The next prompt fixes login and breaks the dashboard. Without a known baseline, it is hard to tell which change introduced the regression or whether an error already existed. More prompts can consume time and credits without making progress.

safe-change answers three questions:

1. What was true before the agent changed the project?
2. What changed, and what became worse?
3. What can the user inspect next without losing current work?

It is not another coding agent. It is a small, independent safety layer around one.

## Planned workflow

```bash
safe-change save "login and dashboard work"
# Make a change with Cursor, Claude Code, Codex, or another tool.
safe-change check
safe-change diff
```

**Illustrative output, not a result from an existing implementation:**

```text
Checkpoint: login and dashboard work

Check             Before     Now        Result
build             pass       pass       unchanged
login test        pass       fail       new failure

Files: 7 modified, 1 added
Next: inspect the login failure and review changes to authentication files.
Note: unchecked behavior remains unverified.
```

## Planned v0.1 commands

| Command | Intended behavior |
| --- | --- |
| `safe-change save [description]` | Record a baseline of the repository and the results of explicitly configured verification commands. |
| `safe-change check` | Compare current files and check results with the baseline. Distinguish new failures from pre-existing failures. Offer human-readable and JSON output. |
| `safe-change diff` | Summarize changes and show how to inspect the full Git diff. |

A baseline must account for a dirty working tree, including staged, modified, and untracked files. No command may silently commit, stash, reset, clean, or overwrite those files. If a trustworthy comparison is not possible, the tool must say so rather than report a false result.

Verification commands must be chosen explicitly by the user. A passing build does not prove that login, payments, authorization, or any other unchecked behavior works. safe-change must label those areas **not verified**.

### Not in v0.1

- Automatic code fixes or AI-generated diagnoses.
- Automatic rollback. A future `recover` command needs a preview, preservation of current work, and explicit confirmation.
- Browser-flow, deployment, or security guarantees.
- Cloud accounts, telemetry, or a dependency on one coding agent.

## Who it is for

- Builders who use coding agents and want a readable before-and-after report.
- Developers who want to catch a newly failing check immediately after an agent edit.
- Small teams that want a local, agent-agnostic change safety workflow.

## Safety model

The proposed CLI works locally in a Git repository. It should record only the data required for comparisons, limit diagnostic output, set execution timeouts, and avoid unnecessary storage of secrets or file contents. Check commands run in the user's project and must be treated as trusted configuration; repository files and command output are untrusted data. Any diagnostic redaction is best-effort, not a promise that every secret will be found.

The tool is not a backup system. A checkpoint must not be advertised as a restorable backup until recovery behavior and all relevant edge cases have been implemented and tested. See [SECURITY.md](SECURITY.md) for the planned trust boundaries and disclosure process.

## First-release acceptance criteria

Given a temporary Git repository with an existing uncommitted change:

1. The user creates a baseline without losing that change.
2. A subsequent edit causes a previously passing verification command to fail.
3. `safe-change check` identifies the new failure and the files changed since the baseline.
4. The original uncommitted change remains intact.
5. safe-change has not silently committed, stashed, reset, cleaned, uploaded, or deleted any user work.

The release also needs tests for clean and dirty repositories, staged and untracked files, missing baselines, existing failures, timeouts, large output, corrupted state, and filenames with spaces.

## Roadmap

| Milestone | Goal | Status |
| --- | --- | --- |
| v0.1 | Local CLI: `save`, `check`, `diff`, and tests | Planned |
| Next | Reviewed recovery with preview and confirmation | Deferred |
| Later | Opt-in browser-flow checks and agent or CI integrations | Exploratory |

Roadmap entries are intentions, not shipped features or release dates.

## Contributing

The most useful early contributions are reproducible examples of an agent edit that broke previously working behavior, especially cases with uncommitted files. Implementation contributions should preserve the safety model and add tests for any Git or filesystem behavior. Once the repository is published, add its issue and pull-request links here. Do not post credentials, private source, or exploitable vulnerability details in a public issue; follow [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE). The license applies to this repository's contents; it does not mean the proposed CLI has been implemented or security-audited.
