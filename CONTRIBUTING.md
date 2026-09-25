# Contributing to safe-change

## Development setup

Prerequisites: Node.js 18 or later, Git.

```bash
git clone https://github.com/ZAKI-MUHAMAD-FADILAH/safe-change.git
cd safe-change
npm install
npm run build
```

## Running tests

```bash
npm test
```

Tests use Vitest and create temporary Git repositories. They require `git` to be available on the PATH.

## Project structure

```
src/
  cli.ts                   CLI entry point and argument parsing
  index.ts                 Public API exports
  types/index.ts           All TypeScript type definitions
  config/loader.ts         Configuration file loading and validation
  git/inspector.ts         Git state inspection (read-only)
  baseline/manager.ts      Baseline read/write with atomic operations
  runner/executor.ts       Process execution with timeouts and bounds
  comparator/engine.ts     Baseline vs. current comparison
  output/renderer.ts       Terminal and JSON output formatting
  commands/
    save.ts                save command handler
    check.ts               check command handler
    diff.ts                diff command handler
tests/
  unit/                    Unit tests per module
  integration/             Integration and acceptance tests
  helpers/                 Test utilities (temp Git repos)
```

## Contribution guidelines

- Preserve the safety model. No command may silently commit, stash, reset, clean, or delete user files.
- Add tests for any new Git or filesystem behavior.
- Use strict TypeScript. No `any` types without justification.
- No emoji in source, output, or documentation.
- Do not add telemetry, cloud dependencies, or AI API key requirements.
- Keep verification commands explicit (executable + args). No shell string execution.
- Run `npm run lint` (type-check) and `npm test` before submitting.

## Reporting issues

Use the GitHub issue tracker. Do not post credentials, private source code, or exploitable vulnerability details in public issues. See [SECURITY.md](SECURITY.md) for responsible disclosure.

## Code style

- Clear, descriptive variable and function names.
- Document non-obvious design decisions in comments.
- Prefer explicit error handling over silent failures.
- Sanitize untrusted text before terminal output.
