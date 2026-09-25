# Agent Compatibility Research (Milestone C Preparation)

This document records factual, verified research into the skill and plugin distribution mechanisms for four target AI coding agents:
1. Antigravity
2. Claude Code
3. Cursor
4. Codex

Research conducted as part of Milestone C preparation. No installer or plugin manifests are implemented in this phase.

---

## 1. Antigravity (Google DeepMind)

- **Verification Status**: Verified
- **Source Checked**: Built-in Antigravity Customization System specification (`agy-customizations` and `antigravity_guide`).

### Specifications

- **Supported Skill or Plugin Format**:
  - Skill: Directory containing `SKILL.md` with YAML frontmatter (`name: <string>`, `description: <string>`). Optional subdirectories: `scripts/`, `examples/`, `resources/`, `references/`.
  - Plugin: Directory containing `plugin.json` declaring a bundle of `skills/`, `rules/`, `hooks.json`, and `mcp_config.json`.
  - Rule: `GEMINI.md`, `AGENTS.md`, or `.agents/rules/*.md`.
- **Project-Level Installation Path**:
  - Skill: `.agents/skills/<skill_name>/SKILL.md` (also recognizes `.agent/`, `_agents/`, `_agent/`).
  - Plugin: `.agents/plugins/<plugin_name>/`.
- **User/Global Installation Path**:
  - Skill: `~/.gemini/config/skills/<skill_name>/SKILL.md` (Windows: `%USERPROFILE%\.gemini\config\skills\<skill_name>\SKILL.md`).
  - Plugin: `~/.gemini/config/plugins/<plugin_name>/`.
- **Precedence When Project and Global Both Exist**:
  - Strictly documented: Workspace Project (`.agents/`) has priority 1 (highest); Global Discovery (`~/.gemini/config/`) has priority 3.
  - Workspace copies strictly override global copies on name collision.
- **Installation Command**:
  - File-system copy or symlink into `.agents/skills/safe-change/` (project) or `~/.gemini/config/skills/safe-change/` (global).
- **Update Command**:
  - Overwrite `SKILL.md` in the target directory.
- **Uninstall Command**:
  - Remove the `safe-change` directory from `.agents/skills/` or `~/.gemini/config/skills/`.
- **Whether the Agent Loads Skills Automatically**:
  - Yes. Antigravity uses progressive disclosure: skill names and descriptions are automatically indexed in context. The full `SKILL.md` body is loaded dynamically on-demand when relevant to the user's prompt.
- **Whether a New Session is Required**:
  - Session reload or new session is recommended for instantaneous pickup if directory caching is active, though workspace directory scanning occurs on turn boundaries.
- **Whether a CLI Executable Must Be Installed Separately**:
  - Yes. The skill instructs the agent to invoke the `safe-change` CLI executable. The binary must be available on the system PATH.
- **Documentation Basis**:
  - Officially documented in the Antigravity Customization System specification.

---

## 2. Claude Code (Anthropic)

- **Verification Status**: Verified
- **Source Checked**: Anthropic Claude Code official documentation (`docs.anthropic.com`) and CLI help.

### Specifications

- **Supported Skill or Plugin Format**:
  - Standalone Skill: Directory containing `SKILL.md` with YAML frontmatter (`description: <string>`, optional `allowed-tools: [...]`). Can also be invoked manually as a slash command (`/skill-name`).
  - Project Context: `CLAUDE.md` in repository root (also supports `AGENTS.md`).
  - Plugin: Managed via `/plugin` interactive manager or marketplace manifests, bundling skills, MCP servers, and hooks.
- **Project-Level Installation Path**:
  - Standalone Skill: `.claude/skills/<skill-name>/SKILL.md`.
  - Project Context: `CLAUDE.md`.
- **User/Global Installation Path**:
  - Standalone Skill: `~/.claude/skills/<skill-name>/SKILL.md`.
- **Precedence When Project and Global Both Exist**:
  - Documented priority: Enterprise > Personal (`~/.claude/skills/`) > Project (`.claude/skills/`) > Plugin.
  - Note: Community testing indicates occasional shadowing inconsistencies when personal and project skills share identical names. Using unique naming or namespacing is recommended.
- **Installation Command**:
  - Standalone Skill: Copy directory into `.claude/skills/safe-change/` or `~/.claude/skills/safe-change/`.
  - Plugin: `/plugin install <name>@<marketplace>` (interactive CLI).
- **Update Command**:
  - Standalone Skill: Overwrite `SKILL.md`.
  - Plugin: Update via `/plugin` interactive manager.
- **Uninstall Command**:
  - Standalone Skill: Remove directory from `.claude/skills/` or `~/.claude/skills/`.
  - Plugin: Remove via `/plugin` interface.
- **Whether the Agent Loads Skills Automatically**:
  - Yes. Model-invoked based on semantic evaluation of frontmatter `description`. Users can also explicitly invoke the skill via `/safe-change`.
- **Whether a New Session is Required**:
  - No. Claude Code provides the `/reload-skills` command to refresh skills within an active session without restarting.
- **Whether a CLI Executable Must Be Installed Separately**:
  - Yes. The skill relies on executing `safe-change` in the shell; the CLI binary must be on PATH.
- **Documentation Basis**:
  - Officially documented in Anthropic documentation.

---

## 3. Cursor (Anysphere)

- **Verification Status**: Partially verified
- **Source Checked**: Cursor official documentation (`docs.cursor.com/context/rules-for-ai`).

### Specifications

- **Supported Skill or Plugin Format**:
  - Rules: `.cursor/rules/*.mdc` (Markdown with YAML frontmatter containing `description`, `globs`, and `alwaysApply`).
  - Legacy Rules: `.cursorrules` in project root (deprecated; ignored by Cursor Agent mode).
  - Custom Commands: `.cursor/commands/<name>.md`.
  - Skills: `.cursor/skills/` directory convention is emerging and compatible with `.claude/skills/` in recent releases (2.4+), but rules remain the primary official mechanism.
- **Project-Level Installation Path**:
  - Rule: `.cursor/rules/safe-change.mdc`.
  - Skill: `.cursor/skills/safe-change/SKILL.md` (requires manual testing for agent mode pickup).
- **User/Global Installation Path**:
  - Rules: Configured via Cursor UI (*Settings > General > Rules for AI*).
  - Commands: `~/.cursor/commands/`.
  - Skills: `~/.cursor/skills/`.
- **Precedence When Project and Global Both Exist**:
  - Project rules in `.cursor/rules/` take precedence over global settings. Frontmatter `globs` restrict activation to matching files; `alwaysApply: true` applies rule unconditionally.
- **Installation Command**:
  - No CLI-based package manager. Installed by writing `.cursor/rules/safe-change.mdc` or copying into `.cursor/skills/`.
- **Update Command**:
  - Overwrite `.cursor/rules/safe-change.mdc`.
- **Uninstall Command**:
  - Delete `.cursor/rules/safe-change.mdc`.
- **Whether the Agent Loads Skills Automatically**:
  - Rules with `alwaysApply: true` are injected automatically into every agent turn. Rules with `globs` are attached when matching files are active.
- **Whether a New Session is Required**:
  - Starting a new chat session or running `Developer: Reload Window` is typically required for Cursor to re-index rule files.
- **Whether a CLI Executable Must Be Installed Separately**:
  - Yes. The agent executes `safe-change` through its terminal execution tool; the CLI must be installed on PATH.
- **Documentation Basis**:
  - `.cursor/rules/*.mdc` is officially documented. `.cursor/skills/` is emerging and partially verified.

---

## 4. Codex (OpenAI / Codex CLI)

- **Verification Status**: Partially verified
- **Source Checked**: OpenAI Codex documentation, CLI reference (`chatgpt.com/codex`, `openai.com`).

### Specifications

- **Supported Skill or Plugin Format**:
  - Project Context / Instructions: `AGENTS.md` located in the project root is the official instruction mechanism for project-scoped guidance.
  - Skills: `~/.codex/skills/<skill-name>/` directory convention (instructions + metadata).
  - Plugins: Managed via `/plugins` command in the Codex CLI.
- **Project-Level Installation Path**:
  - Project Context: `AGENTS.md` (root).
  - Project Skill: `.codex/skills/safe-change/` (partially verified; ecosystem convention).
- **User/Global Installation Path**:
  - Skill: `~/.codex/skills/safe-change/`.
- **Precedence When Project and Global Both Exist**:
  - `AGENTS.md` at project root takes precedence for project-level instructions. Precedence resolution between global and project skill folders is not formally specified in public documentation.
- **Installation Command**:
  - Writing instructions into `AGENTS.md`, or copying skill directory into `~/.codex/skills/safe-change/`.
- **Update Command**:
  - Overwrite skill files or update `AGENTS.md` section.
- **Uninstall Command**:
  - Delete skill folder or remove safe-change section from `AGENTS.md`.
- **Whether the Agent Loads Skills Automatically**:
  - `AGENTS.md` is read automatically at session startup. Skills are invoked contextually by the model or triggered via slash commands.
- **Whether a New Session is Required**:
  - Yes. A new session (`codex .`) is required to reload modified `AGENTS.md` configuration.
- **Whether a CLI Executable Must Be Installed Separately**:
  - Yes. `safe-change` executable must be present on PATH for execution via shell tools.
- **Documentation Basis**:
  - `AGENTS.md` is officially documented. Standalone `.codex/skills/` directory mechanics require manual testing.

---

## 5. Comparative Analysis Summary

| Target | Primary Format | Project Path | Global Path | Precedence | Auto-Load | Hot Reload | Status |
|---|---|---|---|---|---|---|---|
| **Antigravity** | `SKILL.md` (YAML frontmatter) | `.agents/skills/<name>/` | `~/.gemini/config/skills/<name>/` | Project > Global (Strict) | Yes (Progressive) | Recommended new session | **Verified** |
| **Claude Code** | `SKILL.md` (YAML frontmatter) | `.claude/skills/<name>/` | `~/.claude/skills/<name>/` | Personal > Project (Reported) | Yes (Semantic) | Yes (`/reload-skills`) | **Verified** |
| **Cursor** | `.mdc` Rule / `SKILL.md` | `.cursor/rules/<name>.mdc` | Settings UI / `~/.cursor/skills/` | Project > Global | Yes (`alwaysApply`) | Requires reload | **Partially verified** |
| **Codex** | `AGENTS.md` / `SKILL.md` | `AGENTS.md` / `.codex/skills/` | `~/.codex/skills/<name>/` | Project (`AGENTS.md`) | Yes (Session start) | Requires new session | **Partially verified** |

---

## 6. Target Recommendation for First Installer Integration

### Recommendation: **Antigravity** (followed by **Claude Code**)

**Primary Selection: Antigravity**
- **100% Native Contract Match**: The canonical skill at `skills/safe-change/SKILL.md` uses the exact format (`name`, `description` frontmatter, Markdown body) specified by Antigravity's customization system. No syntax translation or conversion to `.mdc` or `plugin.json` is required for project installation.
- **Deterministic Precedence**: Documented, verified hierarchy where `.agents/skills/safe-change/SKILL.md` overrides global discovery without namespace conflicts.
- **Clean Project Path**: Standard `.agents/skills/` directory is clean, version-controllable, and isolated.

**Secondary Selection: Claude Code**
- Claude Code also uses the identical `SKILL.md` format directly under `.claude/skills/safe-change/SKILL.md`.
- Offers immediate testing with `/reload-skills` without restarting the CLI.
- Both Antigravity and Claude Code can use the exact same canonical `SKILL.md` file without template transformation, making them the safest initial targets for an interactive installer.
