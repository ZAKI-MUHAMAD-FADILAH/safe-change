import { BaseAdapter } from "./base-adapter.js";

export class CursorAdapter extends BaseAdapter {
  readonly agentId = "cursor";
  readonly agentName = "Cursor (Anysphere)";
  readonly projectSkillPath = ".cursor/skills/safe-change";
  readonly globalSkillPath = ".cursor/skills/safe-change";
  readonly verificationStatus = "filesystem-validated" as const;
  readonly notes = "Reload window after installation.";
  readonly documentationUrl = "https://docs.cursor.com";
}
