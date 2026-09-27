import { BaseAdapter } from "./base-adapter.js";

export class ClineAdapter extends BaseAdapter {
  readonly agentId = "cline";
  readonly agentName = "Cline";
  readonly projectSkillPath = ".cline/skills/safe-change";
  readonly globalSkillPath = ".cline/skills/safe-change";
  readonly verificationStatus = "filesystem-validated" as const;
  readonly notes = "Restart Cline after installation.";
  readonly documentationUrl = "https://github.com/cline/cline";
}
