import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { loadBaseline } from "../baseline/manager.js";
import { readEntries } from "../log/log-manager.js";
import { loadConfig } from "../config/loader.js";
import { renderDashboardHtml } from "./template.js";

export const DEFAULT_DASHBOARD_PORT = 4242;
export const LOCALHOST_HOST = "127.0.0.1";

export interface DashboardServerOptions {
  port?: number;
  repoRoot?: string;
}

export interface DashboardServerInstance {
  server: Server;
  port: number;
  host: string;
  url: string;
  close: () => Promise<void>;
}

export async function createDashboardServer(
  options: DashboardServerOptions = {}
): Promise<Server> {
  const repoRoot = options.repoRoot ?? process.cwd();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://${LOCALHOST_HOST}`);

    if (req.method !== "GET") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method Not Allowed" }));
      return;
    }

    if (url.pathname === "/") {
      const html = renderDashboardHtml();
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": Buffer.byteLength(html),
      });
      res.end(html);
      return;
    }

    if (url.pathname === "/api/status") {
      try {
        const baseline = await loadBaseline(repoRoot);
        const data = baseline
          ? {
              hasBaseline: true,
              createdAt: baseline.createdAt,
              description: baseline.description,
              fileCount: Object.keys(baseline.files).length,
              git: baseline.git,
              checks: baseline.checks,
            }
          : {
              hasBaseline: false,
              createdAt: null,
              description: null,
              fileCount: 0,
              git: null,
              checks: [],
            };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      } catch (err: unknown) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
      return;
    }

    if (url.pathname === "/api/log") {
      try {
        const entries = await readEntries(repoRoot);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(entries));
      } catch (err: unknown) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
      return;
    }

    if (url.pathname === "/api/config") {
      try {
        const config = await loadConfig(repoRoot);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(config));
      } catch {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ exists: false, checks: [] }));
      }
      return;
    }

    if (url.pathname === "/api/rules") {
      try {
        const rulesPath = join(repoRoot, ".safe-change", "rules.json");
        const raw = await readFile(rulesPath, "utf-8");
        const parsed = JSON.parse(raw);
        const rules = Array.isArray(parsed?.rules) ? parsed.rules : [];
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(rules));
      } catch {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify([]));
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  return server;
}

export function openBrowser(url: string): void {
  try {
    let command: string;
    let args: string[];

    if (process.platform === "win32") {
      command = "cmd.exe";
      args = ["/c", "start", "", url];
    } else if (process.platform === "darwin") {
      command = "open";
      args = [url];
    } else {
      command = "xdg-open";
      args = [url];
    }

    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch {
    // If opening browser fails, continue without error
  }
}

export async function startDashboardServer(
  options: DashboardServerOptions = {}
): Promise<DashboardServerInstance> {
  const server = await createDashboardServer(options);

  let targetPort = options.port;
  if (targetPort === undefined) {
    const repoRoot = options.repoRoot ?? process.cwd();
    try {
      const config = await loadConfig(repoRoot);
      targetPort = config.dashboardPort ?? DEFAULT_DASHBOARD_PORT;
    } catch {
      targetPort = DEFAULT_DASHBOARD_PORT;
    }
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(targetPort, LOCALHOST_HOST, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const addr = server.address() as AddressInfo;
  const actualPort = addr.port;
  const url = `http://${LOCALHOST_HOST}:${actualPort}`;

  return {
    server,
    port: actualPort,
    host: LOCALHOST_HOST,
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
