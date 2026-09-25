# Security policy

## Status

safe-change v0.1 is locally implemented and tested. This document describes the security boundaries as they exist in the current implementation. It will be updated when the CLI is published as a package.

## Supported versions

No released package version exists yet. When releases begin, this section will list supported versions and their security-update policy.

## Reporting a vulnerability

Before distributing an executable package, enable **GitHub private vulnerability reporting** for the safe-change repository and verify the reporting link works. The link will be added here once established and tested.

Until a private reporting channel exists, do not disclose exploit details, tokens, private files, or proof-of-concept code in a public issue. Contact the maintainer through a private channel you already trust. Maintainers should acknowledge reports, coordinate a fix and disclosure with the reporter, and avoid promising response times they cannot meet.

**Release blocker:** establish and test a private reporting route before distributing an executable package.

## Trust boundaries

### What safe-change accesses

safe-change runs on a developer's machine with access to a Git working tree. It reads repository files, Git metadata, and executes verification commands that the user explicitly configures in `.safe-change.json`.

### Repository read boundary and symlinks

safe-change operates strictly within the working tree of the Git repository. When encountering symbolic links inside the repository, safe-change uses `lstat` and `readlink` to inspect only the link target path string itself. It never traverses or opens target files located outside the repository root. This ensures that symlinks cannot be used to escape the repository read boundary or expose external filesystem content into baseline data. Broken symlinks or symlinks pointing to directories are hashed by their link target string without traversing.

Platform note: On Windows systems, creation of symbolic links in tests or development may require elevated administrator privileges or Developer Mode enabled in Windows Settings.

### What safe-change writes

safe-change writes only to the `.safe-change/` directory within the project root. It creates:
- `baseline.json`: the baseline state file
- Temporary files during atomic writes (immediately renamed or cleaned up)

safe-change never writes to `.gitignore`, `.git/`, or any other user file.

### Process execution

Verification commands are spawned directly via `child_process.spawn` without a shell. The executable and arguments are taken from the configuration file's explicit `executable` and `args` fields. No shell interpretation occurs.

Each command runs with:
- A configurable timeout (default 60 seconds, maximum 3600 seconds)
- Bounded output capture (default 100 KB per stream, 8 KB diagnostic tail)
- No stdin (stdin is set to `ignore`)
- Explicit timeout timers that accurately distinguish between execution timeouts and external process termination signals

### Data treatment

- Repository content, file paths, Git output, process output, and any agent-produced text are treated as untrusted data.
- Terminal output sanitizes control characters (stripping non-printable control characters except newline, carriage return, and tab) to mitigate terminal escape injection.
- JSON output uses standard serialization without executing embedded content.
- Baseline files store file hashes (sha256), not file contents. This privacy-preserving design minimizes disk footprint and prevents accidental leakage of secrets or source code into tool state.
- Process stdout/stderr is captured in bounded buffers for diagnostic display. safe-change does NOT perform automated secret or token detection; configured checks should avoid emitting sensitive credentials.

## Implemented safety properties

- `save`, `check`, and `diff` do not commit, stash, reset, clean, delete, or overwrite user files. This is verified by the integration test suite.
- Reading a baseline and rendering a report does not execute repository-provided instructions.
- Verification uses an explicit allowlist of user-configured commands with a documented execution model. No implicit execution of arbitrary package scripts.
- Process execution has timeouts, output bounds, and clean termination behavior.
- Local state writes use atomic temp-file-then-rename. Corrupted state produces an actionable error message.
- No source code, diagnostics, or telemetry is uploaded.
- No telemetry, cloud dependency, AI API key, or account is required.

## What safe-change cannot guarantee

A passing check only proves that the configured check completed successfully under its test conditions. It does not prove that every feature works, that deployment matches local behavior, or that the application is secure.

User-configured verification commands can themselves be destructive or communicate with external services. safe-change cannot make an unsafe user-provided command safe. Users should review configured commands and avoid running untrusted repositories or scripts.

A safe-change baseline is not a general-purpose backup. It stores hashes for comparison, not full file contents for restoration.

safe-change does not redact secrets, API keys, or sensitive credentials from process output or terminal displays. Ensure configured test commands do not print credentials.

## Before package release

- Implement and test the private vulnerability reporting link.
- Review the package entry points, dependencies, file access, process execution, and published package contents.
- Replace the "no released version" notice with an accurate supported-versions policy.
