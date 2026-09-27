# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
