import { BaseAdapter } from "./base-adapter.js";

export class KimiCodeAdapter extends BaseAdapter {
  readonly agentId = "kimi-code";
  readonly agentName = "Kimi Code by Moonshot AI";
  readonly projectSkillPath = ".kimi-code/skills/safe-change";
  readonly globalSkillPath = ".kimi-code/skills/safe-change";
  readonly verificationStatus = "filesystem-validated" as const;
  readonly notes = "Start a new session after installation.";
  readonly documentationUrl = "https://moonshot.cn";
}
