// ---------------------------------------------------------------------------
// safe-change -- Configuration loader
// ---------------------------------------------------------------------------

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SafeChangeConfig, CheckDefinition } from "../types/index.js";

const CONFIG_FILENAME = ".safe-change.json";
const DEFAULT_TIMEOUT = 60;
const MAX_TIMEOUT = 3600;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export async function loadConfig(projectRoot: string): Promise<SafeChangeConfig> {
  const configPath = join(projectRoot, CONFIG_FILENAME);
  let raw: string;

  try {
    raw = await readFile(configPath, "utf-8");
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      throw new ConfigError(
        `Configuration file not found: ${configPath}\n` +
        `Create a ${CONFIG_FILENAME} file with your verification checks.\n` +
        `Example:\n` +
        `{\n` +
        `  "version": 1,\n` +
        `  "checks": [\n` +
        `    { "name": "build", "executable": "npm", "args": ["run", "build"], "timeout": 60 }\n` +
        `  ]\n` +
        `}`
      );
    }
    throw new ConfigError(`Failed to read configuration: ${String(err)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError(
      `Invalid JSON in ${configPath}. Check for syntax errors.`
    );
  }

  return validateConfig(parsed);
}

function validateConfig(data: unknown): SafeChangeConfig {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new ConfigError("Configuration must be a JSON object.");
  }

  const obj = data as Record<string, unknown>;

  if (obj["version"] !== 1) {
    throw new ConfigError(
      `Unsupported configuration version: ${String(obj["version"])}. Expected version 1.`
    );
  }

  if (!Array.isArray(obj["checks"])) {
    throw new ConfigError(`"checks" must be an array.`);
  }

  const checks: CheckDefinition[] = [];
  const names = new Set<string>();

  for (let i = 0; i < obj["checks"].length; i++) {
    const check = validateCheckDefinition(obj["checks"][i], i);
    if (names.has(check.name)) {
      throw new ConfigError(
        `Duplicate check name "${check.name}" at index ${i}.`
      );
    }
    names.add(check.name);
    checks.push(check);
  }

  return { version: 1, checks };
}

function validateCheckDefinition(data: unknown, index: number): CheckDefinition {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new ConfigError(`checks[${index}] must be an object.`);
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj["name"] !== "string" || obj["name"].trim() === "") {
    throw new ConfigError(`checks[${index}].name must be a non-empty string.`);
  }

  if (typeof obj["executable"] !== "string" || obj["executable"].trim() === "") {
    throw new ConfigError(
      `checks[${index}].executable must be a non-empty string.`
    );
  }

  if (!Array.isArray(obj["args"])) {
    throw new ConfigError(`checks[${index}].args must be an array of strings.`);
  }

  for (let j = 0; j < obj["args"].length; j++) {
    if (typeof obj["args"][j] !== "string") {
      throw new ConfigError(
        `checks[${index}].args[${j}] must be a string.`
      );
    }
  }

  let timeout = DEFAULT_TIMEOUT;
  if (obj["timeout"] !== undefined) {
    if (typeof obj["timeout"] !== "number" || obj["timeout"] <= 0) {
      throw new ConfigError(
        `checks[${index}].timeout must be a positive number (seconds).`
      );
    }
    if (obj["timeout"] > MAX_TIMEOUT) {
      throw new ConfigError(
        `checks[${index}].timeout exceeds maximum of ${MAX_TIMEOUT} seconds.`
      );
    }
    timeout = obj["timeout"];
  }

  return {
    name: obj["name"].trim(),
    executable: obj["executable"].trim(),
    args: obj["args"] as string[],
    timeout,
  };
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
