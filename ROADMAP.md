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

## v0.3.0 -- Advanced Observability & Collaboration (Planned)

- File Change Drawer with syntax-highlighted diffs
- Multi-Agent Presence Badge and agent identification
- safe-change rules publish and community rule packages
- Custom rule condition extensions

## v1.0.0 -- Production Stable (Planned)

- All @safe-change/* native binary packages published
- Runtime-verified status for all 10 supported agents
- Stable MCP protocol compatibility
- Complete documentation and contributor guide
- Security audit completed

---

Maintained by ZACK.PRATAMA
PT ZYNTRIX ARTIFICIAL INTELIGENCE INDONESIA (SAFE-CHANGE)
License: AGPL-3.0-only
