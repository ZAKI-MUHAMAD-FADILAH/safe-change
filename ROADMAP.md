# safe-change Roadmap

This document tracks the planned development milestones
for safe-change from current release to v1.0.

Status labels: Done | In Progress | Planned

---

## v0.1.0 -- Core CLI (Done)

- save, check, diff commands
- Baseline management with atomic writes
- Configuration drift detection
- Symlink boundary enforcement
- Canonical Agent Skill (SKILL.md)
- Antigravity installer
- Full test suite, CI on Ubuntu/macOS/Windows

## v0.1.1 -- Multi-Agent Support (Done)

- Support for 10 AI coding agents:
  Antigravity, Claude Code, Cursor, Codex, Cline,
  Kimi Code, Amp, OpenCode, Gemini CLI, GitHub Copilot
- BaseAdapter class
- safe-change install all command
- Agent auto-detection via detectInstalledAgents
- Collision detection for shared skill paths
- Antigravity runtime verification protocol
- Native binary distribution architecture

## v0.1.2 -- MCP Server (Done)

- Expose safe-change as a Model Context Protocol server
- Tools: safe_change_save, safe_change_check,
  safe_change_diff, safe_change_status
- stdio transport, zero configuration
- Agent setup documentation for all 10 supported agents
- Agents can invoke safe-change directly without SKILL.md

## v0.2.0 -- Safety Observability & Guardrails (Done)

- Persistent Safety Log: full baseline and verification history
  stored in .safe-change/log.json
- safe-change log command with --last, --all, --json,
  --export, and --clear options
- safe_change_log MCP tool for agent access to historical telemetry
- Local Dashboard at localhost:4242 via safe-change dashboard
- 4 Dashboard panels: System State, Monitored Baseline,
  Regression Timeline stream, and Safety Guardrails
- Safety Rules Registry: safe-change rules list/add/remove/validate
- Zero-dependency platform-aware rule evaluation engine
- 6 built-in rules: no-delete-migrations, no-delete-env,
  no-modify-lockfile, max-files-changed,
  max-deleted-files, require-tests-pass
- Blocking rule violations with exit code 1 and warning rules
  integrated into safe-change check and safety log

## v0.3.0 -- Developer Ergonomics & Monorepo Synchronization (Done)

- safe-change init with multi-ecosystem test runner auto-detection
- safe-change diff --stat line change statistics calculation
- Multi-agent runtime verification matrix and test specifications
- Commercial AGPL-3.0 copyleft boundaries clarified
- Unified version synchronization across Rust crate and 7 npm platform packages

## v1.0.0 -- Production Stable & High-Assurance Enterprise Platform (Released)

- Risk scoring engine (0-100) and automatic operating-mode selection (Done)
- Machine-readable enterprise policy and change-budget enforcement (Done)
- Anti-policy-downgrade detector and fail-closed approval gate (Done)
- AST semantic diff engine with TypeScript/JavaScript & JSON parsers (Done)
- Multi-agent atomic write leases and workspace fingerprint engine (Done)
- Checksummed evidence bundles and tamper-evident SHA-256 audit chain (Done)
- In-toto RFC 8785 Ed25519 cryptographic attestations and deterministic replay (Done)
- Streaming secret-output blocker for credentials, tokens, and keys (Done)
- Capability-based agent permissions and PDP/PEP authorization (Done)
- OS-backed command sandbox with process tree isolation and environment scrubbing (Done)
- Ed25519 approval identity trust registry and multi-party signing (Done)
- Enterprise Liquid Glass Dashboard with `/SAFE-CHANGE` brand mark, 6 Hero Metrics, and 6 Segments (Done)
- Zero-dependency embedded REST telemetry API endpoints (Done)
- Cross-platform precompiled Rust native engine distribution (7 platform targets) (Done)
- Production-grade security policy, full documentation, and verifiable CI/CD release pipeline (Done)

---

Maintained by ZACK.PRATAMA
PT ZYNTRIX ARTIFICIAL INTELLIGENCE INDONESIA (SAFE-CHANGE)
License: AGPL-3.0-only
