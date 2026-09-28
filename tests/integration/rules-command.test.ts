import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, type TempRepo } from "../helpers/temp-repo.js";
import { runRules } from "../../src/commands/rules.js";
import { runSave } from "../../src/commands/save.js";
import { runCheck } from "../../src/commands/check.js";
import { loadRules } from "../../src/rules/manager.js";
import { ExitCodes } from "../../src/types/index.js";

describe("Rules command integration", () => {
  let repo: TempRepo;
  let originalCwd: string;
  let stdoutData: string;
  let stderrData: string;
  let originalStdoutWrite: typeof process.stdout.write;
  let originalStderrWrite: typeof process.stderr.write;

  beforeEach(async () => {
    repo = await createTempRepo();
    await repo.createConfig([]);
    originalCwd = process.cwd();
    process.chdir(repo.path);

    stdoutData = "";
    stderrData = "";
    originalStdoutWrite = process.stdout.write;
    originalStderrWrite = process.stderr.write;

    process.stdout.write = ((chunk: string | Buffer) => {
      stdoutData += chunk.toString();
      return true;
    }) as typeof process.stdout.write;

    process.stderr.write = ((chunk: string | Buffer) => {
      stderrData += chunk.toString();
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(async () => {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.chdir(originalCwd);
    if (repo) {
      await repo.cleanup();
    }
  });

  it("safe-change rules list displays available and active rules", async () => {
    const code = await runRules({ action: "list", format: "terminal" });
    expect(code).toBe(ExitCodes.OK);
    expect(stdoutData).toContain("Active Safety Rules");
    expect(stdoutData).toContain("Available Built-in Rules");
    expect(stdoutData).toContain("no-delete-migrations");

    // JSON format
    stdoutData = "";
    const jsonCode = await runRules({ action: "list", format: "json" });
    expect(jsonCode).toBe(ExitCodes.OK);
    const parsed = JSON.parse(stdoutData);
    expect(Array.isArray(parsed.activeRules)).toBe(true);
    expect(Array.isArray(parsed.availableBuiltIns)).toBe(true);
    expect(parsed.availableBuiltIns.length).toBeGreaterThan(0);
  });

  it("safe-change rules add adds a built-in rule to rules.json", async () => {
    const code = await runRules({
      action: "add",
      target: "no-delete-migrations",
      format: "terminal",
    });
    expect(code).toBe(ExitCodes.OK);
    expect(stdoutData).toContain("Safety rule activated");
    expect(stdoutData).toContain("no-delete-migrations");

    const rules = await loadRules(repo.path);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.id).toBe("no-delete-migrations");
  });

  it("safe-change rules remove removes rule from rules.json", async () => {
    await runRules({
      action: "add",
      target: "no-delete-migrations",
      format: "terminal",
    });

    stdoutData = "";
    const removeCode = await runRules({
      action: "remove",
      target: "no-delete-migrations",
      format: "terminal",
    });
    expect(removeCode).toBe(ExitCodes.OK);
    expect(stdoutData).toContain('Removed safety rule "no-delete-migrations"');

    const rules = await loadRules(repo.path);
    expect(rules).toHaveLength(0);
  });

  it("safe-change rules validate validates rule configuration and schema", async () => {
    await runRules({
      action: "add",
      target: "no-delete-migrations",
      format: "terminal",
    });

    stdoutData = "";
    const valCode = await runRules({
      action: "validate",
      format: "terminal",
    });
    expect(valCode).toBe(ExitCodes.OK);
    expect(stdoutData).toContain("Rules configuration is valid");
  });

  it("safe-change check enforces error rule and exits with code 1 on violation", async () => {
    // 1. Create a migration file and commit it
    const migrationFile = join(repo.path, "migrations", "001_init.sql");
    await repo.writeFile("migrations/001_init.sql", "CREATE TABLE users (id INT);");
    await repo.git("add", ".");
    await repo.git("commit", "-m", "add migration");

    // 2. Save baseline
    const saveCode = await runSave({
      description: "baseline with migration",
      format: "terminal",
    });
    expect(saveCode).toBe(ExitCodes.OK);

    // 3. Add no-delete-migrations safety rule
    await runRules({
      action: "add",
      target: "no-delete-migrations",
      format: "terminal",
    });

    // 4. Delete the migration file
    await unlink(migrationFile);

    // 5. Run check - should detect rule violation and return ExitCodes.NEW_FAILURE (1)
    stdoutData = "";
    const checkCode = await runCheck({ format: "terminal" });
    expect(checkCode).toBe(ExitCodes.NEW_FAILURE);
    expect(stdoutData).toContain("Safety Rules");
    expect(stdoutData).toContain("no-delete-migrations");
    expect(stdoutData).toContain("Deleted protected file");
  });

  it("safe-change check emits warning on warn-severity rule without failing check", async () => {
    // 1. Create lockfile and commit it
    await repo.writeFile("package-lock.json", '{"name": "test", "lockfileVersion": 3}');
    await repo.git("add", ".");
    await repo.git("commit", "-m", "add lockfile");

    // 2. Save baseline
    const saveCode = await runSave({
      description: "baseline with lockfile",
      format: "terminal",
    });
    expect(saveCode).toBe(ExitCodes.OK);

    // 3. Add no-modify-lockfile safety rule (severity: warn)
    await runRules({
      action: "add",
      target: "no-modify-lockfile",
      format: "terminal",
    });

    // 4. Modify the lockfile
    await repo.writeFile("package-lock.json", '{"name": "test", "lockfileVersion": 3, "modified": true}');

    // 5. Run check - should warn but exit code remains OK (0) since there are no error rules or check regressions
    stdoutData = "";
    const checkCode = await runCheck({ format: "terminal" });
    expect(checkCode).toBe(ExitCodes.OK);
    expect(stdoutData).toContain("Safety Rules");
    expect(stdoutData).toContain("no-modify-lockfile");
    expect(stdoutData).toContain("[WARN]");
  });

  it("safe-change check fails closed when rules.json is malformed JSON", async () => {
    await runSave({ description: "baseline", format: "terminal" });
    const rulesDir = join(repo.path, ".safe-change");
    await writeFile(join(rulesDir, "rules.json"), "{ broken json");

    stdoutData = "";
    stderrData = "";
    const checkCode = await runCheck({ format: "terminal" });
    expect(checkCode).toBe(ExitCodes.CONFIG_ERROR);
    expect(stderrData).toContain("Invalid safety rules configuration");

    // JSON format check
    stdoutData = "";
    stderrData = "";
    const jsonCode = await runCheck({ format: "json" });
    expect(jsonCode).toBe(ExitCodes.CONFIG_ERROR);
    const parsedError = JSON.parse(stderrData);
    expect(parsedError.exitCode).toBe(ExitCodes.CONFIG_ERROR);
    expect(parsedError.error).toContain("Invalid safety rules configuration");
  });

  it("safe-change check handles missing rules.json gracefully with not-configured state", async () => {
    await runSave({ description: "baseline", format: "terminal" });

    stdoutData = "";
    const checkCode = await runCheck({ format: "json" });
    expect(checkCode).toBe(ExitCodes.OK);
    const parsed = JSON.parse(stdoutData);
    expect(parsed.rulesState?.status).toBe("not-configured");
    expect(parsed.rulesState?.rules).toHaveLength(0);
  });

  it("safe-change check handles empty valid rules.json with empty state", async () => {
    await runSave({ description: "baseline", format: "terminal" });
    const rulesDir = join(repo.path, ".safe-change");
    await writeFile(join(rulesDir, "rules.json"), JSON.stringify({ version: 1, rules: [] }));

    stdoutData = "";
    const checkCode = await runCheck({ format: "json" });
    expect(checkCode).toBe(ExitCodes.OK);
    const parsed = JSON.parse(stdoutData);
    expect(parsed.rulesState?.status).toBe("empty");
    expect(parsed.rulesState?.rules).toHaveLength(0);
  });

  it("safe-change check rejects invalid rule schema in rules.json", async () => {
    await runSave({ description: "baseline", format: "terminal" });
    const rulesDir = join(repo.path, ".safe-change");
    await writeFile(
      join(rulesDir, "rules.json"),
      JSON.stringify({
        version: 1,
        rules: [{ id: "", name: "Invalid", severity: "invalid-sev", condition: { type: "unknown" } }],
      })
    );

    stdoutData = "";
    stderrData = "";
    const checkCode = await runCheck({ format: "terminal" });
    expect(checkCode).toBe(ExitCodes.CONFIG_ERROR);
    expect(stderrData).toContain("Invalid rule schema");
  });
});
