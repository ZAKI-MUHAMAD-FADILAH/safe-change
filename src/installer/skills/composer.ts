import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { assertNoSymlinkOrJunction } from "../core/path-safety.js";

export const SKILL_POLICY_VERSION = 1;
export const PROFILE_START_MARKER = "<!-- safe-change:agent-profile:start -->";
export const PROFILE_END_MARKER = "<!-- safe-change:agent-profile:end -->";

export interface SkillComposition {
  content: string;
  canonicalSha256: string;
  profilePath: string | null;
  profileSha256: string | null;
  composedSha256: string;
  policyVersion: number;
}

export function contentSha256(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function resolveAgentProfilePath(
  canonicalSkillPath: string,
  agentId: string
): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(agentId)) {
    throw new Error(`Invalid agent profile ID: '${agentId}'.`);
  }
  const profileDirectory = path.resolve(
    path.dirname(canonicalSkillPath),
    "profiles"
  );
  const profilePath = path.resolve(profileDirectory, `${agentId}.md`);
  if (!profilePath.startsWith(`${profileDirectory}${path.sep}`)) {
    throw new Error(`Agent profile path escapes the profile directory.`);
  }
  return profilePath;
}

function readRegularFile(filePath: string): string {
  assertNoSymlinkOrJunction(filePath);
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`Skill source is not a regular file: '${filePath}'.`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function normalizeTerminalNewline(content: string): string {
  return `${content.replace(/\r\n/g, "\n").trimEnd()}\n`;
}

function validateProfile(profile: string, agentId: string, profilePath: string): void {
  const requiredHeading = `## Agent Profile: ${agentId}`;
  if (!profile.startsWith(requiredHeading)) {
    throw new Error(
      `Agent profile '${profilePath}' must start with '${requiredHeading}'.`
    );
  }
  if (
    profile.includes(PROFILE_START_MARKER) ||
    profile.includes(PROFILE_END_MARKER)
  ) {
    throw new Error(
      `Agent profile '${profilePath}' contains reserved composition markers.`
    );
  }
}

export function composeAgentSkill(
  canonicalSkillPath: string,
  agentId: string
): SkillComposition {
  const canonical = readRegularFile(canonicalSkillPath);
  const canonicalSha256 = contentSha256(canonical);
  const profilePath = resolveAgentProfilePath(canonicalSkillPath, agentId);

  if (!fs.existsSync(profilePath)) {
    return {
      content: canonical,
      canonicalSha256,
      profilePath: null,
      profileSha256: null,
      composedSha256: canonicalSha256,
      policyVersion: SKILL_POLICY_VERSION,
    };
  }

  const profile = readRegularFile(profilePath);
  validateProfile(profile, agentId, profilePath);

  const normalizedCanonical = normalizeTerminalNewline(canonical);
  const normalizedProfile = normalizeTerminalNewline(profile);
  const content = [
    normalizedCanonical.trimEnd(),
    "",
    PROFILE_START_MARKER,
    normalizedProfile.trimEnd(),
    PROFILE_END_MARKER,
    "",
  ].join("\n");

  return {
    content,
    canonicalSha256,
    profilePath,
    profileSha256: contentSha256(profile),
    composedSha256: contentSha256(content),
    policyVersion: SKILL_POLICY_VERSION,
  };
}