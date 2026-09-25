import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const SKILL_PATH = join(__dirname, "..", "..", "skills", "safe-change", "SKILL.md");

describe("Canonical Agent Skill (skills/safe-change/SKILL.md)", () => {
  it("should exist and be non-empty", async () => {
    const content = await readFile(SKILL_PATH, "utf-8");
    expect(content.length).toBeGreaterThan(100);
  });

  it("should have valid YAML frontmatter with required fields", async () => {
    const raw = await readFile(SKILL_PATH, "utf-8");
    const content = raw.replace(/\r\n/g, "\n");
    expect(content.startsWith("---\n")).toBe(true);

    const endOfFrontmatter = content.indexOf("\n---\n", 4);
    expect(endOfFrontmatter).toBeGreaterThan(0);

    const frontmatter = content.slice(4, endOfFrontmatter);
    expect(frontmatter).toContain("name: safe-change");
    expect(frontmatter).toContain("description:");
  });

  it("should document the invocation contract for all three commands", async () => {
    const content = await readFile(SKILL_PATH, "utf-8");
    expect(content).toContain("safe-change save");
    expect(content).toContain("safe-change check");
    expect(content).toContain("safe-change diff");
    expect(content).toContain("--json");
    expect(content).toContain("Exit Codes");
  });

  it("should explicitly instruct agents that checks cannot be performed if CLI is unavailable", async () => {
    const content = await readFile(SKILL_PATH, "utf-8");
    expect(content).toContain("UNAVAILABLE");
    expect(content).toMatch(/not installed|unavailable/i);
    expect(content).toContain("safe-change --version");
  });

  it("should enforce non-negotiable safety rules prohibiting silent Git mutations", async () => {
    const content = await readFile(SKILL_PATH, "utf-8");
    expect(content).toContain("git commit");
    expect(content).toContain("git stash");
    expect(content).toContain("git reset");
    expect(content).toContain("git clean");
    expect(content).toContain("git checkout");
    expect(content).toContain(".gitignore");
  });

  it("should document the standard workflow: save before edits, check after, diff for summary", async () => {
    const content = await readFile(SKILL_PATH, "utf-8");
    expect(content).toMatch(/save.*before.*edit/i);
    expect(content).toMatch(/check.*after/i);
    expect(content).toMatch(/diff.*summary/i);
  });

  it("should clearly distinguish the four required verification states", async () => {
    const content = await readFile(SKILL_PATH, "utf-8");
    expect(content).toContain("**Verified**");
    expect(content).toContain("**Failed**");
    expect(content).toContain("**Not Verified**");
    expect(content).toContain("**Unavailable**");
  });

  it("should not contain any emoji characters", async () => {
    const content = await readFile(SKILL_PATH, "utf-8");
    // Regex matching emoji ranges
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(content)).toBe(false);
  });

  it("should document line diff limitations honestly", async () => {
    const content = await readFile(SKILL_PATH, "utf-8");
    expect(content).toMatch(/line diff.*unavailable/i);
  });
});
