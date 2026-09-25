---
name: safe-change
description: A local-first safety net for AI-assisted coding. Records baselines before edits, detects regressions afterwards, and inspects file-level changes without altering user work.
---

# safe-change Agent Skill

safe-change is a local-first safety net for AI-assisted coding. It establishes an explicit checkpoint of repository files and verification results before modifications, detects regressions immediately after edits, and provides bounded file change summaries without silently altering the user's working tree.

## Non-Negotiable Safety Rules

When operating as an AI agent using safe-change, you must strictly observe these safety boundaries:

1. **Zero Silent Git Alteration**: Never execute `git commit`, `git stash`, `git reset`, `git clean`, or `git checkout` as part of safe-change workflows. All user work—including uncommitted, dirty, or untracked changes—must remain preserved and untouched.
2. **No Silent Configuration or State Injection**: Never edit `.gitignore` or any user configuration file automatically to hide or store tool state. safe-change keeps state in `.safe-change/` and warns if it is unignored, but does not modify `.gitignore`.
3. **No False Verification Claims**: If the `safe-change` CLI is not installed or unavailable, you must never claim that verification checks or baselines were performed. Clearly state that safe-change is unavailable.
4. **Honest Verification Boundaries**: A passing check proves only that its configured command exited with code 0. Unchecked code paths and behaviors remain unverified.

## Checking CLI Availability

Before invoking safe-change, determine whether the CLI binary is available:

```bash
safe-change --version
```

If the command fails (e.g. command not found, exit code non-zero, or spawn error):
- **Status is UNAVAILABLE**: Do not attempt to run `save`, `check`, or `diff`.
- Inform the user: "safe-change CLI is not installed or not available on PATH. Verification baseline cannot be recorded."
- Offer manual verification alternatives (running tests directly) or instruct the user on building and linking safe-change locally.

## Invocation Contract

safe-change is invoked as a command-line interface executable. It supports three primary subcommands:

### 1. `safe-change save [description]`

Records a baseline snapshot of all files and executes the configured verification checks.

- **Arguments**:
  - `[description]`: Optional human-readable description of the baseline (e.g., `safe-change save "refactor auth module"`).
- **Flags**:
  - `--json`: Outputs structured JSON report containing baseline metadata and check results.
  - `--verbose`: Includes detailed execution and check diagnostic logs.
- **Exit Codes**:
  - `0`: Baseline created successfully and stored in `.safe-change/baseline.json`.
  - `2`: State error (e.g., failed to write baseline).
  - `3`: Configuration error (missing or invalid `.safe-change.json`).
  - `4`: Current directory is not a Git repository.
  - `5`: Internal execution error.

### 2. `safe-change check`

Compares the current repository state and verification checks against the baseline.

- **Flags**:
  - `--json`: Outputs structured JSON report with per-check comparison (`result`, `before`, `now`), file changes, and summary.
  - `--verbose`: Includes captured stdout/stderr tails for failing checks.
- **Exit Codes**:
  - `0`: No new regressions detected. Baseline-passing checks continue to pass, pre-existing failures (`fail-fail`) remain non-regressive, or check definitions changed.
  - `1`: Regression detected. At least one check that previously passed now fails (`pass-fail`) or times out (`pass-timeout`).
  - `2`: No baseline found or baseline file is corrupt.
  - `3`: Configuration error (invalid `.safe-change.json` schema or executable).
  - `4`: Not a Git repository.
  - `5`: Internal execution error.

### 3. `safe-change diff`

Displays a file-level change summary (added, modified, deleted, unchanged) relative to the baseline.

- **Flags**:
  - `--json`: Outputs JSON structure with file lists (`added`, `modified`, `deleted`, `unchangedCount`) and `lineDiffAvailable: false`.
- **Exit Codes**:
  - `0`: Diff computed successfully.
  - `2`: No baseline found.
  - `4`: Not a Git repository.
- **Note on Line Diffs**: safe-change stores SHA-256 integrity hashes at baseline rather than full file contents to protect privacy and bound storage. Exact line diffs from baseline are unavailable; use standard `git diff` for uncommitted working tree changes.

## Recommended Agent Workflow

Follow this three-step workflow when assisting with code changes:

### Step 1: Save Before Risky Edits

Before making substantive, multi-file, refactoring, or dependency changes, create a baseline:

```bash
safe-change save "pre-refactor baseline"
```

If checks fail during baseline creation, observe them. safe-change records their failing status so they are not flagged as new regressions later.

### Step 2: Perform the Modification

Make the necessary edits to the workspace files using standard editing tools. Preserve user work and do not stash or reset preexisting uncommitted files.

### Step 3: Check After Edits

Immediately after completing the modification, verify integrity:

```bash
safe-change check
```

Interpret the results:
- If exit code is `0`: Report that all previously passing checks continue to pass without new regressions.
- If exit code is `1`: A regression was introduced. Review the failing check output and repair the regression before completing your turn.

### Step 4: Diff When Summary is Needed

When the user asks what changed or when reviewing scope before completion:

```bash
safe-change diff
```

Use this bounded file list to review modified, added, and deleted files.

## State Classification Matrix

Always classify verification outcomes into one of these four distinct states:

| State | Definition | safe-change Equivalent |
|---|---|---|
| **Verified** | Configured check passed both at baseline and currently, or a previously failing check was resolved. | `pass-pass`, `fail-pass` |
| **Failed** | A check that passed at baseline now fails or times out (regression), or a pre-existing failure remains broken. | `pass-fail` (exit 1), `pass-timeout` (exit 1), `fail-fail` (exit 0) |
| **Not Verified** | No checks are configured in `.safe-change.json`, or a check definition was modified since baseline (commands or parameters changed). | `unverified`, `definition-changed` (config drift) |
| **Unavailable** | The `safe-change` executable is not installed or not discoverable on PATH. | Command execution failure |

## Configuration File Reference

safe-change requires a `.safe-change.json` file in the repository root. Commands are executed explicitly without shell expansion:

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
      "executable": "npm",
      "args": ["test"],
      "timeout": 120
    }
  ]
}
```

- `executable`: Exact binary name or path. No shell strings.
- `args`: Array of string arguments.
- `timeout`: Maximum run duration in seconds (1 to 3600).
