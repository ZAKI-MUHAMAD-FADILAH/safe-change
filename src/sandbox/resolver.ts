import { statSync, existsSync } from "node:fs";
import { resolve, delimiter, isAbsolute, dirname } from "node:path";

export interface ResolvedCommand {
  readonly executable: string;
  readonly args: readonly string[];
}

export function validateCommandArguments(
  executable: string,
  args: readonly string[]
): void {
  if (!executable || /[\0\r\n]/.test(executable)) {
    throw new Error(
      `Executable '${executable}' contains forbidden control characters`
    );
  }
}

/**
 * Resolves an executable and its arguments safely for direct process spawn (shell: false).
 * On Windows, prevents CVE-2024-27980 / EINVAL / shell injection by resolving npm, npx,
 * and node bin scripts directly to node.exe + js script instead of invoking cmd.exe.
 */
export function resolveSafeCommand(
  executable: string,
  args: readonly string[],
  cwd: string
): ResolvedCommand {
  validateCommandArguments(executable, args);

  const isWindows = process.platform === "win32";

  if (isWindows) {
    const nodeDir = dirname(process.execPath);

    // 1. Special handling for npm
    if (executable === "npm" || executable.endsWith("\\npm") || executable.endsWith("/npm")) {
      const npmCli = resolve(nodeDir, "node_modules", "npm", "bin", "npm-cli.js");
      if (existsSync(npmCli)) {
        return {
          executable: process.execPath,
          args: [npmCli, ...args],
        };
      }
    }

    // 2. Special handling for npx
    if (executable === "npx" || executable.endsWith("\\npx") || executable.endsWith("/npx")) {
      const npxCli = resolve(nodeDir, "node_modules", "npm", "bin", "npx-cli.js");
      if (existsSync(npxCli)) {
        return {
          executable: process.execPath,
          args: [npxCli, ...args],
        };
      }
    }

    // 3. Check local node_modules/.bin scripts
    const localBinJs = resolve(cwd, "node_modules", executable, "bin", `${executable}.js`);
    if (existsSync(localBinJs)) {
      return {
        executable: process.execPath,
        args: [localBinJs, ...args],
      };
    }
  }

  // If already absolute or relative path with slashes
  if (isAbsolute(executable) || executable.includes("/") || executable.includes("\\")) {
    const absPath = resolve(cwd, executable);
    if (existsSync(absPath)) {
      return { executable: absPath, args };
    }
  }

  // Windows extension resolution for other .exe binaries
  const pathExtensions = isWindows
    ? (process.env["PATHEXT"] ?? ".COM;.EXE;.BAT;.CMD").split(";").map((e) => e.toLowerCase())
    : [""];

  const pathEnv = process.env["PATH"] ?? "";
  const directories = pathEnv.split(delimiter);
  directories.unshift(resolve(cwd, "node_modules", ".bin"));

  for (const dir of directories) {
    if (!dir) continue;
    for (const ext of pathExtensions) {
      const candidateName = executable.toLowerCase().endsWith(ext)
        ? executable
        : `${executable}${ext}`;
      const candidatePath = resolve(dir, candidateName);
      try {
        const st = statSync(candidatePath);
        if (st.isFile()) {
          return { executable: candidatePath, args };
        }
      } catch {
        // continue
      }
    }
  }

  return { executable, args };
}
