import * as fs from "node:fs";
import * as path from "node:path";
import type { AgentAdapter } from "./adapter.js";
import { AntigravityAdapter } from "./antigravity.js";
import { ClaudeCodeAdapter } from "./claude-code.js";
import { CursorAdapter } from "./cursor.js";
import { CodexAdapter } from "./codex.js";
import { ClineAdapter } from "./cline.js";
import { KimiCodeAdapter } from "./kimi-code.js";
import { AmpAdapter } from "./amp.js";
import { OpenCodeAdapter } from "./opencode.js";
import { GeminiCliAdapter } from "./gemini-cli.js";
import { GitHubCopilotAdapter } from "./github-copilot.js";

export const SUPPORTED_AGENTS = [
  "antigravity",
  "claude-code",
  "cursor",
  "codex",
  "cline",
  "kimi-code",
  "amp",
  "opencode",
  "gemini-cli",
  "github-copilot",
] as const;

export type SupportedAgent = (typeof SUPPORTED_AGENTS)[number];

export function isSupportedAgent(agent: string): agent is SupportedAgent {
  return (SUPPORTED_AGENTS as readonly string[]).includes(agent.toLowerCase().trim());
}

/**
 * Returns an instance of the adapter corresponding to the given agent ID.
 */
export function getAdapter(
  agentNameOrId: string,
  canonicalSkillPath?: string
): AgentAdapter | null {
  const normalized = agentNameOrId.toLowerCase().trim();
  switch (normalized) {
    case "antigravity":
      return new AntigravityAdapter(canonicalSkillPath);
    case "claude-code":
      return new ClaudeCodeAdapter(canonicalSkillPath);
    case "cursor":
      return new CursorAdapter(canonicalSkillPath);
    case "codex":
      return new CodexAdapter(canonicalSkillPath);
    case "cline":
      return new ClineAdapter(canonicalSkillPath);
    case "kimi-code":
      return new KimiCodeAdapter(canonicalSkillPath);
    case "amp":
      return new AmpAdapter(canonicalSkillPath);
    case "opencode":
      return new OpenCodeAdapter(canonicalSkillPath);
    case "gemini-cli":
      return new GeminiCliAdapter(canonicalSkillPath);
    case "github-copilot":
      return new GitHubCopilotAdapter(canonicalSkillPath);
    default:
      return null;
  }
}

/**
 * Returns instances of all supported adapters.
 */
export function getAllAdapters(canonicalSkillPath?: string): AgentAdapter[] {
  return SUPPORTED_AGENTS.map((id) => getAdapter(id, canonicalSkillPath)!);
}

/**
 * Detects which AI coding agents are present in the workspace
 * based on the existence of their configuration directories.
 */
export function detectInstalledAgents(workspaceRoot: string): SupportedAgent[] {
  const detected: SupportedAgent[] = [];

  const checks: Array<{ dir: string; agents: SupportedAgent[] }> = [
    { dir: ".claude", agents: ["claude-code"] },
    { dir: ".cursor", agents: ["cursor"] },
    { dir: ".codex", agents: ["codex"] },
    { dir: ".cline", agents: ["cline"] },
    { dir: ".kimi-code", agents: ["kimi-code"] },
    { dir: ".agents", agents: ["antigravity", "amp"] },
    { dir: ".opencode", agents: ["opencode"] },
    { dir: ".gemini", agents: ["gemini-cli"] },
    { dir: ".github", agents: ["github-copilot"] },
  ];

  for (const { dir, agents } of checks) {
    const fullPath = path.join(workspaceRoot, dir);
    if (fs.existsSync(fullPath)) {
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          for (const a of agents) {
            if (!detected.includes(a)) {
              detected.push(a);
            }
          }
        }
      } catch {
        // ignore filesystem permission errors
      }
    }
  }

  return detected;
}
