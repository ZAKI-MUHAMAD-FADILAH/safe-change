import { describe, it, expect } from "vitest";
import { SemanticDiffEngine } from "../../src/semantic/engine.js";

describe("AST Semantic Diff Engine", () => {
  const engine = new SemanticDiffEngine();

  it("detects unary negation inversion in conditions (CRITICAL on security keywords)", () => {
    const before = `
      function check(authorized: boolean) {
        if (authorized) {
          allow();
        }
      }
    `;
    const after = `
      function check(authorized: boolean) {
        if (!authorized) {
          allow();
        }
      }
    `;

    const diff = engine.compareContents("src/auth.ts", before, after);
    expect(diff).not.toBeNull();
    expect(diff!.findings.length).toBeGreaterThan(0);

    const guardInversion = diff!.findings.find(
      (f) => f.category === "guard-inversion"
    );
    expect(guardInversion).toBeDefined();
    expect(guardInversion!.severity).toBe("critical");
    expect(guardInversion!.beforeRepresentation).toBe("authorized");
    expect(guardInversion!.afterRepresentation).toBe("!authorized");
  });

  it("detects comparison operator changes", () => {
    const before = `if (role === "admin") { proceed(); }`;
    const after = `if (role !== "admin") { proceed(); }`;

    const diff = engine.compareContents("src/roles.ts", before, after);
    expect(diff).not.toBeNull();
    const comparisonChange = diff!.findings.find(
      (f) => f.category === "comparison-change"
    );
    expect(comparisonChange).toBeDefined();
    expect(comparisonChange!.severity).toBe("high");
  });

  it("detects logical operator changes (&& to ||)", () => {
    const before = `if (hasToken && isValid) { proceed(); }`;
    const after = `if (hasToken || isValid) { proceed(); }`;

    const diff = engine.compareContents("src/check.ts", before, after);
    expect(diff).not.toBeNull();
    const opChange = diff!.findings.find(
      (f) => f.category === "logical-operator-change"
    );
    expect(opChange).toBeDefined();
    expect(opChange!.severity).toBe("high");
  });

  it("detects assignment operator '=' in if conditional", () => {
    const before = `if (mode === "dev") { run(); }`;
    const after = `if (mode = "dev") { run(); }`;

    const diff = engine.compareContents("src/mode.ts", before, after);
    expect(diff).not.toBeNull();
    const assignChange = diff!.findings.find(
      (f) => f.category === "assignment-in-condition"
    );
    expect(assignChange).toBeDefined();
    expect(assignChange!.severity).toBe("critical");
  });

  it("detects optional chaining changes", () => {
    const before = `const name = user.profile.name;`;
    const after = `const name = user?.profile?.name;`;

    const diff = engine.compareContents("src/user.ts", before, after);
    expect(diff).not.toBeNull();
    const chainChange = diff!.findings.find(
      (f) => f.category === "optional-chaining-change"
    );
    expect(chainChange).toBeDefined();
  });

  it("detects nullish coalescing changes", () => {
    const before = `const val = input.field;`;
    const after = `const val = input.field ?? "default";`;

    const diff = engine.compareContents("src/val.ts", before, after);
    expect(diff).not.toBeNull();
    const nullishChange = diff!.findings.find(
      (f) => f.category === "nullish-coalescing-change"
    );
    expect(nullishChange).toBeDefined();
  });

  it("detects test skip or todo introduction as critical finding", () => {
    const before = `it("validates token", () => { expect(true).toBe(true); });`;
    const after = `it.skip("validates token", () => { expect(true).toBe(true); });`;

    const diff = engine.compareContents("tests/auth.test.ts", before, after);
    expect(diff).not.toBeNull();
    const skipFinding = diff!.findings.find(
      (f) => f.category === "test-skip-added"
    );
    expect(skipFinding).toBeDefined();
    expect(skipFinding!.severity).toBe("critical");
  });

  it("detects test assertion removal as critical finding", () => {
    const before = `
      it("tests something", () => {
        expect(1).toBe(1);
        expect(2).toBe(2);
      });
    `;
    const after = `
      it("tests something", () => {
        expect(1).toBe(1);
      });
    `;

    const diff = engine.compareContents("tests/unit.test.ts", before, after);
    expect(diff).not.toBeNull();
    const assertionWeakening = diff!.findings.find(
      (f) => f.category === "assertion-weakening"
    );
    expect(assertionWeakening).toBeDefined();
    expect(assertionWeakening!.severity).toBe("critical");
  });

  it("detects swallowed errors in catch clauses", () => {
    const before = `
      try {
        doSomething();
      } catch (err) {
        throw err;
      }
    `;
    const after = `
      try {
        doSomething();
      } catch (err) {
      }
    `;

    const diff = engine.compareContents("src/error.ts", before, after);
    expect(diff).not.toBeNull();
    const swallowed = diff!.findings.find(
      (f) => f.category === "error-swallowed"
    );
    expect(swallowed).toBeDefined();
    expect(swallowed!.severity).toBe("high");
  });

  it("handles parser failure gracefully without throwing and classifies finding", () => {
    const before = `const a = 1;`;
    const invalidAfter = `const a = ;;;; }}}`;

    const diff = engine.compareContents("src/broken.json", before, invalidAfter);
    expect(diff).not.toBeNull();
    expect(diff!.parseError).toBeDefined();
    expect(diff!.findings.some((f) => f.category === "parser-failure")).toBe(true);
  });

  it("produces deterministic finding order across identical inputs", () => {
    const before = `
      if (a) { return 1; }
      if (b) { return 2; }
      if (c) { return 3; }
    `;
    const after = `
      if (!a) { return 1; }
      if (!b) { return 2; }
      if (!c) { return 3; }
    `;

    const report1 = engine.generateReport([
      { filePath: "src/sample.ts", beforeContent: before, afterContent: after },
    ]);
    const report2 = engine.generateReport([
      { filePath: "src/sample.ts", beforeContent: before, afterContent: after },
    ]);

    expect(report1.reportDigest).toBe(report2.reportDigest);
    expect(report1.files[0]!.findings.map((f) => f.findingId)).toEqual(
      report2.files[0]!.findings.map((f) => f.findingId)
    );
  });
});
