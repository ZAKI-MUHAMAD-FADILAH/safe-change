import { BaseAdapter } from "./base-adapter.js";

export class AmpAdapter extends BaseAdapter {
  readonly agentId = "amp";
  readonly agentName = "Amp (Sourcegraph)";
  readonly projectSkillPath = ".agents/skills/safe-change";
  readonly globalSkillPath = ".config/agents/skills/safe-change";
  readonly verificationStatus = "filesystem-validated" as const;
  readonly notes = "Shares .agents/skills/ path with Antigravity.";
  readonly documentationUrl = "https://sourcegraph.com";
}
