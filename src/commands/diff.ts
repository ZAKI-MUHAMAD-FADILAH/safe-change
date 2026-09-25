// ---------------------------------------------------------------------------
// safe-change -- diff command
// ---------------------------------------------------------------------------

import type { OutputFormat, DiffSummary } from "../types/index.js";
import { ExitCodes } from "../types/index.js";
import {
  getRepositoryRoot,
  getFileEntries,
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

  // 2. Load baseline
  let baseline;
  try {
    baseline = await loadBaseline(repoRoot);
  } catch (err: unknown) {
    if (format === "terminal") {
      process.stderr.write(
        `\n  Warning: ${err instanceof Error ? err.message : String(err)}\n` +
        `  Cannot compare against baseline.\n\n`
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

  // 4. Compare files against baseline (or summarize non-clean files if no baseline)
  let fileChanges;
  if (baseline) {
    fileChanges = compareFiles(baseline.files, currentFiles);
  } else {
    const added: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];
    let unchangedCount = 0;

    for (const path of Object.keys(currentFiles)) {
      const entry = currentFiles[path]!;
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

  // 5. Construct diff summary (Option B: hash-based baseline with honest file changes)
  const summary: DiffSummary = {
    files: fileChanges,
    hasBaseline: baseline !== null,
    lineDiffAvailable: false,
    note: baseline
      ? "Line diff unavailable: safe-change stores file integrity hashes rather than file contents at baseline. Run 'git diff' to inspect uncommitted changes in your working tree."
      : "No baseline found. Run 'safe-change save' to create a baseline.",
  };

  // 6. Render output
  process.stdout.write(renderDiffSummary(format, summary, baseline));

  return ExitCodes.OK;
}
