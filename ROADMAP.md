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

## v0.1.2 -- MCP Server (In Progress)

- Expose safe-change as a Model Context Protocol server
- Tools: safe_change_save, safe_change_check,
  safe_change_diff, safe_change_status
- stdio transport, zero configuration
- Agent setup documentation for all 10 supported agents
- Agents can invoke safe-change directly without SKILL.md

## v0.2.0 -- Persistent Safety Log (Planned)

- safe-change log command
- Per-project history of all baselines and check results
- Queryable: who triggered, when, what was the outcome
- Exportable as JSON or plain text
- Retention policy configuration

## v0.3.0 -- Local Dashboard (Planned)

- Web UI at localhost:4242
- Visual baseline history, diff explorer, regression timeline
- Per-project view
- No cloud dependency, all data stays local

## v0.4.0 -- Safety Rules Registry (Planned)

- Community-publishable safety rule packages
- safe-change rules add <rule-package>
- Example rules: no-delete-migrations, require-test-pass,
  no-modify-lockfile-without-install
- Rules are enforced automatically at check time

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
