<div align="center">

<img width="100%" src="https://raw.githubusercontent.com/zackpratamaa/safe-change/main/assets/banner.png" alt="safe-change banner" />

<br/>

[![Typing SVG](https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=22&duration=2500&pause=1000&color=58A6FF&center=true&vCenter=true&width=750&lines=Record+a+baseline+before+AI+touches+your+code.;Detect+regressions+the+moment+they+happen.;10+agents.+1+install.+Zero+surprises.)](https://github.com/zackpratamaa/safe-change)

<br/>

[![GitHub Sponsors](https://img.shields.io/github/sponsors/zackpratamaa?style=for-the-badge&logo=github&color=EA4AAA&labelColor=0d1117)](https://github.com/sponsors/zackpratamaa)
[![npm version](https://img.shields.io/npm/v/safe-change?style=for-the-badge&logo=npm&color=CB3837&labelColor=0d1117)](https://www.npmjs.com/package/safe-change)
[![npm downloads](https://img.shields.io/npm/dm/safe-change?style=for-the-badge&logo=npm&color=CB3837&labelColor=0d1117)](https://www.npmjs.com/package/safe-change)
[![CI](https://img.shields.io/github/actions/workflow/status/zackpratamaa/safe-change/ci.yml?style=for-the-badge&logo=github-actions&label=CI&labelColor=0d1117)](https://github.com/zackpratamaa/safe-change/actions)
[![License](https://img.shields.io/badge/AGPL--3.0--only-blue?style=for-the-badge&logo=gnu&label=license&labelColor=0d1117)](LICENSE)
[![Node](https://img.shields.io/badge/%3E%3D18.0.0-brightgreen?style=for-the-badge&logo=node.js&label=node&labelColor=0d1117)](https://nodejs.org)

</div>

<br/>

---

<br/>

## Why safe-change exists

You give an AI agent a task. It edits twelve files, installs two packages, and reorganizes a folder. The app still starts. But login is broken — and you have no idea which of those twelve changes caused it.

Without a recorded baseline, every regression is a mystery. Every follow-up prompt is a guess.

**safe-change records what was passing before the agent worked, then tells you exactly what broke after.**

No cloud. No API key. No model. One command before, one command after.

<br/>

---

<br/>

## How it works

```bash
# Step 1 — Before the agent: lock in a verified baseline
safe-change save "auth and dashboard both passing"

# Step 2 — Let your agent do its work
# ...

# Step 3 — After the agent: detect what regressed
safe-change check

# Step 4 — See which files were touched
safe-change diff
```

```
Baseline: auth and dashboard both passing

Check             Before    Now       Result
─────────────────────────────────────────────
build             pass      pass      ok
unit-tests        pass      fail      REGRESSION
e2e-auth          pass      pass      ok

Files changed since baseline:
  Modified:  8
  Added:     2
  Deleted:   0

Exit 1 — 1 new regression detected.
Previously passing check now fails: unit-tests
```

### What files are tracked and hashed?

safe-change records SHA-256 cryptographic hashes for codebase verification while respecting repository boundaries:

- **Included:** All files tracked by Git (`git ls-files`) plus untracked working-tree files recognized by Git (`git status -uall`).
- **Excluded:** Anything matched by `.gitignore` (e.g., `node_modules/`, `dist/`, build artifacts, cache folders) is completely ignored and never hashed. The `.safe-change/` directory is always excluded.
- **Binary files:** Read as raw binary streams and hashed directly with SHA-256 without distortion or character decoding.
- **Symlinks:** Inspected with `lstat` and hashed by their link target string (`readlink`) without following or dereferencing paths outside the repository.

<br/>

---

<br/>

## Install

```bash
npm install -g safe-change
```

```bash
# Verify
safe-change --version
```

> Node.js ≥ 18. No build step. No compiler. No cloud account.

<br/>

---

<br/>

## Quick start

**1. Initialize your project in 1 second**

```bash
safe-change init
```

> Automatically inspects your repository (Node.js, Rust, Go, Python, Makefile), generates `.safe-change.json` with detected test runners, and excludes `.safe-change/` in `.gitignore`.

**2. Save a baseline before your agent starts**

```bash
safe-change save "before refactor"
```

**3. Check for regressions after your agent finishes**

```bash
safe-change check
```

**4. Inspect what changed (files and line counts)**

```bash
safe-change diff --stat
```

<br/>

---

<br/>

## Commands

| Command | What it does |
|---|---|
| `init` | Auto-detect test runners, create `.safe-change.json`, and configure `.gitignore` |
| `save [description]` | Record a baseline — runs all checks, hashes all files |
| `check` | Compare current state to baseline — exit 1 if regression |
| `diff [--stat]` | List files added, modified, deleted, and line change stats |
| `log` | Full history of baselines and check results |
| `dashboard` | Open visual dashboard at `localhost:4242` |
| `rules list` | Show active safety rules |
| `rules add <id>` | Add a built-in safety rule |
| `rules remove <id>` | Remove a safety rule |
| `install <agent\|all>` | Install skill for a specific agent or all detected agents |
| `update <agent\|all>` | Update installed skill to latest |
| `uninstall <agent\|all>` | Remove installed skill |
| `status [agent]` | Show install status, detected agents, drift |
| `mcp` | Start MCP server on stdio |

All commands accept `--json` for structured output and `--help` for usage details.
Installer commands accept `--scope <project|global>`, `--dry-run`, and `--overwrite`.

<br/>

---

<br/>

## Supported agents

```bash
# Detect which agents are installed and set up all of them at once
safe-change install all
```

| Agent | ID | Project scope | Global scope |
|---|---|---|---|
| Google Antigravity | `antigravity` | `.agents/skills/safe-change/` | `~/.gemini/config/skills/safe-change/` |
| Claude Code | `claude-code` | `.claude/skills/safe-change/` | `~/.claude/skills/safe-change/` |
| Cursor | `cursor` | `.cursor/skills/safe-change/` | `~/.cursor/skills/safe-change/` |
| OpenAI Codex | `codex` | `.codex/skills/safe-change/` | `~/.codex/skills/safe-change/` |
| Cline | `cline` | `.cline/skills/safe-change/` | `~/.cline/skills/safe-change/` |
| Kimi Code | `kimi-code` | `.kimi-code/skills/safe-change/` | `~/.kimi-code/skills/safe-change/` |
| Amp | `amp` | `.agents/skills/safe-change/` | `~/.config/agents/skills/safe-change/` |
| OpenCode | `opencode` | `.opencode/skills/safe-change/` | `~/.config/opencode/skills/safe-change/` |
| Gemini CLI | `gemini-cli` | `.gemini/skills/safe-change/` | `~/.gemini/skills/safe-change/` |
| GitHub Copilot | `github-copilot` | `.github/skills/safe-change/` | `~/.github/skills/safe-change/` |

> **Note on verification status:** All agents currently ship with `filesystem-validated` status, meaning safe-change has been verified to correctly install, read, and remove skill files at each agent's expected path. Full runtime verification (confirming that each agent actively discovers and invokes the skill during a live session) is tracked per-agent and will land in subsequent releases. If you encounter an agent that does not pick up the installed skill, please [open an issue](https://github.com/zackpratamaa/safe-change/issues).

<br/>

---

<br/>

## MCP server

Agents that support the Model Context Protocol can invoke safe-change as a native tool — no SKILL.md, no manual setup, no PATH configuration needed.

```bash
safe-change mcp
```

Add this to your agent's MCP config:

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

**Exposed tools:**

| Tool | Description |
|---|---|
| `safe_change_save` | Record a baseline before edits |
| `safe_change_check` | Detect regressions after edits |
| `safe_change_diff` | Get file-level change summary |
| `safe_change_status` | Show current baseline metadata |
| `safe_change_log` | Retrieve project safety history |

Full per-agent setup in [docs/mcp-setup.md](docs/mcp-setup.md).

<br/>

---

<br/>

## Safety rules

Automatically enforce guardrails on every `safe-change check`.

```bash
safe-change rules add no-delete-migrations
safe-change rules add no-modify-lockfile
safe-change rules add max-files-changed
safe-change rules add require-tests-pass
```

| Rule ID | What it enforces |
|---|---|
| `no-delete-migrations` | Blocks deletion of `**/migrations/**` (severity: error) |
| `no-delete-env` | Blocks deletion of `**/.env*` (severity: error) |
| `no-modify-lockfile` | Blocks lockfile modification (severity: warn) |
| `max-files-changed` | Fails or warns when changed files exceed threshold (default: 50, warn) |
| `max-deleted-files` | Blocks bulk accidental deletions (default: 10, error) |
| `require-tests-pass` | Enforces that the check named `"test"` in your config passes (exit code 0, error) |

Rule violations with `severity: error` set exit code 1, same as a regression. Built-in rules provide production defaults. Custom thresholds, custom target patterns, or custom check names can be configured by editing `.safe-change/rules.json` or passing a JSON rule file via `safe-change rules add <file.json>`. See [docs/rules.md](docs/rules.md) for full rule condition specifications.

<br/>

---

<br/>

## Local dashboard

```bash
safe-change dashboard
# Dashboard running at http://localhost:4242
# Press Ctrl+C to stop.
```

Fully offline. Binds to `127.0.0.1` only — never exposed to the network.

**Port configuration:**

```bash
# Override via CLI flag
safe-change dashboard --port 8080
```

```json
// Or set in .safe-change.json
{ "dashboardPort": 8080 }
```

If the configured port is already in use, the server exits with an error. Choose an available port and retry.

**Panels:**

- Current baseline status and metadata
- Full history log with timestamps and descriptions
- Regression timeline — green dots clean, red dots regressions
- Active safety rules and their last evaluation

<br/>

---

<br/>

## Safety model

safe-change is built to never be the cause of a regression.

| Guarantee | Detail |
|---|---|
| No silent Git mutations | Never runs `git commit`, `git stash`, `git reset`, or `git clean` |
| No working tree writes | Reads and hashes files only — never modifies your project files |
| No telemetry | Zero outbound network calls. Fully offline. |
| No shell expansion | Commands are spawned directly. No shell interpolation. |
| No AI dependency | No model, no API key, no account required |
| Bounded execution | Configurable timeouts on all check processes |

> **Security Warning — Configuration Trust Boundary:** `.safe-change.json` specifies executable commands and arguments that safe-change invokes during `save` and `check`. While safe-change uses direct process spawning without shell expansion (mitigating shell injection), commands execute with your current user privileges. Treat `.safe-change.json` with the same scrutiny as a `Makefile`, `package.json` scripts, or CI workflow — **never run `safe-change save` or `safe-change check` on untrusted or unreviewed configurations from third-party pull requests.**

See [SECURITY.md](SECURITY.md) for trust boundaries and vulnerability reporting.

<br/>

---

<br/>

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Clean — no new regressions |
| `1` | Regression — at least one previously passing check now fails |
| `2` | No baseline found or baseline is corrupt |
| `3` | Configuration error |
| `4` | Not a Git repository |
| `5` | Internal error |
| `6` | Cancelled by user |
| `7` | Collision — use `--overwrite` to proceed |
| `8` | Ownership conflict |
| `9` | Unsupported agent or incompatible target |

<br/>

---

<br/>

## Documentation

| File | Contents |
|---|---|
| [GUIDE.md](GUIDE.md) | Full setup, usage, and troubleshooting |
| [ROADMAP.md](ROADMAP.md) | Shipped milestones and what is next |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |
| [SECURITY.md](SECURITY.md) | Trust model and vulnerability reporting |
| [docs/mcp-setup.md](docs/mcp-setup.md) | MCP configuration per agent |
| [docs/rules.md](docs/rules.md) | Safety rules reference |
| [docs/dashboard.md](docs/dashboard.md) | Dashboard guide |
| [docs/persistent-log.md](docs/persistent-log.md) | Persistent safety log |
| [docs/runtime-verification.md](docs/runtime-verification.md) | Multi-agent runtime verification matrix |
| [skills/safe-change/SKILL.md](skills/safe-change/SKILL.md) | Canonical agent skill |

<br/>

---

<br/>

## Star history

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=zackpratamaa/safe-change&type=Date)](https://star-history.com/#zackpratamaa/safe-change&Date)

</div>

<br/>

---

<br/>

## Contributors

Thanks to everyone who helps make safe-change better.

<div align="center">

[![Contributors](https://contrib.rocks/image?repo=zackpratamaa/safe-change)](https://github.com/zackpratamaa/safe-change/graphs/contributors)

</div>

Found a regression pattern safe-change missed? A bug in an adapter? Open an [issue](https://github.com/zackpratamaa/safe-change/issues). PRs are welcome for new safety rules, agent adapters, and documentation improvements.

<br/>

---

<br/>

## Sponsor

safe-change is and will always be free and open-source under AGPL-3.0. Sponsorship directly funds maintenance, security patches, and the safe-change Cloud roadmap.

<div align="center">

[![Sponsor safe-change](https://img.shields.io/github/sponsors/zackpratamaa?style=for-the-badge&logo=github&color=EA4AAA&labelColor=0d1117&label=Sponsor%20safe-change)](https://github.com/sponsors/zackpratamaa)

</div>

<br/>

---

<br/>

<div align="center">

<a href="https://github.com/zackpratamaa/safe-change/blob/main/assets/Animating_SAFE-CHANGE_logo_reveal.mp4?raw=true">
  <img width="100%" src="https://raw.githubusercontent.com/zackpratamaa/safe-change/main/assets/logo-reveal.gif" alt="SAFE-CHANGE animated logo reveal" />
</a>

<p align="center">
  <a href="https://github.com/zackpratamaa/safe-change/blob/main/assets/Animating_SAFE-CHANGE_logo_reveal.mp4?raw=true">
    <strong>Watch / Download Full HD Logo Reveal Video (MP4)</strong>
  </a>
</p>

<br/>

*safe-change is a filter, not magic.*
*It clears the noise between what your AI changed and what your codebase lost.*
*The agent does the work. You stay in control.*

</div>

<br/>

---

<br/>

## License

GNU Affero General Public License v3.0 only — SPDX: `AGPL-3.0-only`

See [LICENSE](LICENSE) and [LICENSE_CHANGE.md](LICENSE_CHANGE.md).

**For commercial and enterprise users:** AGPL-3.0 is a strong copyleft license that protects against proprietary hosted cloud forks. **Using safe-change unmodified as a developer CLI tool, MCP server, or in proprietary enterprise CI/CD pipelines does NOT trigger copyleft obligations.** Your proprietary code remains 100% proprietary. Only organizations modifying safe-change and serving it over a network as a hosted SaaS product are required to release their modifications under AGPL-3.0. If your organization requires a commercial license without copyleft obligations, contact the maintainer.

Copyright © 2026 ZACK.PRATAMA — PT ZYNTRIX ARTIFICIAL INTELIGENCE INDONESIA (SAFE-CHANGE)

<div align="center">

<img width="100%" src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=140&section=footer" />

</div>
