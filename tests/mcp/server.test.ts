import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer, TOOLS, toolToCommand } from "../../src/mcp/server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

let tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "safe-change-mcp-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tempDirs) {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  }
  tempDirs = [];
});

async function createConnectedPair(): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const server = createServer();
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);

  const client = new Client(
    { name: "test-client", version: "0.0.1" },
    { capabilities: {} }
  );
  await client.connect(clientTransport);

  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe("MCP Server", () => {
  it("can be initialized without error", () => {
    const server = createServer();
    expect(server).toBeDefined();
  });

  it("registers exactly 4 tools", async () => {
    const { client, close } = await createConnectedPair();
    try {
      const result = await client.listTools();
      expect(result.tools).toHaveLength(4);
      const names = result.tools.map((t) => t.name).sort();
      expect(names).toEqual([
        "safe_change_check",
        "safe_change_diff",
        "safe_change_save",
        "safe_change_status",
      ]);
    } finally {
      await close();
    }
  });

  it("every tool has a non-empty description", async () => {
    const { client, close } = await createConnectedPair();
    try {
      const result = await client.listTools();
      for (const tool of result.tools) {
        expect(tool.description).toBeTruthy();
        expect(typeof tool.description).toBe("string");
        expect(tool.description!.length).toBeGreaterThan(10);
      }
    } finally {
      await close();
    }
  });

  it("every tool has a valid inputSchema", async () => {
    const { client, close } = await createConnectedPair();
    try {
      const result = await client.listTools();
      for (const tool of result.tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
        expect(tool.inputSchema.properties).toBeDefined();
      }
    } finally {
      await close();
    }
  });
});

describe("MCP Tool schemas", () => {
  it("safe_change_save accepts optional description and cwd", async () => {
    const { client, close } = await createConnectedPair();
    try {
      const result = await client.listTools();
      const saveTool = result.tools.find((t) => t.name === "safe_change_save");
      expect(saveTool).toBeDefined();
      const props = saveTool!.inputSchema.properties as Record<string, unknown>;
      expect(props).toHaveProperty("description");
      expect(props).toHaveProperty("cwd");
      // Both should be optional (not in required)
      const required = (saveTool!.inputSchema as { required?: string[] })
        .required;
      if (required) {
        expect(required).not.toContain("description");
        expect(required).not.toContain("cwd");
      }
    } finally {
      await close();
    }
  });

  it("safe_change_check accepts optional cwd", async () => {
    const { client, close } = await createConnectedPair();
    try {
      const result = await client.listTools();
      const tool = result.tools.find((t) => t.name === "safe_change_check");
      expect(tool).toBeDefined();
      const props = tool!.inputSchema.properties as Record<string, unknown>;
      expect(props).toHaveProperty("cwd");
    } finally {
      await close();
    }
  });

  it("safe_change_diff accepts optional cwd", async () => {
    const { client, close } = await createConnectedPair();
    try {
      const result = await client.listTools();
      const tool = result.tools.find((t) => t.name === "safe_change_diff");
      expect(tool).toBeDefined();
      const props = tool!.inputSchema.properties as Record<string, unknown>;
      expect(props).toHaveProperty("cwd");
    } finally {
      await close();
    }
  });

  it("safe_change_status accepts optional cwd", async () => {
    const { client, close } = await createConnectedPair();
    try {
      const result = await client.listTools();
      const tool = result.tools.find((t) => t.name === "safe_change_status");
      expect(tool).toBeDefined();
      const props = tool!.inputSchema.properties as Record<string, unknown>;
      expect(props).toHaveProperty("cwd");
    } finally {
      await close();
    }
  });
});

describe("MCP Tool execution", () => {
  it("tool call with non-existent cwd returns isError: true", async () => {
    const { client, close } = await createConnectedPair();
    try {
      const result = await client.callTool({
        name: "safe_change_status",
        arguments: { cwd: "/non/existent/path/that/does/not/exist" },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        ?.text;
      expect(text).toBeTruthy();
      expect(typeof text).toBe("string");
    } finally {
      await close();
    }
  });

  it("safe_change_save in a valid directory returns a response without crash", async () => {
    const tempDir = await createTempDir();
    const { client, close } = await createConnectedPair();
    try {
      // The call may fail (not a git repo, no config, etc.)
      // but it should NOT crash the server
      const result = await client.callTool({
        name: "safe_change_save",
        arguments: { cwd: tempDir },
      });
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content.length).toBeGreaterThan(0);
      expect(typeof content[0]?.text).toBe("string");
    } finally {
      await close();
    }
  });
});

describe("MCP internal helpers", () => {
  it("TOOLS array contains exactly 4 entries", () => {
    expect(TOOLS).toHaveLength(4);
  });

  it("toolToCommand maps known tool names correctly", () => {
    expect(toolToCommand("safe_change_save")).toEqual(["save"]);
    expect(toolToCommand("safe_change_check")).toEqual(["check"]);
    expect(toolToCommand("safe_change_diff")).toEqual(["diff"]);
    expect(toolToCommand("safe_change_status")).toEqual(["status"]);
  });

  it("toolToCommand returns null for unknown tools", () => {
    expect(toolToCommand("unknown_tool")).toBeNull();
    expect(toolToCommand("")).toBeNull();
  });
});