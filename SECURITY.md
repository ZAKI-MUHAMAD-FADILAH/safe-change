# Security policy

> **Project status: specification.** safe-change is not yet a released CLI. This document defines intended security boundaries and a disclosure process to finish before public release. It does not claim a completed audit or existing protections.

## Supported versions

No released version is supported yet. Once releases exist, maintainers must list supported versions and their security-update policy here.

## Reporting a vulnerability

Before accepting public users, enable **GitHub private vulnerability reporting** for the safe-change repository and put its exact reporting link here. This repository and link have not been established in this document.

Until a private reporting channel exists, do not disclose exploit details, tokens, private files, or proof-of-concept code in a public issue. Contact the maintainer through a private channel you already trust. Maintainers should acknowledge reports, coordinate a fix and disclosure with the reporter, and avoid promising response times they cannot meet.

**Release blocker:** establish and test a private reporting route before distributing an executable package.

## Intended trust boundaries

safe-change will run on a developer's machine with access to a Git working tree. It may execute verification commands that the user explicitly configures. Such commands can themselves be destructive or communicate with external services; safe-change cannot make an unsafe user-provided command safe. Users should review configured commands and avoid running untrusted repositories or scripts.

Repository content, file paths, Git output, process output, and any agent-produced text must be treated as untrusted data. None of these should become instructions for a shell or another privileged operation without explicit validation and user consent.

## Required safety properties for v0.1

- `save`, `check`, and `diff` must not silently commit, stash, reset, clean, delete, or overwrite user files.
- Reading a baseline and rendering a report must not execute repository-provided instructions.
- Verification must use an explicit allowlist of user-configured commands and a documented execution model; no implicit execution of arbitrary package scripts.
- Process execution must have timeouts, output bounds, and clear cancellation behavior.
- Local state writes should be atomic where practical; corrupted state must produce an actionable error, not an unsafe recovery attempt.
- Local state and reports should minimize retained source content and avoid storing secrets unless strictly necessary.
- Diagnostic redaction may reduce accidental disclosure, but it is best-effort and is not a secret-detection guarantee.
- No source code, diagnostics, or telemetry may be uploaded without an explicit future opt-in design and disclosure.
- Generated terminal and Markdown output must safely handle control characters and untrusted text.

A future `recover` command will require a separate threat review. It must preview exact effects, preserve current work, and require explicit confirmation. `git reset --hard` and `git clean` must never be hidden behind an innocuous default action.

## What safe-change cannot guarantee

A passing check only proves that the configured check completed successfully under its test conditions. It does not prove that every feature works, that deployment matches local behavior, or that the application is secure. A safe-change baseline is not a general-purpose backup or disaster-recovery guarantee.

## Before release

- Implement and test the documented behavior, including dirty working trees and interrupted runs.
- Review the package entry points, dependencies, file access, process execution, and published package contents.
- Test the private vulnerability reporting link.
- Replace this planning notice with an accurate supported-versions policy and verified implementation details.
