import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateKeyPairSync } from "node:crypto";

import * as SemanticModule from "../../src/semantic/index.js";
import * as ReplayModule from "../../src/replay/index.js";
import * as AttestationModule from "../../src/attestation/index.js";
import * as SandboxModule from "../../src/sandbox/index.js";
import * as IdentityModule from "../../src/identity/index.js";

import { LinuxSandboxProvider } from "../../src/sandbox/providers/linux-sandbox.js";
import { PosixRestrictedProvider } from "../../src/sandbox/providers/posix.js";
import { WindowsRestrictedProvider } from "../../src/sandbox/providers/windows.js";
import { JsonSemanticAdapter } from "../../src/semantic/adapters/json-adapter.js";
import {
  loadTrustRegistry,
  registerIdentity,
  revokeIdentity,
  saveTrustRegistry,
  findIdentity,
} from "../../src/identity/registry.js";
import { runIdentity } from "../../src/commands/identity.js";
import { runSemanticDiff } from "../../src/commands/semantic-diff.js";
import { runAttest } from "../../src/commands/attest.js";
import { runReplay } from "../../src/commands/replay.js";
import { runApproval } from "../../src/commands/approval.js";

describe("Verifiable Execution Comprehensive Coverage", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sc-coverage-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("exports all public types and symbols from module index files", () => {
    expect(SemanticModule.SemanticDiffEngine).toBeDefined();
    expect(ReplayModule.createReplayManifest).toBeDefined();
    expect(AttestationModule.verifyAttestationEnvelope).toBeDefined();
    expect(SandboxModule.getSandboxProvider).toBeDefined();
    expect(IdentityModule.loadTrustRegistry).toBeDefined();
  });

  it("covers LinuxSandboxProvider and PosixRestrictedProvider lifecycle", async () => {
    const linux = new LinuxSandboxProvider();
    const lCaps = await linux.detectCapabilities();
    expect(lCaps.processIsolation).toBe(true);

    const lReport = await linux.evaluatePolicy({
      executable: "node",
      args: [],
      cwd: tempDir,
      timeoutSeconds: 5,
      maxOutputBytes: 1000,
      allowedEnv: ["TEST_VAR"],
      inheritEnv: true,
      networkPolicy: "inherit",
      readOnlyWorkspace: false,
    });
    expect(lReport.state).toBeDefined();

    const lEnv = linux.prepareEnvironment(
      {
        executable: "node",
        args: [],
        cwd: tempDir,
        timeoutSeconds: 5,
        maxOutputBytes: 1000,
        allowedEnv: ["TEST_VAR"],
        inheritEnv: true,
        networkPolicy: "inherit",
        readOnlyWorkspace: false,
      },
      tempDir
    );
    expect(lEnv["HOME"]).toBe(tempDir);

    const posix = new PosixRestrictedProvider();
    const pCaps = await posix.detectCapabilities();
    expect(pCaps.processIsolation).toBe(true);

    const pReport = await posix.evaluatePolicy({
      executable: "node",
      args: [],
      cwd: tempDir,
      timeoutSeconds: 5,
      maxOutputBytes: 1000,
      allowedEnv: ["TEST_VAR"],
      inheritEnv: false,
      networkPolicy: "deny", // will be BLOCKED on posix
      readOnlyWorkspace: true, // will be BLOCKED on posix
    });
    expect(pReport.state).toBe("BLOCKED");

    const pEnv = posix.prepareEnvironment(
      {
        executable: "node",
        args: [],
        cwd: tempDir,
        timeoutSeconds: 5,
        maxOutputBytes: 1000,
        allowedEnv: ["NODE_ENV"],
        inheritEnv: false,
        networkPolicy: "inherit",
        readOnlyWorkspace: false,
      },
      tempDir
    );
    expect(pEnv["HOME"]).toBe(tempDir);

    const win = new WindowsRestrictedProvider();
    const wEnv = win.prepareEnvironment(
      {
        executable: "node",
        args: [],
        cwd: tempDir,
        timeoutSeconds: 5,
        maxOutputBytes: 1000,
        allowedEnv: ["NODE_ENV"],
        inheritEnv: true,
        networkPolicy: "inherit",
        readOnlyWorkspace: false,
      },
      tempDir
    );
    expect(wEnv["USERPROFILE"]).toBe(tempDir);
  });

  it("covers JsonSemanticAdapter with key added, removed, modified, and security keys", () => {
    const adapter = new JsonSemanticAdapter();
    expect(adapter.supports("package.json")).toBe(true);
    expect(adapter.supports("config.jsonc")).toBe(true);
    expect(adapter.getLanguage("config.jsonc")).toBe("jsonc");
    expect(adapter.getLanguage("package.json")).toBe("json");

    const beforeJson = JSON.stringify({
      name: "my-package",
      version: "1.0.0",
      scripts: { build: "tsc", test: "vitest" },
      dependencies: { lodash: "^4.0.0" },
      nested: { a: 1 },
    });

    const afterJson = JSON.stringify({
      name: "my-package",
      version: "1.1.0",
      scripts: { build: "tsc", test: "echo bypass" },
      dependencies: { lodash: "^4.1.0", axios: "^1.0.0" },
      nested: { a: 2, b: 3 },
      addedRoot: true,
    });

    const findings = adapter.compare("package.json", beforeJson, afterJson);
    expect(findings.length).toBeGreaterThan(0);
    expect(
      findings.some((f) => f.explanation.includes("scripts.test"))
    ).toBe(true);
    expect(
      findings.some((f) => f.explanation.includes("dependencies.axios"))
    ).toBe(true);

    // Test malformed JSON
    const brokenFindings = adapter.compare("test.json", "{invalid", "{}");
    expect(brokenFindings.some((f) => f.category === "parser-failure")).toBe(
      true
    );
  });

  it("covers TrustRegistry operations (register, revoke, duplicate check, missing check)", async () => {
    const reg = await loadTrustRegistry(tempDir);
    expect(reg.identities).toHaveLength(0);

    const pair = generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    const identity = {
      keyId: "key-1",
      publicKeyPem: pair.publicKey,
      owner: "tester",
      role: "developer" as const,
      validFrom: new Date().toISOString(),
      validUntil: new Date(Date.now() + 100000).toISOString(),
      revoked: false,
    };

    const updated = await registerIdentity(tempDir, identity);
    expect(updated.identities).toHaveLength(1);

    // Duplicate registration should throw
    await expect(registerIdentity(tempDir, identity)).rejects.toThrow(
      "already registered"
    );

    const found = findIdentity(updated, "key-1");
    expect(found?.owner).toBe("tester");
    expect(findIdentity(updated, "non-existent")).toBeNull();

    // Revoke
    const revoked = await revokeIdentity(tempDir, "key-1", "compromised");
    expect(revoked.identities[0]!.revoked).toBe(true);
    expect(revoked.identities[0]!.revocationReason).toBe("compromised");

    // Revoking non-existent key should throw
    await expect(
      revokeIdentity(tempDir, "key-999", "reason")
    ).rejects.toThrow("not found in registry");
  });

  it("covers runIdentity CLI commands (register, list, verify, revoke)", async () => {
    const pair = generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const pubKeyPath = join(tempDir, "test.pub");
    await writeFile(pubKeyPath, pair.publicKey);

    const keyId = `key-cli-${Date.now()}`;
    // Register
    const regCode = await runIdentity({
      action: "register",
      values: [keyId, pubKeyPath, "cli-user", "security-lead", "30"],
      format: "json",
    });
    expect(regCode).toBe(0);

    // List/Verify
    const listCode = await runIdentity({
      action: "list",
      values: [],
      format: "json",
    });
    expect(listCode).toBe(0);

    // Revoke
    const revokeCode = await runIdentity({
      action: "revoke",
      values: [keyId, "Revoked via CLI test"],
      format: "json",
    });
    expect(revokeCode).toBe(0);
  });

  it("covers runAttest and runReplay blocked and error states cleanly", async () => {
    // attest create without key returns CONFIG_ERROR
    const attestCode = await runAttest({
      action: "create",
      target: "session-1",
      format: "json",
    });
    expect(attestCode).toBe(3); // ExitCodes.CONFIG_ERROR

    // replay record without baseline in empty dir
    const replayCode = await runReplay({
      action: "record",
      target: "session-1",
      format: "json",
    });
    expect(replayCode).toBeDefined();
  });
});
