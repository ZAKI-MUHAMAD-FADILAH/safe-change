import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { LogEntry } from "../types/index.js";

const STATE_DIR = ".safe-change";
const LOG_FILE = "log.json";
const DEFAULT_RETENTION = 100;

export function getLogFilePath(repoRoot: string = process.cwd()): string {
  return join(repoRoot, STATE_DIR, LOG_FILE);
}

export function createLogEntry(
  params: Omit<LogEntry, "id" | "timestamp"> & {
    id?: string;
    timestamp?: string;
  }
): LogEntry {
  return {
    id: params.id ?? randomUUID(),
    timestamp: params.timestamp ?? new Date().toISOString(),
    description: params.description ?? null,
    baselineId: params.baselineId,
    trigger: params.trigger,
    checkResults: params.checkResults,
    fileSummary: params.fileSummary,
    regressionDetected: params.regressionDetected,
    durationMs: params.durationMs ?? null,
  };
}

export async function readEntries(repoRoot: string = process.cwd()): Promise<LogEntry[]> {
  const filePath = getLogFilePath(repoRoot);
  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as LogEntry[];
  } catch {
    // Return empty array if file is absent, unreadable, or partially written
    return [];
  }
}

async function writeEntriesAtomically(
  filePath: string,
  entries: LogEntry[]
): Promise<void> {
  const serialized = JSON.stringify(entries, null, 2) + "\n";
  const tempPath = `${filePath}.tmp.${randomUUID()}`;
  await writeFile(tempPath, serialized, "utf-8");
  await rename(tempPath, filePath);
}

export async function appendEntry(
  entry: LogEntry,
  repoRoot: string = process.cwd(),
  retention: number = DEFAULT_RETENTION
): Promise<void> {
  const stateDir = join(repoRoot, STATE_DIR);
  await mkdir(stateDir, { recursive: true });

  const entries = await readEntries(repoRoot);
  entries.push(entry);

  const effectiveRetention = retention > 0 ? retention : DEFAULT_RETENTION;
  const pruned =
    entries.length > effectiveRetention
      ? entries.slice(entries.length - effectiveRetention)
      : entries;

  const filePath = getLogFilePath(repoRoot);
  await writeEntriesAtomically(filePath, pruned);
}

export async function pruneToRetention(
  max: number,
  repoRoot: string = process.cwd()
): Promise<void> {
  if (max <= 0) return;
  const entries = await readEntries(repoRoot);
  if (entries.length <= max) return;

  const pruned = entries.slice(entries.length - max);
  const filePath = getLogFilePath(repoRoot);
  await writeEntriesAtomically(filePath, pruned);
}

export async function clearLog(repoRoot: string = process.cwd()): Promise<void> {
  const stateDir = join(repoRoot, STATE_DIR);
  await mkdir(stateDir, { recursive: true });
  const filePath = getLogFilePath(repoRoot);
  await writeEntriesAtomically(filePath, []);
}

export async function exportLog(
  outputPath: string,
  repoRoot: string = process.cwd()
): Promise<void> {
  const entries = await readEntries(repoRoot);
  const serialized = JSON.stringify(entries, null, 2) + "\n";
  await writeFile(outputPath, serialized, "utf-8");
}

export async function updateLastEntry(
  updates: Partial<LogEntry>,
  repoRoot: string = process.cwd()
): Promise<void> {
  const entries = await readEntries(repoRoot);
  if (entries.length === 0) {
    const newEntry = createLogEntry({
      description: updates.description ?? null,
      baselineId: updates.baselineId ?? "unknown",
      trigger: updates.trigger ?? "cli",
      checkResults: updates.checkResults ?? [],
      fileSummary: updates.fileSummary ?? { added: 0, modified: 0, deleted: 0, unchanged: 0 },
      regressionDetected: updates.regressionDetected ?? false,
      durationMs: updates.durationMs ?? null,
    });
    await appendEntry(newEntry, repoRoot);
    return;
  }

  const lastIndex = entries.length - 1;
  const current = entries[lastIndex]!;
  entries[lastIndex] = {
    ...current,
    ...updates,
    checkResults: updates.checkResults ?? current.checkResults,
    fileSummary: updates.fileSummary ?? current.fileSummary,
  };

  const filePath = getLogFilePath(repoRoot);
  await writeEntriesAtomically(filePath, entries);
}
