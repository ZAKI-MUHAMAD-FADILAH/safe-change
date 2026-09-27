import { BaseAdapter } from "./base-adapter.js";

export class ClaudeCodeAdapter extends BaseAdapter {
  readonly agentId = "claude-code";
  readonly agentName = "Claude Code (Anthropic)";
  readonly projectSkillPath = ".claude/skills/safe-change";
  readonly globalSkillPath = ".claude/skills/safe-change";
  readonly verificationStatus = "filesystem-validated" as const;
  readonly notes = "Reload with /reload-skills in active session.";
  readonly documentationUrl = "https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/memory";
}
