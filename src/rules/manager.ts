import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";
import type { SafeChangeRule, RulesConfigFile } from "../types/index.js";
import { getBuiltInRule } from "./built-in.js";

export function getRulesFilePath(repoRoot: string): string {
  return join(repoRoot, ".safe-change", "rules.json");
}

interface UncheckedRule {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  severity?: unknown;
  condition?: {
    type?: unknown;
    pattern?: unknown;
    patterns?: unknown;
    threshold?: unknown;
    checkName?: unknown;
  };
}

export function validateRule(rule: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!rule || typeof rule !== "object") {
    return { valid: false, errors: ["Rule must be an object"] };
  }

  const r = rule as UncheckedRule;

  if (typeof r.id !== "string" || r.id.trim().length === 0) {
    errors.push("Rule id must be a non-empty string");
  }

  if (typeof r.name !== "string" || r.name.trim().length === 0) {
    errors.push("Rule name must be a non-empty string");
  }

  if (typeof r.description !== "string") {
    errors.push("Rule description must be a string");
  }

  if (r.severity !== "error" && r.severity !== "warn") {
    errors.push('Rule severity must be either "error" or "warn"');
  }

  if (!r.condition || typeof r.condition !== "object") {
    errors.push("Rule condition must be an object");
  } else {
    const c = r.condition;
    const validTypes = [
      "file-not-deleted",
      "file-not-modified",
      "max-files-changed",
      "max-deleted-files",
      "require-check-pass",
    ];

    if (!validTypes.includes(c.type as string)) {
      errors.push(`Rule condition type must be one of: ${validTypes.join(", ")}`);
    }

    if (c.type === "file-not-deleted" || c.type === "file-not-modified") {
      const hasPattern = typeof c.pattern === "string" && c.pattern.trim().length > 0;
      const hasPatterns = Array.isArray(c.patterns) && c.patterns.length > 0;
      if (!hasPattern && !hasPatterns) {
        errors.push(`Condition ${c.type} requires a pattern or non-empty patterns array`);
      }
    }

    if (c.type === "max-files-changed" || c.type === "max-deleted-files") {
      if (typeof c.threshold !== "number" || c.threshold < 0) {
        errors.push(`Condition ${c.type} requires a non-negative threshold number`);
      }
    }

    if (c.type === "require-check-pass") {
      if (typeof c.checkName !== "string" || c.checkName.trim().length === 0) {
        errors.push("Condition require-check-pass requires a non-empty checkName string");
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function loadRules(repoRoot: string): Promise<SafeChangeRule[]> {
  const filePath = getRulesFilePath(repoRoot);

  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.rules)) {
      return [];
    }
    return parsed.rules as SafeChangeRule[];
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "ENOENT") {
      return [];
    }
    throw new Error(`Failed to read rules file at ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function saveRules(
  rules: readonly SafeChangeRule[],
  repoRoot: string
): Promise<void> {
  const filePath = getRulesFilePath(repoRoot);
  const dir = dirname(filePath);

  await mkdir(dir, { recursive: true });

  const payload: RulesConfigFile = {
    version: 1,
    rules,
  };

  const tempPath = join(
    dir,
    `rules.tmp.${Date.now()}.${randomBytes(4).toString("hex")}`
  );

  await writeFile(tempPath, JSON.stringify(payload, null, 2) + "\n", "utf-8");
  await rename(tempPath, filePath);
}

export async function addRule(
  ruleOrId: string | SafeChangeRule,
  repoRoot: string
): Promise<SafeChangeRule> {
  let ruleToAdd: SafeChangeRule;

  if (typeof ruleOrId === "string") {
    const builtIn = getBuiltInRule(ruleOrId);
    if (builtIn) {
      ruleToAdd = builtIn;
    } else {
      // Try to read as a JSON file path
      try {
        const raw = await readFile(ruleOrId, "utf-8");
        const parsed = JSON.parse(raw);
        const validation = validateRule(parsed);
        if (!validation.valid) {
          throw new Error(`Invalid rule definition in file: ${validation.errors.join("; ")}`);
        }
        ruleToAdd = parsed as SafeChangeRule;
      } catch (err: unknown) {
        if (err instanceof Error && err.message.startsWith("Invalid rule definition")) {
          throw err;
        }
        throw new Error(
          `Rule "${ruleOrId}" is neither a recognized built-in rule nor a readable rule file.`
        );
      }
    }
  } else {
    const validation = validateRule(ruleOrId);
    if (!validation.valid) {
      throw new Error(`Invalid rule object: ${validation.errors.join("; ")}`);
    }
    ruleToAdd = ruleOrId;
  }

  const existingRules = await loadRules(repoRoot);
  const filtered = existingRules.filter((r) => r.id !== ruleToAdd.id);
  const updated = [...filtered, ruleToAdd];

  await saveRules(updated, repoRoot);
  return ruleToAdd;
}

export async function removeRule(
  ruleId: string,
  repoRoot: string
): Promise<boolean> {
  const existingRules = await loadRules(repoRoot);
  const filtered = existingRules.filter((r) => r.id !== ruleId);

  if (filtered.length === existingRules.length) {
    return false;
  }

  await saveRules(filtered, repoRoot);
  return true;
}
