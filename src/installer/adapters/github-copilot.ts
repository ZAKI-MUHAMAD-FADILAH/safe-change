import { BaseAdapter } from "./base-adapter.js";

export class GitHubCopilotAdapter extends BaseAdapter {
  readonly agentId = "github-copilot";
  readonly agentName = "GitHub Copilot";
  readonly projectSkillPath = ".github/skills/safe-change";
  readonly globalSkillPath = ".github/skills/safe-change";
  readonly verificationStatus = "filesystem-validated" as const;
  readonly notes = "Also reads .agents/skills/ and .claude/skills/.";
  readonly documentationUrl = "https://docs.github.com/en/copilot";
}
