import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  addRule,
  removeRule,
  loadRulesResult,
  loadRules,
} from "../../src/rules/manager.js";
import type { SafeChangeRule } from "../../src/types/index.js";

describe("Rules Manager Operations & Validation", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sc-rules-ops-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("supports addRule with custom JSON file, rule object, and handles invalid definition", async () => {
    const validRule: SafeChangeRule = {
      id: "custom-file-rule",
      name: "Custom File Rule",
      description: "Custom description",
      severity: "warn",
      condition: {
        type: "file-not-modified",
        pattern: "*.lock",
      },
    };

    const rulePath = join(tempDir, "custom-rule.json");
    await writeFile(rulePath, JSON.stringify(validRule));

    // 1. Add rule by file path
    const addedFromFile = await addRule(rulePath, tempDir);
    expect(addedFromFile.id).toBe("custom-file-rule");

    // 2. Add rule by object directly
    const directRule: SafeChangeRule = {
      id: "direct-obj-rule",
      name: "Direct Rule",
      description: "Direct desc",
      severity: "error",
      condition: {
        type: "max-files-changed",
        threshold: 10,
      },
    };
    const addedDirect = await addRule(directRule, tempDir);
    expect(addedDirect.id).toBe("direct-obj-rule");

    // 3. Reject invalid rule object
    await expect(
      addRule({ id: "", name: "", severity: "error" } as unknown as SafeChangeRule, tempDir)
    ).rejects.toThrow();

    // 4. Reject invalid rule file path
    const invalidPath = join(tempDir, "invalid-rule.json");
    await writeFile(invalidPath, JSON.stringify({ id: "" }));
    await expect(addRule(invalidPath, tempDir)).rejects.toThrow();

    // 5. Remove rule returns false when rule does not exist
    const removedNonExistent = await removeRule("does-not-exist", tempDir);
    expect(removedNonExistent).toBe(false);

    // 6. Remove existing rule returns true
    const removedExistent = await removeRule("custom-file-rule", tempDir);
    expect(removedExistent).toBe(true);
  });

  it("returns invalid status on malformed JSON or missing/unsupported version", async () => {
    const rulesDir = join(tempDir, ".safe-change");
    await mkdir(rulesDir, { recursive: true });

    // Malformed JSON
    await writeFile(join(rulesDir, "rules.json"), "{ invalid json");
    const malformed = await loadRulesResult(tempDir);
    expect(malformed.status).toBe("invalid");
    expect(malformed.error).toContain("invalid JSON");

    // Missing version
    await writeFile(join(rulesDir, "rules.json"), JSON.stringify({ rules: [] }));
    const missingVer = await loadRulesResult(tempDir);
    expect(missingVer.status).toBe("invalid");
    expect(missingVer.error).toContain("missing 'version'");

    // Unsupported version
    await writeFile(join(rulesDir, "rules.json"), JSON.stringify({ version: 99, rules: [] }));
    const unsupportedVer = await loadRulesResult(tempDir);
    expect(unsupportedVer.status).toBe("invalid");
    expect(unsupportedVer.error).toContain("Unsupported rules version");

    // loadRules throws error when status is invalid
    await expect(loadRules(tempDir)).rejects.toThrow();
  });

  it("returns not-configured when rules.json is missing", async () => {
    const result = await loadRulesResult(tempDir);
    expect(result.status).toBe("not-configured");
    expect(result.rules).toEqual([]);
  });

  it("returns empty status when rules array is empty", async () => {
    const rulesDir = join(tempDir, ".safe-change");
    await mkdir(rulesDir, { recursive: true });
    await writeFile(
      join(rulesDir, "rules.json"),
      JSON.stringify({ version: 1, rules: [] })
    );

    const result = await loadRulesResult(tempDir);
    expect(result.status).toBe("empty");
    expect(result.rules).toEqual([]);
  });
});
