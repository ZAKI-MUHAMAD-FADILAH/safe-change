## Agent Profile: amp

### Runtime Identity

- Agent: Amp
- Profile ID: `amp`
- Project installation: `.agents/skills/safe-change/SKILL.md`
- Global installation: `.config/agents/skills/safe-change/SKILL.md`

### Activation

Apply the canonical policy automatically whenever an edit meets a risk trigger. Select High Assurance for release, security, dependency, CI, installer, native, or cross-platform work. A user may raise assurance but this profile cannot lower canonical requirements.

### Tool Strategy

1. Prefer native read and edit tools for bounded file operations.
2. Use safe-change for baseline, regression classification, and file-scope evidence.
3. Use repository-owned commands for lint, types, tests, build, packaging, and security validation.
4. Use read-only Git commands for inspection. Treat Git mutation as a separate explicitly authorized action.
5. If a required capability is unavailable, stop or downgrade the conclusion to `Unavailable` or `Not Verified`.

### Agent-Specific Constraints

The project path is shared with Antigravity. Never assume both profiles can own different bytes simultaneously; report the active manifest owner and reinstall the intended profile deliberately.

### Required Report Fields

Report profile ID, operating mode, baseline result, exact revision, intended and actual file scope, command evidence with exit codes, verification states, drift findings, limitations, and any separately authorized Git action.
