import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

function getPackageVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(
      readFileSync(join(__dirname, "..", "..", "package.json"), "utf-8")
    ) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const TOOLS = [
  {
    name: "safe_change_save",
    description:
      "Record a baseline snapshot of the current repository state and run all configured verification checks. Call this before making any risky edits.",
    inputSchema: {
      type: "object" as const,
      properties: {
        description: {
          type: "string",
          description:
            "Optional human-readable label for this baseline (e.g. 'pre-refactor baseline').",
        },
        cwd: {
          type: "string",
          description:
            "Absolute path to the project root. Defaults to process.cwd() if omitted.",
        },
      },
      required: [] as string[],
    },
  },
  {
    name: "safe_change_check",
    description:
      "Compare the current repository state and verification checks against the saved baseline. Returns regression status. Exit code 1 means regression detected.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cwd: {
          type: "string",
          description:
            "Absolute path to the project root. Defaults to process.cwd() if omitted.",
        },
      },
      required: [] as string[],
    },
  },
  {
    name: "safe_change_diff",
    description:
      "Show a file-level summary of changes (added, modified, deleted) relative to the baseline. Does not show line diffs; use git diff for that.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cwd: {
          type: "string",
          description:
            "Absolute path to the project root. Defaults to process.cwd() if omitted.",
        },
      },
      required: [] as string[],
    },
  },
  {
    name: "safe_change_status",
    description:
      "Show the current baseline status: whether a baseline exists, when it was recorded, and summary of last check results.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cwd: {
          type: "string",
          description:
            "Absolute path to the project root. Defaults to process.cwd() if omitted.",
        },
      },
      required: [] as string[],
    },
  },
] as const;

function toolToCommand(toolName: string): string[] | null {
  switch (toolName) {
    case "safe_change_save":
      return ["save"];
    case "safe_change_check":
      return ["check"];
    case "safe_change_diff":
      return ["diff"];
    case "safe_change_status":
      return ["status"];
    default:
      return null;
  }
}

const DEFAULT_TIMEOUT_MS = 120_000;

interface ToolCallResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

function runCli(
  args: string[],
  cwd: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<ToolCallResult> {
  return new Promise((resolve) => {
    const cliPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "cli.js"
    );

    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
      env: { ...process.env, NO_COLOR: "1" },
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ETIMEDOUT" || err.code === "ABORT_ERR") {
        timedOut = true;
      }
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr:
          Buffer.concat(stderrChunks).toString("utf-8") ||
          `Process error: ${err.message}`,
        exitCode: null,
        timedOut,
      });
    });

    child.on("close", (code) => {
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8"),
        exitCode: code,
        timedOut,
      });
    });
  });
}

export function createServer(): Server {
  const version = getPackageVersion();

  const server = new Server(
    { name: "safe-change", version },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: [...TOOLS] };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: toolArgs } = request.params;
    const args = (toolArgs ?? {}) as Record<string, unknown>;

    const commandParts = toolToCommand(name);
    if (commandParts === null) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    const cliArgs = [...commandParts, "--json"];

    if (name === "safe_change_save" && typeof args["description"] === "string") {
      cliArgs.push(args["description"]);
    }

    const cwd =
      typeof args["cwd"] === "string" ? args["cwd"] : process.cwd();

    const result = await runCli(cliArgs, cwd);

    if (result.timedOut) {
      return {
        content: [
          {
            type: "text",
            text: `Tool ${name} timed out after ${DEFAULT_TIMEOUT_MS / 1000} seconds.`,
          },
        ],
        isError: true,
      };
    }

    // Exit code 1 for safe_change_check is regression detected, not an error
    const isRegressionCheck =
      name === "safe_change_check" && result.exitCode === 1;

    if (result.exitCode !== 0 && !isRegressionCheck) {
      const errorText = result.stderr || result.stdout || "Unknown error";
      return {
        content: [{ type: "text", text: errorText }],
        isError: true,
      };
    }

    return {
      content: [{ type: "text", text: result.stdout || "(no output)" }],
    };
  });

  return server;
}

export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdout is reserved for MCP protocol
  process.stderr.write(
    `safe-change MCP server started (pid ${process.pid})\n`
  );
}

export { TOOLS, toolToCommand };
