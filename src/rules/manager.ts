import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";
import type { SafeChangeRule, RulesConfigFile, RulesState } from "../types/index.js";
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
    exactMatch?: unknown;
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
      "protect-lockfiles",
    ];

    if (!validTypes.includes(c.type as string)) {
      errors.push(`Rule condition type must be one of: ${validTypes.join(", ")}`);
    }

    if (
      c.type === "file-not-deleted" ||
      c.type === "file-not-modified" ||
      c.type === "protect-lockfiles"
    ) {
      const hasPattern = typeof c.pattern === "string" && c.pattern.trim().length > 0;
      const hasPatterns =
        Array.isArray(c.patterns) &&
        c.patterns.length > 0 &&
        c.patterns.every((p) => typeof p === "string" && p.trim().length > 0);
      if (!hasPattern && !hasPatterns) {
        errors.push(`Condition ${c.type} requires a non-empty pattern or non-empty patterns array`);
      }
    }

    if (c.type === "max-files-changed" || c.type === "max-deleted-files") {
      if (
        typeof c.threshold !== "number" ||
        !Number.isInteger(c.threshold) ||
        c.threshold < 0 ||
        c.threshold > 1000000
      ) {
        errors.push(`Condition ${c.type} requires a non-negative integer threshold`);
      }
    }

    if (c.type === "require-check-pass") {
      if (typeof c.checkName !== "string" || c.checkName.trim().length === 0) {
        errors.push("Condition require-check-pass requires a non-empty checkName string");
      }
      if (c.exactMatch !== undefined && typeof c.exactMatch !== "boolean") {
        errors.push("Condition require-check-pass exactMatch must be a boolean if specified");
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function loadRulesResult(repoRoot: string): Promise<RulesState> {
  const filePath = getRulesFilePath(repoRoot);

  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "ENOENT") {
      return { status: "not-configured", rules: [] };
    }
    return {
      status: "invalid",
      rules: [],
      error: `Failed to read rules file at ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    return {
      status: "invalid",
      rules: [],
      error: `Rules file contains invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      status: "invalid",
      rules: [],
      error: "Rules configuration must be an object containing a 'rules' array",
    };
  }

  const rulesRecord = parsed as { rules?: unknown };
  if (!Array.isArray(rulesRecord.rules)) {
    return {
      status: "invalid",
      rules: [],
      error: "Rules configuration missing 'rules' array property",
    };
  }

  if (rulesRecord.rules.length === 0) {
    return { status: "empty", rules: [] };
  }

  const validatedRules: SafeChangeRule[] = [];
  for (let i = 0; i < rulesRecord.rules.length; i++) {
    const candidate = rulesRecord.rules[i];
    const validation = validateRule(candidate);
    if (!validation.valid) {
      const candidateId =
        candidate && typeof candidate === "object" && "id" in candidate && typeof (candidate as { id: unknown }).id === "string"
          ? (candidate as { id: string }).id
          : `#${i}`;
      return {
        status: "invalid",
        rules: [],
        error: `Invalid rule schema at rule index ${i} (id: "${candidateId}"): ${validation.errors.join("; ")}`,
      };
    }
    validatedRules.push(candidate as SafeChangeRule);
  }

  return { status: "loaded", rules: validatedRules };
}

export async function loadRules(repoRoot: string): Promise<SafeChangeRule[]> {
  const result = await loadRulesResult(repoRoot);
  if (result.status === "invalid") {
    throw new Error(result.error ?? "Invalid rules configuration file");
  }
  return [...result.rules];
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
