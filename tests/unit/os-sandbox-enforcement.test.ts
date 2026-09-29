import { describe, it, expect } from "vitest";
import { getSandboxProvider, evaluateSandbox } from "../../src/sandbox/factory.js";
import { resolveSafeCommand } from "../../src/sandbox/resolver.js";
import { executeCheck } from "../../src/runner/executor.js";

describe("OS-Backed Sandbox & Enforcement", () => {
  it("detects sandbox capabilities for current operating system honestly", async () => {
    const provider = getSandboxProvider();
    const caps = await provider.detectCapabilities();

    expect(caps.processIsolation).toBe(true);
    expect(caps.processTreeTermination).toBe(true);
    expect(caps.outputLimit).toBe(true);

    // On Windows and macOS without bubblewrap/containers, networkIsolation is honestly false
    if (process.platform === "win32" || process.platform === "darwin") {
      expect(caps.networkIsolation).toBe(false);
      expect(caps.readOnlyWorkspace).toBe(false);
    }
  });

  it("fails closed (BLOCKED) when policy requires network denial on platform without OS network isolation", async () => {
    const report = await evaluateSandbox({
      executable: "node",
      args: ["--version"],
      cwd: process.cwd(),
      timeoutSeconds: 10,
      maxOutputBytes: 10000,
      allowedEnv: ["NODE_ENV"],
      inheritEnv: false,
      networkPolicy: "deny",
      readOnlyWorkspace: false,
    });

    if (process.platform === "win32" || process.platform === "darwin") {
      expect(report.state).toBe("BLOCKED");
      expect(report.reasons.some((r) => r.includes("network"))).toBe(true);
    }
  });

  it("fails closed (BLOCKED) when policy requires read-only workspace without OS filesystem isolation", async () => {
    const report = await evaluateSandbox({
      executable: "node",
      args: ["--version"],
      cwd: process.cwd(),
      timeoutSeconds: 10,
      maxOutputBytes: 10000,
      allowedEnv: ["NODE_ENV"],
      inheritEnv: false,
      networkPolicy: "inherit",
      readOnlyWorkspace: true,
    });

    if (process.platform === "win32" || process.platform === "darwin") {
      expect(report.state).toBe("BLOCKED");
      expect(report.reasons.some((r) => r.includes("Read-only workspace"))).toBe(
        true
      );
    }
  });

  it("resolves node/npm safe command directly without invoking cmd.exe or shell", () => {
    const res = resolveSafeCommand("npm", ["--version"], process.cwd());
    expect(res.executable).not.toContain("cmd.exe");
    expect(res.executable).not.toContain("powershell");
  });

  it("rejects forbidden control characters in executable path", () => {
    expect(() =>
      resolveSafeCommand("node\0malicious", ["-v"], process.cwd())
    ).toThrow();
    expect(() =>
      resolveSafeCommand("node\nmalicious", ["-v"], process.cwd())
    ).toThrow();
  });

  it("enforces output limit on large command outputs", async () => {
    const res = await executeCheck(
      {
        name: "output-test",
        executable: process.execPath,
        args: ["-e", "for(let i=0;i<1000;i++) console.log('line ' + i)"],
        timeout: 10,
      },
      {
        cwd: process.cwd(),
        outputLimit: 500, // strict 500 byte limit
      }
    );

    expect(res.passed).toBe(true);
    expect(res.outputTruncated).toBe(true);
  });

  it("terminates child process tree upon timeout", async () => {
    const res = await executeCheck(
      {
        name: "sleep-test",
        executable: process.execPath,
        args: [
          "-e",
          "setTimeout(() => console.log('done'), 10000);",
        ],
        timeout: 1, // 1 second timeout
      },
      {
        cwd: process.cwd(),
      }
    );

    expect(res.timedOut).toBe(true);
    expect(res.passed).toBe(false);
  });
});
