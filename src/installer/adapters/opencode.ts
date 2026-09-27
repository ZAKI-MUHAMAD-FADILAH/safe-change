import { BaseAdapter } from "./base-adapter.js";

export class OpenCodeAdapter extends BaseAdapter {
  readonly agentId = "opencode";
  readonly agentName = "OpenCode";
  readonly projectSkillPath = ".opencode/skills/safe-change";
  readonly globalSkillPath = ".config/opencode/skills/safe-change";
  readonly verificationStatus = "filesystem-validated" as const;
  readonly notes = "Reload session after installation.";
  readonly documentationUrl = "https://github.com/opencode";
}
