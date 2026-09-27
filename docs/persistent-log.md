# Persistent Safety Log

The persistent safety log records every baseline creation and verification check executed by human developers and AI coding agents. It provides an auditable historical trail of codebase evolution, verification results, and regression occurrences without modifying source control tracking.

## Overview

When developers or agents run `safe-change save` or `safe-change check`, safe-change captures telemetry about Git commits, branch context, file modification counts, test suite outcomes, and execution latency. This data is appended to a local history log, allowing developers to inspect whether regressions occurred during an agent session, view historical pass/fail rates, and audit agent-driven modifications over time.

## Storage Format

Log records are stored in a single JSON file located at:

```
.safe-change/log.json
```

Because `.safe-change/` is excluded from version control, the log remains local to your working repository.

### File Schema

The storage structure follows schema version 1:

```json
{
  "version": 1,
  "retentionMaxEntries": 100,
  "entries": [
    {
      "id": "c1f7a28e-5b12-4d3a-96e1-88f192b8d001",
      "timestamp": "2026-09-28T02:30:00.000Z",
      "trigger": "cli",
      "baselineId": "a1b2c3d4e5f678901234567890abcdef12345678",
      "gitBranch": "main",
      "description": "Baseline before authentication refactor",
      "checkResults": [
        {
          "name": "lint",
          "result": "pass-pass",
          "before": "pass",
          "now": "pass",
          "durationMs": 1420
        },
        {
          "name": "unit-tests",
          "result": "pass-fail",
          "before": "pass",
          "now": "fail",
          "durationMs": 4820
        }
      ],
      "filesChanged": {
        "modified": 4,
        "added": 1,
        "deleted": 0,
        "unchanged": 128
      },
      "regressionDetected": true,
      "durationMs": 6240
    }
  ]
}
```

### Entry Attributes

- `id`: Unique identifier (UUID v4) for the entry.
- `timestamp`: ISO-8601 UTC timestamp of the operation.
- `trigger`: Origin of the execution (`"cli"`, `"mcp"`, or `"manual"`).
- `baselineId`: Target baseline identifier or Git commit SHA recorded.
- `gitBranch`: Name of the active Git branch during execution.
- `description`: Human-readable summary supplied during `save` or generated during `check`.
- `checkResults`: Detailed outcome for each configured command (`result`, `before`, `now`, and runtime in milliseconds).
- `filesChanged`: Count of files modified, added, deleted, and unchanged.
- `regressionDetected`: Boolean indicating whether any check transitioned to failure or a blocking rule was violated.
- `durationMs`: Total wall-clock execution duration in milliseconds.

## CLI Usage

The `safe-change log` command displays, filters, exports, and clears log history.

### Default View

Display the 10 most recent entries in chronological terminal format:

```bash
safe-change log
```

### Specific Count

Inspect the last N entries using `--last`:

```bash
safe-change log --last 5
safe-change log -l 20
```

### Full History

Display all logged entries across the entire project history:

```bash
safe-change log --all
safe-change log -a
```

### JSON Output

Output log entries in structured JSON format for scripting, CI pipelines, or downstream processing:

```bash
safe-change log --json
safe-change log --all --json
```

### Exporting Log Entries

Export log records directly to a standalone file:

```bash
safe-change log --export ./reports/safety-audit.json
```

The exported file contains the full array of selected log entries without modifying the underlying log file.

### Clearing Log History

Clear existing log records when starting a fresh release cycle or cleaning local development artifacts:

```bash
safe-change log --clear
```

In interactive terminal environments, safe-change prompts for user confirmation before clearing. For automated scripts and CI environments, pass the non-interactive flag:

```bash
safe-change log --clear -n
safe-change log --clear --non-interactive
```

## Retention Policy

To prevent unbounded disk consumption, safe-change automatically rotates log entries using a FIFO (first-in, first-out) policy when entries exceed the configured retention limit.

- The default retention limit is **100 entries**.
- When an operation appends the 101st entry, the oldest entry is removed atomically.
- The retention limit is preserved in `.safe-change/log.json` under `retentionMaxEntries`.

## Export and Backup

Because `.safe-change/log.json` is not committed to Git, backing up or transferring logs across machines can be achieved by:

1. Running `safe-change log --export <path>` to archive history into build artifacts.
2. Incorporating `safe-change log --json` into CI pipelines to publish verification telemetry to artifact storage.
3. Querying the log programmatically via the `safe_change_log` tool in MCP-enabled agents.
