import { BaseAdapter } from "./base-adapter.js";

export class GeminiCliAdapter extends BaseAdapter {
  readonly agentId = "gemini-cli";
  readonly agentName = "Gemini CLI (Google)";
  readonly projectSkillPath = ".gemini/skills/safe-change";
  readonly globalSkillPath = ".gemini/skills/safe-change";
  readonly verificationStatus = "filesystem-validated" as const;
  readonly notes = "Legacy support. Antigravity is the recommended successor.";
  readonly documentationUrl = "https://ai.google.dev";
}
