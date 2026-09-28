# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Native binary load and smoke verification script `scripts/verify-built-native.mjs` executing in GitHub Actions.
- Comprehensive verification state matrix tests covering `pass-pass`, `fail-pass`, `pass-fail`, `fail-fail`, timeout permutations, zero checks, and configuration drift.
- Fail-closed rules tests asserting rejection of missing version, unsupported version, and malformed rule objects.
- Bounded tail buffer unit tests verifying strict memory caps on large MCP output streams.
- Version parity verification check mode (`--check`) in `scripts/sync-version.mjs` and dedicated regression test suite.
- Unified release orchestrator workflow `.github/workflows/release.yml` with OIDC provenance, concurrency protection, and manual dry-run dispatch.
- Release metadata and tag validation tool `scripts/validate-release.mjs` and npm credential/version preflight script `scripts/preflight-npm.mjs`.
- Ordered native-first and root-last publication orchestrator `scripts/publish-orchestrator.mjs` with registry visibility polling.

### Changed
- Hardened production release policy so only pushed SemVer tags can publish; manual dispatch is permanently non-publishing.
- Release publication now uses exact verified tarball files with SHA-256 reporting instead of publishing from a fresh source directory.
- npm preflight now distinguishes full release, safe root recovery, completed release, and unsafe mixed registry states.
- Re-enabled bounded Dependabot pull requests for npm, Cargo, and GitHub Actions ecosystems.
- Explicit `.gitignore` management: `safe-change init` preserves user `.gitignore` by default; updates to `.gitignore` now strictly require the explicit `--update-gitignore` flag.
- Verification status correctness: Resolved false-positive `verified` status on pre-existing check failures (`fail-fail`, `fail-timeout`, `timeout-fail`, `timeout-timeout`); verification state now reports `failed` with diagnostic reason while keeping exit code 0 to maintain regression exit-code contracts.
- Fail-closed rules evaluation on `save`: `safe-change save` validates `rules.json` schema and version (only version 1 is supported); invalid or malformed rules abort baseline creation with exit code 3 (`CONFIG_ERROR`) without leaking absolute filesystem paths.
- Bounded MCP subprocess output: Replaced unbounded array chunk buffering in MCP server with `BoundedTailBuffer`, capping stdout and stderr memory growth during command execution while retaining trailing diagnostic tails.
- Native distribution alignment: Aligned active binary distribution and `optionalDependencies` to the four fully built and tested targets (`linux-x64-gnu`, `win32-x64-msvc`, `darwin-arm64`, `darwin-x64`).
- CI hardening: Pinned `dtolnay/rust-toolchain` to immutable commit SHA `6bed0761d98439e5a578e2877258200ad565ba87` in GitHub Actions and added post-build native module load verification steps.
- Removed private filesystem URI references across documentation.

## [0.3.0] - 2026-09-28

### Added
- safe-change init command: auto-detects test runners across Node.js,
  Rust (Cargo), Go, Python, and Makefile, creates .safe-change.json,
  and adds .safe-change/ to .gitignore automatically
- safe-change diff --stat flag: computes and displays line-level additions
  and removals for working tree changes relative to baseline
- Multi-agent runtime verification matrix in docs/runtime-verification.md
  with test specifications for all 10 supported AI coding agents
- Version synchronization tooling via scripts/sync-version.mjs and
  npm run version:sync script to maintain monorepo parity across
  root package, crates/safe-change-native, and npm platform packages

### Changed
- Clarified commercial AGPL-3.0 copyleft boundaries in README.md:
  unmodified CLI, MCP server, and CI/CD usage does not trigger copyleft
- Synchronized crates/safe-change-native/Cargo.toml and all 7 platform
  packages under npm/ to version 0.3.0
- Updated local dashboard badge to v0.3.0

## [0.2.0] - 2026-09-28

### Added
- Persistent safety log: full baseline and check history
  stored in .safe-change/log.json
- safe-change log command with --last, --all, --json,
  --export, --clear options
- safe_change_log MCP tool for agent access to history
- Local dashboard at localhost:4242 via safe-change dashboard
- Dashboard panels: current status, log history,
  regression timeline, active rules
- Safety rules registry: safe-change rules list/add/remove/validate
- Rule engine with zero external dependencies
- 6 built-in rules: no-delete-migrations, no-delete-env,
  no-modify-lockfile, max-files-changed,
  max-deleted-files, require-tests-pass
- Rule violations with severity error set exit code 1
- Rule violations integrated into safe-change check output

### Changed
- safe-change check now evaluates active rules after checks
- safe-change save now appends to persistent log
- Repository URLs updated to github.com/zackpratamaa/safe-change

## [0.1.2] - 2026-09-28

### Added
- MCP Server via safe-change mcp subcommand
- Tools: safe_change_save, safe_change_check,
  safe_change_diff, safe_change_status
- stdio transport for zero-config MCP integration
- Agent setup documentation in docs/mcp-setup.md
- Project roadmap in ROADMAP.md

### Changed
- @modelcontextprotocol/sdk added as dependency

## [0.1.1] - 2026-09-27

### Added
- Support for 9 additional AI coding agents:
  Claude Code, Cursor, Codex, Cline, Kimi Code,
  Amp, OpenCode, Gemini CLI, GitHub Copilot
- BaseAdapter class for consistent adapter architecture
- safe-change install all command
- Auto-detection of installed agents via detectInstalledAgents
- Collision detection and warning for agents sharing skill paths
- Runtime verification plan for Antigravity
- Enhanced SKILL.md with automatic invocation guidance
- Native binary distribution architecture via @safe-change/* packages
- GitHub Actions pipeline for automated binary publishing

### Changed
- AntigravityAdapter refactored to use BaseAdapter
- CLI help text updated with all supported agents

### Security
- Path safety enforced for all 10 agent installation paths
- Ownership manifest tracks which agent installed the skill

## [0.1.0] - 2026-09-25

### Added
- Core CLI: save, check, diff commands
- Baseline management with atomic writes and schema versioning
- Configuration drift detection with 11-state result matrix
- Symlink boundary enforcement
- Prototype-safe file tracking for special filenames
- Canonical Agent Skill (skills/safe-change/SKILL.md)
- Antigravity filesystem fixture with path safety hardening
- Antigravity production installer
- Path safety, collision detection, ownership manifest, atomic transaction, and rollback modules
- Interactive and non-interactive installer modes
- Dry-run support
- Exit codes 0-9
- Agent compatibility research documentation
- Installer architecture documentation
- Technology evaluation: TypeScript with deferred Rust

### Security
- Home directory boundary protection
- Symlink and junction rejection
- TOCTOU mitigation via lstat-before-write
- Atomic staging with rollback on failure
- Ownership manifest for safe update and uninstall
