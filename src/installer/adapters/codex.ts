import { BaseAdapter } from "./base-adapter.js";

export class CodexAdapter extends BaseAdapter {
  readonly agentId = "codex";
  readonly agentName = "OpenAI Codex";
  readonly projectSkillPath = ".codex/skills/safe-change";
  readonly globalSkillPath = ".codex/skills/safe-change";
  readonly verificationStatus = "filesystem-validated" as const;
  readonly notes = "Start a new session after installation.";
  readonly documentationUrl = "https://openai.com";
}
