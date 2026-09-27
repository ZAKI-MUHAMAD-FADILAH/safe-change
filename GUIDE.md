# Guide

A beginner-friendly guide to safe-change: setup, usage, troubleshooting, and key concepts.

## What safe-change is

safe-change is a command-line tool that helps you track the state of your project before and after an AI coding agent makes changes. It answers: did anything that was working before just break?

It works locally in a Git repository. It does not require a cloud account, AI API key, or internet connection.

## Key concepts

**CLI**: The core program you run in a terminal. It inspects Git state, runs your configured checks, saves baselines, and compares results. This is the actual engine.

**Configuration**: A `.safe-change.json` file in your project root that lists the verification commands you want to track.

**Baseline**: A snapshot of your project state (file hashes, check results) at a point in time. Saved to `.safe-change/baseline.json`.

**Check**: A verification command (build, test, lint) that safe-change runs and tracks. Defined in your configuration with an explicit executable and arguments array.

**Agent Skill**: An instruction file that teaches a coding agent when and how to invoke the safe-change CLI. A skill alone cannot run checks; it needs the CLI installed. The canonical skill is implemented at [skills/safe-change/SKILL.md](skills/safe-change/SKILL.md).

**Plugin**: An agent-specific package that bundles skills, rules, or configurations.

**Installer**: Built-in CLI commands (`install`, `update`, `uninstall`, `status`) to safely manage agent skills in project or global scopes. Currently supports Antigravity (filesystem validated; runtime discovery not independently verified).

## Setup

### Prerequisites

- Node.js 18 or later
- Git
- A Git repository (safe-change requires one)

### Install from source

```bash
git clone https://github.com/ZAKI-MUHAMAD-FADILAH/safe-change.git
cd safe-change
npm install
npm run build
```

To use `safe-change` as a command, either:
- Run directly: `node /path/to/safe-change/dist/cli.js`
- Or link globally: `npm link` (from the safe-change directory)

### Configure your project

Create a `.safe-change.json` file in your project root:

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

Each check has:
- `name`: a human-readable label
- `executable`: the program to run (spawned directly, not via a shell)
- `args`: array of arguments passed to the executable
- `timeout`: seconds before the check is killed (default: 60)

If you need shell features like pipes or globbing, create a wrapper script and point the executable at that script.

### Add .safe-change/ to .gitignore

safe-change stores its state in `.safe-change/`. Add it to your `.gitignore`:

```
.safe-change/
```

safe-change will warn you if this is missing but will never modify your `.gitignore` for you.

## Usage workflow

### 1. Save a baseline

Before an agent makes changes:

```bash
safe-change save "login and dashboard work"
```

This records:
- Every tracked and untracked file with its hash
- The results of all configured checks
- Git state (branch, commit, clean/dirty status)

It works with dirty working trees. It never commits, stashes, or resets anything.

### 2. Let the agent work

Use Cursor, Claude Code, Codex, Antigravity, or any other tool.

### 3. Check for regressions

```bash
safe-change check
```

This re-runs your configured checks and compares results against the baseline. It reports:
- New failures (things that were passing and now fail)
- Fixed checks (things that were failing and now pass)
- Pre-existing failures (things that were already broken)
- Configuration drift (checks added or removed since baseline)
- File changes (added, modified, deleted)

### 4. Review changes

```bash
safe-change diff
```

Shows a summary of file changes (added, modified, deleted, unchanged). Exact line diffs from baseline are unavailable because safe-change records integrity hashes rather than full file contents to protect privacy. Run `git diff` to inspect uncommitted changes in your working tree.

### 5. Use JSON output

Add `--json` to any command for structured output:

```bash
safe-change check --json
```

## Using with Coding Agents

safe-change provides a canonical Agent Skill at [skills/safe-change/SKILL.md](skills/safe-change/SKILL.md).

When working with an AI coding agent:
1. Provide the skill instructions to the agent.
2. The agent checks if the CLI is available via `safe-change --version`.
3. If available, the agent follows the safety workflow:
   - `safe-change save "<description>"` before risky edits.
   - `safe-change check` immediately after modifications to catch regressions.
   - `safe-change diff` when a file change summary is needed.
4. The skill enforces non-negotiable safety rules: the agent is forbidden from running `git commit`, `git stash`, `git reset`, `git clean`, or `git checkout`, preserving all uncommitted work.

## Agent Skill Installer (Antigravity)

safe-change includes production installer commands to manage agent skills.
Current support: **Antigravity (filesystem validated; runtime discovery not independently verified)**.

### Target Scopes

safe-change supports two target scopes:

1. **Project Scope (`--scope project` or default)**:
   - Target path: `<workspaceRoot>/.agents/skills/safe-change/SKILL.md`
   - Scope isolation: Confined strictly within the Git repository root.
   - Ideal for teams who want to version the agent skill within project settings.

2. **Global Scope (`--scope global` or `--global` / `-g`)**:
   - Target path: `<homedir>/.gemini/config/skills/safe-change/SKILL.md`
   - Scope isolation: Confined strictly to an explicit allowlist within the user's home directory.
   - Ideal for developers who want the safe-change skill available across all local workspaces.

### Installer Workflow

```bash
# 1. Preview changes with dry-run (no disk writes)
safe-change install antigravity --dry-run

# 2. Install to project scope
safe-change install antigravity

# Or install to global scope
safe-change install antigravity --global

# 3. Verify status and inspect drift
safe-change status antigravity

# 4. Update installed skill when canonical skill changes
safe-change update antigravity

# 5. Uninstall skill safely
safe-change uninstall antigravity
```

### Dry-Run Simulation

Adding `--dry-run` performs full path validation, collision inspection, and SHA-256 calculation without writing to disk or creating directories:

```bash
safe-change install antigravity --dry-run
```

Example output:

```
safe-change installer: Antigravity (Google DeepMind)
Scope: project
Target: /tmp/my-project/.agents/skills/safe-change
Dry run: Would install skill to '/tmp/my-project/.agents/skills/safe-change'. SHA-256: d73eaa851e868c90e2e387829bf24124ce59dba518b833e72bcf6e82d9af33d0.
SHA-256: d73eaa851e868c90e2e387829bf24124ce59dba518b833e72bcf6e82d9af33d0
```

### Collision and Ownership Protection

The installer provides strict guarantees to prevent data loss or unintended overwrites:

- **Up-to-Date Recognition**: If the target skill already contains byte-identical content and is owned by safe-change, the installer reports `up_to_date` without modifying disk timestamps.
- **Collision Detection**: If the target contains differing content, the installer will not overwrite silently. In interactive mode, it prompts for confirmation (`y/N`). In non-interactive mode (`--non-interactive`), it fails with exit code 7 unless `--overwrite` is explicitly provided.
- **Ownership Manifest**: Installations write `.safe-change-manifest.json` recording the version, owning agent, scope, and SHA-256 hashes of installed files.
- **Uninstall Safety**: `safe-change uninstall` validates ownership before removing files. If untracked foreign files are present in the target directory, uninstallation aborts with exit code 7 to protect user files.
- **Symlink / Junction Rejection**: Targets or canonical sources that are symbolic links or junctions are rejected with exit code 9 (`INCOMPATIBLE_TARGET`).

### Exit Codes Reference

| Code | Label | Meaning |
| --- | --- | --- |
| 0 | `OK` | Success / No new regressions detected. |
| 1 | `NEW_FAILURE` | At least one previously passing check now fails. |
| 2 | `NO_BASELINE` / `STATE_ERROR` | State error / No baseline found or target not installed. |
| 3 | `CONFIG_ERROR` | Configuration or argument parsing error. |
| 4 | `NOT_GIT_REPO` | Not a Git repository (required for project operations). |
| 5 | `INTERNAL_ERROR` | Unhandled internal exception. |
| 6 | `OPERATION_CANCELLED` | Operation cancelled by user prompt rejection. |
| 7 | `COLLISION_DETECTED` | Existing differing content; explicit `--overwrite` required. |
| 8 | `OWNERSHIP_CONFLICT` | Target directory is not owned by safe-change. |
| 9 | `INCOMPATIBLE_TARGET` | Incompatible target path or unsupported agent. |

## Troubleshooting

### "Not a Git repository"

safe-change requires a Git repository. Initialize one with `git init` if needed.

### "Configuration file not found"

Create a `.safe-change.json` file in your project root. See the configuration section above.

### "No baseline found"

Run `safe-change save` before running `safe-change check`.

### "Baseline file is corrupt"

Delete `.safe-change/baseline.json` and run `safe-change save` again.

### "Unsupported baseline schema version"

The baseline was created by a different version of safe-change. Delete it and create a new one.

### A check times out

Increase the `timeout` value in your `.safe-change.json` for that check.

### Exit code 0 but checks are failing

Exit code 0 means no NEW regressions. If checks were already failing at baseline time, they show as `fail-fail` (still failing). This is intentional: safe-change reports what got worse, not what was already broken.

## Update

Pull the latest source and rebuild:

```bash
cd safe-change
git pull
npm install
npm run build
```

## Uninstall

If you used `npm link`, unlink first:

```bash
npm unlink -g safe-change
```

Delete the cloned directory. In your projects, you can also remove the `.safe-change/` directory and `.safe-change.json` configuration file.
