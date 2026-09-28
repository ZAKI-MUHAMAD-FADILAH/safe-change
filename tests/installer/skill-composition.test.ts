import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { CursorAdapter } from "../../src/installer/adapters/cursor.js";
import {
  PROFILE_END_MARKER,
  PROFILE_START_MARKER,
  composeAgentSkill,
  contentSha256,
} from "../../src/installer/skills/composer.js";

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

describe("agent skill composition", () => {
  let tempDir: string;
  let canonicalPath: string;
  let workspaceRoot: string;
  let homeDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "safe-change-composer-"));
    canonicalPath = path.join(tempDir, "skills", "safe-change", "SKILL.md");
    workspaceRoot = path.join(tempDir, "workspace");
    homeDir = path.join(tempDir, "home");
    fs.mkdirSync(path.dirname(canonicalPath), { recursive: true });
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.mkdirSync(homeDir, { recursive: true });
    fs.writeFileSync(canonicalPath, "# Canonical\n", "utf8");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("preserves byte-for-byte compatibility when no profile exists", () => {
    const canonical = fs.readFileSync(canonicalPath, "utf8");
    const result = composeAgentSkill(canonicalPath, "cursor");

    expect(result.content).toBe(canonical);
    expect(result.profilePath).toBeNull();
    expect(result.profileSha256).toBeNull();
    expect(result.canonicalSha256).toBe(sha256(canonical));
    expect(result.composedSha256).toBe(sha256(canonical));
  });

  it("composes a deterministic agent profile with reserved boundaries", () => {
    const profileDir = path.join(path.dirname(canonicalPath), "profiles");
    const profilePath = path.join(profileDir, "cursor.md");
    const profile = "## Agent Profile: cursor\n\nProfile policy.\n";
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(profilePath, profile, "utf8");

    const first = composeAgentSkill(canonicalPath, "cursor");
    const second = composeAgentSkill(canonicalPath, "cursor");

    expect(first).toEqual(second);
    expect(first.content).toContain(PROFILE_START_MARKER);
    expect(first.content).toContain(PROFILE_END_MARKER);
    expect(first.content).toContain(profile.trim());
    expect(first.profileSha256).toBe(sha256(profile));
    expect(first.composedSha256).toBe(contentSha256(first.content));
  });

  it("rejects a profile whose declared identity does not match the adapter", () => {
    const profileDir = path.join(path.dirname(canonicalPath), "profiles");
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(
      path.join(profileDir, "cursor.md"),
      "## Agent Profile: codex\n",
      "utf8"
    );

    expect(() => composeAgentSkill(canonicalPath, "cursor")).toThrow(
      "must start with '## Agent Profile: cursor'"
    );
  });

  it("rejects profile path traversal and reserved composition markers", () => {
    expect(() => composeAgentSkill(canonicalPath, "../cursor")).toThrow(
      "Invalid agent profile ID"
    );

    const profileDir = path.join(path.dirname(canonicalPath), "profiles");
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(
      path.join(profileDir, "cursor.md"),
      `## Agent Profile: cursor\n\n${PROFILE_START_MARKER}\n`,
      "utf8"
    );
    expect(() => composeAgentSkill(canonicalPath, "cursor")).toThrow(
      "contains reserved composition markers"
    );
  });

  it("installs composed bytes and records all composition hashes", () => {
    const profileDir = path.join(path.dirname(canonicalPath), "profiles");
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(
      path.join(profileDir, "cursor.md"),
      "## Agent Profile: cursor\n\nProfile policy.\n",
      "utf8"
    );
    const adapter = new CursorAdapter(canonicalPath);
    const expected = adapter.composeSkill();

    const result = adapter.install({
      scope: "project",
      workspaceRoot,
      homeDir,
    });

    expect(result.status).toBe("installed");
    expect(result.sha256).toBe(expected.composedSha256);
    expect(
      fs.readFileSync(path.join(result.targetDir, "SKILL.md"), "utf8")
    ).toBe(expected.content);
    expect(result.manifest?.metadata).toEqual({
      policyVersion: 1,
      canonicalSha256: expected.canonicalSha256,
      profileSha256: expected.profileSha256,
      composedSha256: expected.composedSha256,
      agentProfile: "cursor",
    });

    const status = adapter.status({
      scope: "project",
      workspaceRoot,
      homeDir,
    });
    expect(status.hasDrift).toBe(false);
    expect(status.canonicalSha256).toBe(expected.canonicalSha256);
    expect(status.profileSha256).toBe(expected.profileSha256);
    expect(status.composedSha256).toBe(expected.composedSha256);
    expect(status.installedSha256).toBe(expected.composedSha256);
  });

  it("detects profile drift after an installation", () => {
    const profileDir = path.join(path.dirname(canonicalPath), "profiles");
    const profilePath = path.join(profileDir, "cursor.md");
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(
      profilePath,
      "## Agent Profile: cursor\n\nFirst policy.\n",
      "utf8"
    );
    const adapter = new CursorAdapter(canonicalPath);
    adapter.install({ scope: "project", workspaceRoot, homeDir });

    fs.writeFileSync(
      profilePath,
      "## Agent Profile: cursor\n\nRevised policy.\n",
      "utf8"
    );
    const status = adapter.status({
      scope: "project",
      workspaceRoot,
      homeDir,
    });

    expect(status.hasDrift).toBe(true);
    expect(status.composedSha256).not.toBe(status.installedSha256);
  });
});