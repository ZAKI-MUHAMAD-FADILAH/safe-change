// ---------------------------------------------------------------------------
// safe-change -- diff command
// ---------------------------------------------------------------------------

import type { OutputFormat, DiffSummary } from "../types/index.js";
import { ExitCodes } from "../types/index.js";
import {
  getRepositoryRoot,
  getFileEntries,
  getDiffText,
} from "../git/inspector.js";
import { loadBaseline } from "../baseline/manager.js";
import { compareFiles } from "../comparator/engine.js";
import { renderDiffSummary, renderError } from "../output/renderer.js";

export interface DiffOptions {
  readonly format: OutputFormat;
}

export async function runDiff(options: DiffOptions): Promise<number> {
  const { format } = options;

  // 1. Verify Git repository
  let repoRoot: string;
  try {
    repoRoot = await getRepositoryRoot(process.cwd());
  } catch {
    process.stderr.write(
      renderError(format, "Not a Git repository. safe-change requires a Git repository.", ExitCodes.NOT_GIT_REPO)
    );
    return ExitCodes.NOT_GIT_REPO;
  }

  // 2. Load baseline (optional for diff -- we can still show changes)
  let baseline;
  try {
    baseline = await loadBaseline(repoRoot);
  } catch (err: unknown) {
    // Corrupt baseline: warn but continue with file-level diff
    if (format === "terminal") {
      process.stderr.write(
        `\n  Warning: ${err instanceof Error ? err.message : String(err)}\n` +
        `  Showing Git diff without baseline comparison.\n\n`
      );
    }
    baseline = null;
  }

  // 3. Get current file state
  let currentFiles;
  try {
    currentFiles = await getFileEntries(repoRoot);
  } catch (err: unknown) {
    process.stderr.write(
      renderError(
        format,
        `Failed to read repository state: ${err instanceof Error ? err.message : String(err)}`,
        ExitCodes.INTERNAL_ERROR
      )
    );
    return ExitCodes.INTERNAL_ERROR;
  }

  // 4. Compare files against baseline
  let fileChanges;
  if (baseline) {
    fileChanges = compareFiles(baseline.files, currentFiles);
  } else {
    // Without baseline, show all non-clean files as context
    const added: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];
    let unchangedCount = 0;

    for (const [path, entry] of Object.entries(currentFiles)) {
      switch (entry.status) {
        case "untracked":
          added.push(path);
          break;
        case "modified":
        case "staged":
          modified.push(path);
          break;
        case "deleted":
          deleted.push(path);
          break;
        default:
          unchangedCount++;
      }
    }

    fileChanges = { added, modified, deleted, unchangedCount };
  }

  // 5. Get Git diff text (only for files changed since baseline, if baseline exists)
  let diffData;
  try {
    if (baseline) {
      const changedFiles = [
        ...fileChanges.modified,
        ...fileChanges.added,
        ...fileChanges.deleted,
      ];
      if (changedFiles.length === 0) {
        diffData = { text: "", truncated: false, linesAdded: 0, linesRemoved: 0 };
      } else {
        diffData = await getDiffText(repoRoot, changedFiles);
      }
    } else {
      diffData = await getDiffText(repoRoot);
    }
  } catch (err: unknown) {
    process.stderr.write(
      renderError(
        format,
        `Failed to generate diff: ${err instanceof Error ? err.message : String(err)}`,
        ExitCodes.INTERNAL_ERROR
      )
    );
    return ExitCodes.INTERNAL_ERROR;
  }

  const summary: DiffSummary = {
    files: fileChanges,
    hasBaseline: baseline !== null,
    totalLinesAdded: diffData.linesAdded,
    totalLinesRemoved: diffData.linesRemoved,
    truncated: diffData.truncated,
    diffText: diffData.text,
  };

  // 6. Render output
  process.stdout.write(renderDiffSummary(format, summary, baseline));

  return ExitCodes.OK;
}
