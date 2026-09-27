# MCP Server Setup Guide

safe-change exposes its core commands as MCP (Model Context Protocol) tools.
Agents that support MCP can invoke `safe_change_save`, `safe_change_check`,
`safe_change_diff`, and `safe_change_status` directly without manual skill
installation.

## Prerequisites

Install safe-change globally (version 0.1.2 or later):

```bash
npm install -g safe-change
```

Verify the installation:

```bash
safe-change --version
```

## Agent Configuration

### Claude Code

Add to `~/.claude/claude.json` or `.claude/claude.json` in the project root:

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

### Cursor

Add to `.cursor/mcp.json` in the project root:

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

### Cline

Add to VSCode `settings.json` under `cline.mcpServers`:

```json
{
  "safe-change": {
    "command": "safe-change",
    "args": ["mcp"],
    "disabled": false
  }
}
```

### Codex

Add to `.codex/config.json` in the project root:

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

### Gemini CLI

Add to `~/.gemini/settings.json`:

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

### Other Agents

For Kimi Code, Amp, OpenCode, GitHub Copilot, and Antigravity, use the
standard `mcpServers` format shown above. Adjust the config file location
to match each agent's configuration path:

| Agent | Config Location |
|---|---|
| Kimi Code | `.kimi/mcp.json` or agent-specific config |
| Amp | `.amp/config.json` or agent-specific config |
| OpenCode | `.opencode/config.json` or agent-specific config |
| GitHub Copilot | `.github/copilot/mcp.json` or agent-specific config |
| Antigravity | `.agents/mcp_config.json` or agent-specific config |

## Verifying the Connection

After configuring the MCP server, restart the agent and type:

```
Please call safe_change_status to check if safe-change is connected.
```

If the agent returns baseline status information, the connection is working.

## Tool Reference

| Tool | Description |
|---|---|
| `safe_change_save` | Record a baseline snapshot of the repository state and run all configured verification checks. |
| `safe_change_check` | Compare current state against the baseline. Exit code 1 means regression detected. |
| `safe_change_diff` | Show file-level summary of changes (added, modified, deleted) relative to baseline. |
| `safe_change_status` | Show current baseline status: existence, creation time, and last check summary. |

## Combining with Skill Installation

MCP and SKILL.md are not mutually exclusive. Using both provides maximum
protection:

- **SKILL.md** teaches the agent *when* to call safe-change (automatic
  invocation at session boundaries, before risky edits, etc.).
- **MCP** gives the agent *direct access* to safe-change tools without
  shell PATH issues or manual command construction.

To install the skill alongside MCP:

```bash
safe-change install <agent>
```

Both mechanisms can coexist safely. The skill instructs the agent to use
safe-change at the right moments, while MCP ensures the tools are always
available regardless of shell configuration.
