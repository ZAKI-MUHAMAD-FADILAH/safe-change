import { describe, it, expect } from "vitest";
import type {
  AgentAdapter,
  AdapterOperationResult,
  AdapterStatus,
} from "../../src/installer/adapters/adapter.js";

describe("installer/adapters/adapter interface contract", () => {
  /**
   * This test suite verifies that any object claiming to implement AgentAdapter
   * has the correct shape at runtime. It uses a minimal stub to test the contract.
   */

  function createStubAdapter(): AgentAdapter {
    return {
      agentName: "test-agent",
      displayName: "Test Agent",
      canonicalSkillPath: "/fake/path/SKILL.md",

      resolveTargetDir(options) {
        if (options.scope === "project") {
          return (options.workspaceRoot ?? "/workspace") + "/.agents/skills/test-agent";
        }
        return (options.homeDir ?? "/home/user") + "/.config/skills/test-agent";
      },

      install(_options) {
        return {
          status: "installed",
          targetDir: "/fake/target",
          scope: _options.scope,
          agent: "test-agent",
          message: "Installed.",
        };
      },

      update(_options) {
        return {
          status: "updated",
          targetDir: "/fake/target",
          scope: _options.scope,
          agent: "test-agent",
          message: "Updated.",
        };
      },

      uninstall(_options) {
        return {
          status: "uninstalled",
          targetDir: "/fake/target",
          scope: _options.scope,
          agent: "test-agent",
          message: "Uninstalled.",
        };
      },

      status(_options) {
        return {
          installed: false,
          scope: _options.scope,
          agent: "test-agent",
          targetDir: "/fake/target",
          manifest: null,
          hasDrift: false,
          canonicalSha256: null,
          installedSha256: null,
        };
      },
    };
  }

  it("should have required readonly properties", () => {
    const adapter = createStubAdapter();
    expect(typeof adapter.agentName).toBe("string");
    expect(typeof adapter.displayName).toBe("string");
    expect(typeof adapter.canonicalSkillPath).toBe("string");
    expect(adapter.agentName.length).toBeGreaterThan(0);
    expect(adapter.displayName.length).toBeGreaterThan(0);
  });

  it("should resolve target directory for project scope", () => {
    const adapter = createStubAdapter();
    const dir = adapter.resolveTargetDir({
      scope: "project",
      workspaceRoot: "/my/project",
    });
    expect(typeof dir).toBe("string");
    expect(dir.length).toBeGreaterThan(0);
  });

  it("should resolve target directory for global scope", () => {
    const adapter = createStubAdapter();
    const dir = adapter.resolveTargetDir({
      scope: "global",
      homeDir: "/home/testuser",
    });
    expect(typeof dir).toBe("string");
    expect(dir.length).toBeGreaterThan(0);
  });

  it("should return AdapterOperationResult from install()", () => {
    const adapter = createStubAdapter();
    const result: AdapterOperationResult = adapter.install({
      scope: "project",
      workspaceRoot: "/my/project",
    });
    expect(result.status).toBe("installed");
    expect(result.agent).toBe("test-agent");
    expect(typeof result.targetDir).toBe("string");
    expect(typeof result.message).toBe("string");
  });

  it("should return AdapterOperationResult from update()", () => {
    const adapter = createStubAdapter();
    const result: AdapterOperationResult = adapter.update({
      scope: "project",
      workspaceRoot: "/my/project",
    });
    expect(result.status).toBe("updated");
    expect(result.agent).toBe("test-agent");
  });

  it("should return AdapterOperationResult from uninstall()", () => {
    const adapter = createStubAdapter();
    const result: AdapterOperationResult = adapter.uninstall({
      scope: "project",
      workspaceRoot: "/my/project",
    });
    expect(result.status).toBe("uninstalled");
  });

  it("should return AdapterStatus from status()", () => {
    const adapter = createStubAdapter();
    const st: AdapterStatus = adapter.status({
      scope: "project",
      workspaceRoot: "/my/project",
    });
    expect(typeof st.installed).toBe("boolean");
    expect(typeof st.hasDrift).toBe("boolean");
    expect(st.agent).toBe("test-agent");
    expect(st.manifest).toBeNull();
  });
});
