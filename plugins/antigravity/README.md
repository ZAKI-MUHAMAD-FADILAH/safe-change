# Antigravity Adapter Prototype

Status:
"Candidate adapter; filesystem packaging validated; Antigravity runtime discovery not independently verified."

---

## 1. Adapter Purpose

This directory contains the prototype filesystem adapter for Antigravity (Google DeepMind).

Its sole purpose is to provide a deterministically packaged, byte-for-byte identical distribution bundle of the canonical safe-change Agent Skill for projects targeting Antigravity workspace skill discovery (`.agents/skills/safe-change/SKILL.md`).

---

## 2. Canonical Source of Truth

The single source of truth for all safe-change skill instructions is:

`skills/safe-change/SKILL.md`

This adapter directory does NOT maintain an independent, forked, or manually written copy of the skill. The bundled skill at `plugins/antigravity/skills/safe-change/SKILL.md` is generated directly from the canonical source and verified via automated SHA-256 integrity tests.

---

## 3. Supported Scope of the Prototype

- **Scope**: Prototype packaging and filesystem layout verification only.
- **Target Location**: `plugins/antigravity/skills/safe-change/SKILL.md`.
- **Packaging Mechanism**: Direct, deterministic regular file copy. Symbolic links, hard links, and NTFS junctions are strictly prohibited.

---

## 4. Exact Files Included

The prototype consists of the following files:

```
plugins/antigravity/
├── README.md                          # This documentation and status specification
└── skills/
    └── safe-change/
        └── SKILL.md                   # Deterministically bundled canonical skill
```

### Why `plugin.json` is Intentionally Deferred
An explicit `plugin.json` manifest is intentionally NOT included in this prototype. Current agent compatibility research (documented in `docs/agent-compatibility.md`) shows that while Antigravity documents skill discovery (`.agents/skills/<name>/SKILL.md`), the formal schema, required keys, and lifecycle hooks for a standalone plugin manifest have not been verified via public canonical specifications. Conforming to repository safety rules, vendor manifest schemas must never be guessed or approximated. The manifest remains deferred until official schema evidence is established.

---

## 5. SHA-256 Drift Validation

The bundled skill file must match the canonical skill's SHA-256 checksum exactly:
- Automated tests (`tests/integration/antigravity-adapter.test.ts`) recompute and assert hash identity on every test run.
- Any manual modification to the bundled file or drift from `skills/safe-change/SKILL.md` causes automated test failure.

---

## 6. Verification Boundaries and Limitations

1. **Filesystem Validation Only**: All validations performed to date operate strictly at the filesystem level. Tests prove that files can be packaged deterministically without content corruption.
2. **Runtime Discovery Not Verified**: Antigravity runtime discovery has not been independently verified. Creating a matching folder layout does not prove that an active Antigravity IDE or agent session will index, parse, or invoke the skill.
3. **No Production Installer**: This prototype does NOT include a CLI installer command (`safe-change install antigravity` does not exist).
4. **No Home-Directory Installation**: This prototype does not install files into `~/.gemini/config/` or any user configuration directory.
5. **No Official Marketplace Claim**: This prototype is not published to, registered with, or recognized by any official vendor marketplace or plugin registry.
6. **No Support for Other Agents**: This directory is strictly isolated to Antigravity. It does not provide adapters for Claude Code, Cursor, Codex, Cline, Kimi Code, Amp, OpenCode, or Gemini CLI.
