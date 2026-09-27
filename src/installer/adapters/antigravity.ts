import * as path from "node:path";
import { BaseAdapter } from "./base-adapter.js";

const AGENT_NAME = "antigravity";
const DISPLAY_NAME = "Antigravity (Google DeepMind)";
const PROJECT_TARGET_PREFIX = path.join(".agents", "skills", "safe-change");
const GLOBAL_TARGET_PREFIX = path.join(".gemini", "config", "skills", "safe-change");

export class AntigravityAdapter extends BaseAdapter {
  public readonly agentId = AGENT_NAME;
  public readonly agentName = AGENT_NAME;
  public override get displayName(): string {
    return DISPLAY_NAME;
  }
  public readonly projectSkillPath = PROJECT_TARGET_PREFIX;
  public readonly globalSkillPath = GLOBAL_TARGET_PREFIX;
  public readonly verificationStatus = "filesystem-validated" as const;
  public readonly notes = "Antigravity runtime skill discovery is pending independent runtime verification.";
  public readonly documentationUrl = "https://github.com/google-deepmind";

  constructor(canonicalSkillPath?: string) {
    super(canonicalSkillPath);
  }
}
