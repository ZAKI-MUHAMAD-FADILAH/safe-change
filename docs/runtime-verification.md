# Runtime Agent Verification Guide

This document establishes the runtime verification methodology and evidence for AI coding agents integrating with safe-change via canonical skills and the Model Context Protocol (MCP).

## Overview

safe-change supports 10 AI coding agents across two integration tiers:
1. **MCP Native Tool Invocation (Tier 1 - Standard)**: Direct, programmatic execution via the Model Context Protocol. The agent discovers safe-change tools (`safe_change_save`, `safe_change_check`, `safe_change_diff`, `safe_change_status`, `safe_change_log`) and executes them natively through JSON-RPC.
2. **Skill Prompt Instruction (Tier 2 - Contract)**: Contextual loading via agent-specific skill directories (`.claude/skills/`, `.cursor/skills/`, `.agents/skills/`, etc.) following the instruction contract in `skills/safe-change/SKILL.md`.

## Verification Matrix

| Agent | Scope | Filesystem Validated | MCP Runtime Tested | Skill Auto-Invocation | Recommended Setup |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Google Antigravity** | Project / Global | Verified | Tested | Native | Project `.agents/skills/` |
| **Claude Code (Anthropic)** | Project / Global | Verified | Tested | Verified | `mcpServers` config in `settings.json` |
| **Cursor (Anysphere)** | Project / Global | Verified | Tested | Verified | `mcpServers` in Cursor Settings |
| **OpenAI Codex** | Project / Global | Verified | Tested | Verified | CLI stdio wrapper / `AGENTS.md` |
| **Cline** | Project / Global | Verified | Tested | Verified | MCP server panel in VSCode |
| **Kimi Code** | Project / Global | Verified | Tested | Verified | `.kimi-code/skills/` |
| **Amp (Sourcegraph)** | Project / Global | Verified | Tested | Verified | Project `.agents/skills/` |
| **OpenCode** | Project / Global | Verified | Tested | Verified | `~/.config/opencode/skills/` |
| **Gemini CLI** | Project / Global | Verified | Tested | Verified | `.gemini/skills/` |
| **GitHub Copilot** | Project / Global | Verified | Tested | Verified | `.github/skills/` & `.agents/skills/` |

## Tier 1: MCP Runtime Verification (Recommended)

The Model Context Protocol represents the most robust runtime integration because it bypasses shell quoting and natural language misunderstanding.

### Verification Steps

1. Configure safe-change in your agent's MCP configuration:
```json
{
  "mcpServers": {
    "safe-change": {
      "command": "safe-change",
      "args": ["mcp"]
    }
  }
}
```

2. Confirm available tools:
   - `safe_change_save`
   - `safe_change_check`
   - `safe_change_diff`
   - `safe_change_status`
   - `safe_change_log`

3. Verification Prompt:
```text
I am about to refactor the authentication middleware.
Use safe_change_save to record a baseline with description "pre-auth-refactor".
```

4. Expected Agent Tool Call:
```json
{
  "tool": "safe_change_save",
  "arguments": {
    "description": "pre-auth-refactor"
  }
}
```

5. Verification Outcome:
The tool records the baseline and returns the execution report. Upon completing edits, the agent automatically executes `safe_change_check`.

## Tier 2: Agent Skill Instructions (`SKILL.md`)

For agents using file-based skills:

### Claude Code Verification
- Skill location: `.claude/skills/safe-change/SKILL.md`
- For global projects, add to `CLAUDE.md`:
```markdown
## Safety Workflow
Before editing critical files, run `safe-change save "<description>"`.
After editing, run `safe-change check` to verify no regressions occurred.
```
- Reload skills in session: `/reload-skills`

### Cursor Verification
- Skill location: `.cursor/skills/safe-change/SKILL.md`
- Add to `.cursorrules`:
```markdown
Always invoke `safe-change save` before executing multi-file refactors and `safe-change check` afterwards.
```

## Summary

All 10 agent paths are verified for filesystem compatibility and ownership tracking. For zero-overhead, production-grade agent operation, configuring safe-change as an **MCP Server** is the recommended best practice across all supported environments.
