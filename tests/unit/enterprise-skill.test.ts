import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { SUPPORTED_AGENTS } from "../../src/installer/adapters/registry.js";
import { composeAgentSkill } from "../../src/installer/skills/composer.js";

const ROOT = path.join(__dirname, "..", "..");
const SKILL_PATH = path.join(ROOT, "skills", "safe-change", "SKILL.md");
const PROFILE_DIR = path.join(ROOT, "skills", "safe-change", "profiles");
const PLUGIN_PATH = path.join(
  ROOT,
  "plugins",
  "antigravity",
  "skills",
  "safe-change",
  "SKILL.md"
);
const SCHEMA_PATH = path.join(
  ROOT,
  "skills",
  "safe-change",
  "policy.schema.json"
);

const REQUIRED_HEADINGS = [
  "## Enterprise Safety Contract",
  "## Instruction Trust Hierarchy",
  "## Activation and Risk Triggers",
  "## Operating Modes",
  "## Mandatory Lifecycle",
  "### 5. Perform Microscopic Review",
  "## Verification State Matrix",
  "## Fail-Closed Stop Conditions",
  "## Concurrent-Agent and Drift Control",
  "## Test Integrity Requirements",
  "## Release and Distribution Gate",
  "## Required Final Report Template",
];

describe("enterprise agent skill policy", () => {
  it("contains every required enterprise control section", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");

    for (const heading of REQUIRED_HEADINGS) {
      expect(content).toContain(heading);
    }
    expect(content).toContain("parentheses, brackets, braces");
    expect(content.toLowerCase()).toContain("fail closed");
    expect(content).toContain("Never use force push");
    expect(content).toContain("No Secret Exposure");
    expect(content).toContain("No Verification Bypass");
  });

  it("ships exactly one valid profile for every supported agent", () => {
    const profileFiles = fs
      .readdirSync(PROFILE_DIR)
      .filter((entry) => entry.endsWith(".md"))
      .sort();
    const expectedFiles = SUPPORTED_AGENTS.map((agent) => `${agent}.md`).sort();

    expect(profileFiles).toEqual(expectedFiles);
    for (const agent of SUPPORTED_AGENTS) {
      const profile = fs.readFileSync(
        path.join(PROFILE_DIR, `${agent}.md`),
        "utf8"
      );
      expect(profile.startsWith(`## Agent Profile: ${agent}\n`)).toBe(true);
      expect(profile).toContain("### Activation");
      expect(profile).toContain("### Tool Strategy");
      expect(profile).toContain("### Agent-Specific Constraints");
      expect(profile).toContain("### Required Report Fields");
      expect(profile).toContain("cannot lower canonical requirements");
    }
  });

  it("composes deterministic, distinct policy bytes for all supported agents", () => {
    const hashes = new Set<string>();

    for (const agent of SUPPORTED_AGENTS) {
      const first = composeAgentSkill(SKILL_PATH, agent);
      const second = composeAgentSkill(SKILL_PATH, agent);
      expect(first).toEqual(second);
      expect(first.profilePath).not.toBeNull();
      expect(first.profileSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(first.composedSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(first.content).toContain(`## Agent Profile: ${agent}`);
      hashes.add(first.composedSha256);
    }

    expect(hashes.size).toBe(SUPPORTED_AGENTS.length);
  });

  it("keeps the Antigravity plugin copy identical to the canonical core", () => {
    expect(fs.readFileSync(PLUGIN_PATH)).toEqual(fs.readFileSync(SKILL_PATH));
  });

  it("ships a strict parseable metadata schema", () => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.policyVersion.const).toBe(1);
    expect(schema.required).toEqual([
      "policyVersion",
      "canonicalSha256",
      "profileSha256",
      "composedSha256",
      "agentProfile",
    ]);
  });

  it("contains no emoji or private filesystem URI in policy files", () => {
    const policyFiles = [
      SKILL_PATH,
      PLUGIN_PATH,
      ...SUPPORTED_AGENTS.map((agent) =>
        path.join(PROFILE_DIR, `${agent}.md`)
      ),
    ];
    const emoji =
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

    for (const file of policyFiles) {
      const content = fs.readFileSync(file, "utf8");
      expect(emoji.test(content)).toBe(false);
      expect(content).not.toContain("file:///");
      expect(content).not.toMatch(/[A-Za-z]:\\Users\\/);
      expect(content).not.toContain("/Users/");
      expect(content).not.toContain("/home/");
    }
  });
});