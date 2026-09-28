import { describe, expect, it } from "vitest";
import {
  redactSecrets,
  StreamingSecretRedactor,
} from "../../src/security/secret-redactor.js";
import { executeCheck } from "../../src/runner/executor.js";

describe("secret output blocker", () => {
  it("redacts supported credential classes without returning their values", () => {
    const github = `ghp_${"A".repeat(40)}`;
    const npm = `npm_${"b".repeat(40)}`;
    const result = redactSecrets(
      [
        `token=${github}`,
        `registry=${npm}`,
        "Authorization: Bearer example.example.example",
        "postgres://admin:supersecret@db.example/internal",
      ].join("\n")
    );

    expect(result.text).not.toContain(github);
    expect(result.text).not.toContain(npm);
    expect(result.text).not.toContain("supersecret");
    expect(result.detectedTypes).toEqual(
      expect.arrayContaining([
        "github-token",
        "npm-token",
        "authorization-header",
        "connection-string",
      ])
    );
  });

  it("redacts a private key block split across stream chunks", () => {
    const redactor = new StreamingSecretRedactor(512);
    const outputs = [
      redactor.push(
        Buffer.from(
          `prefix\n-----BEGIN PRIVATE KEY-----\n${"A".repeat(700)}`,
          "utf8"
        )
      ),
      redactor.push(
        Buffer.from(
          `${"B".repeat(700)}\n-----END PRIVATE KEY-----\nsuffix\n`,
          "utf8"
        )
      ),
      redactor.flush(),
    ].join("");

    expect(outputs).not.toContain("BEGIN PRIVATE KEY");
    expect(outputs).not.toContain("A".repeat(100));
    expect(outputs).not.toContain("B".repeat(100));
    expect(outputs).toContain("[REDACTED:private-key]");
    expect(redactor.detectedTypes).toContain("private-key");
  });

  it("forces a successful check to fail when secret output is detected", async () => {
    const token = `ghp_${"Z".repeat(40)}`;
    const result = await executeCheck(
      {
        name: "secret-emitter",
        executable: process.execPath,
        args: ["-e", `process.stdout.write(${JSON.stringify(token)})`],
        timeout: 5,
      },
      { cwd: process.cwd() }
    );

    expect(result.exitCode).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.outputBlocked).toBe(true);
    expect(result.detectedSecretTypes).toContain("github-token");
    expect(result.stdout).not.toContain(token);
    expect(result.stdout).toContain("[REDACTED:github-token]");
  });

  it("preserves ordinary output and successful verification", async () => {
    const result = await executeCheck(
      {
        name: "ordinary-output",
        executable: process.execPath,
        args: ["-e", "console.log('verification complete')"],
        timeout: 5,
      },
      { cwd: process.cwd() }
    );

    expect(result.passed).toBe(true);
    expect(result.outputBlocked).toBe(false);
    expect(result.stdout).toContain("verification complete");
  });
});