import ts from "typescript";
import { createHash } from "node:crypto";
import type {
  SemanticConfidence,
  SemanticFinding,
  SemanticLanguage,
  SemanticSeverity,
  SourceRange,
} from "../types.js";
import type { LanguageSemanticAdapter } from "./adapter.js";

function getSourceRange(node: ts.Node, sourceFile: ts.SourceFile): SourceRange {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    startLine: start.line + 1,
    startColumn: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
  };
}

function computeFindingId(
  file: string,
  category: string,
  beforeRep: string,
  afterRep: string,
  line: number
): string {
  return createHash("sha256")
    .update(`${file}:${category}:${line}:${beforeRep}->${afterRep}`)
    .digest("hex")
    .slice(0, 16);
}

function cleanText(node: ts.Node, sourceFile: ts.SourceFile): string {
  return node.getText(sourceFile).trim().replace(/\s+/g, " ");
}

function collectMemberVisibility(
  sourceFile: ts.SourceFile
): Map<string, "public" | "protected" | "private"> {
  const result = new Map<string, "public" | "protected" | "private">();
  function visit(node: ts.Node): void {
    if (ts.isClassDeclaration(node) && node.name) {
      for (const member of node.members) {
        if (!member.name) continue;
        const memberName = cleanText(member.name, sourceFile);
        const modifiers = ts.canHaveModifiers(member)
          ? ts.getModifiers(member)
          : undefined;
        const visibility = modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword
        )
          ? "private"
          : modifiers?.some(
                (modifier) => modifier.kind === ts.SyntaxKind.ProtectedKeyword
              )
            ? "protected"
            : "public";
        result.set(`${node.name.text}.${memberName}`, visibility);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return result;
}

export class TypeScriptSemanticAdapter implements LanguageSemanticAdapter {
  supports(filePath: string): boolean {
    const ext = filePath.toLowerCase();
    return (
      ext.endsWith(".ts") ||
      ext.endsWith(".tsx") ||
      ext.endsWith(".js") ||
      ext.endsWith(".jsx") ||
      ext.endsWith(".mjs") ||
      ext.endsWith(".cjs")
    );
  }

  getLanguage(filePath: string): SemanticLanguage {
    const ext = filePath.toLowerCase();
    if (ext.endsWith(".tsx")) return "tsx";
    if (ext.endsWith(".jsx")) return "jsx";
    if (ext.endsWith(".js") || ext.endsWith(".mjs") || ext.endsWith(".cjs"))
      return "javascript";
    return "typescript";
  }

  compare(
    filePath: string,
    beforeContent: string,
    afterContent: string
  ): readonly SemanticFinding[] {
    const lang = this.getLanguage(filePath);
    const scriptKind =
      lang === "tsx"
        ? ts.ScriptKind.TSX
        : lang === "jsx"
          ? ts.ScriptKind.JSX
          : lang === "javascript"
            ? ts.ScriptKind.JS
            : ts.ScriptKind.TS;

    let sourceBefore: ts.SourceFile;
    let sourceAfter: ts.SourceFile;

    try {
      sourceBefore = ts.createSourceFile(
        filePath,
        beforeContent,
        ts.ScriptTarget.Latest,
        true,
        scriptKind
      );
      sourceAfter = ts.createSourceFile(
        filePath,
        afterContent,
        ts.ScriptTarget.Latest,
        true,
        scriptKind
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return [
        {
          findingId: computeFindingId(filePath, "parser-failure", "", msg, 1),
          file: filePath,
          language: lang,
          nodeType: "SourceFile",
          rangeBefore: null,
          rangeAfter: null,
          category: "parser-failure",
          severity: "high",
          beforeRepresentation: "",
          afterRepresentation: msg,
          confidence: "high",
          explanation: `Parser threw an unrecoverable exception: ${msg}`,
        },
      ];
    }
    const diagnostics = [
      ...(sourceBefore as ts.SourceFile & {
        parseDiagnostics?: readonly ts.Diagnostic[];
      }).parseDiagnostics ?? [],
      ...(sourceAfter as ts.SourceFile & {
        parseDiagnostics?: readonly ts.Diagnostic[];
      }).parseDiagnostics ?? [],
    ];
    if (diagnostics.length > 0) {
      const message = ts.flattenDiagnosticMessageText(
        diagnostics[0]!.messageText,
        "\n"
      );
      return [
        {
          findingId: computeFindingId(
            filePath,
            "parser-failure",
            "",
            message,
            1
          ),
          file: filePath,
          language: lang,
          nodeType: "SourceFile",
          rangeBefore: null,
          rangeAfter: null,
          category: "parser-failure",
          severity: "high",
          beforeRepresentation: "",
          afterRepresentation: message,
          confidence: "high",
          explanation: `Parser diagnostics reported invalid syntax: ${message}`,
        },
      ];
    }

    const findings: SemanticFinding[] = [];

    // Helper to add finding
    const addFinding = (
      nodeType: string,
      rangeBefore: SourceRange | null,
      rangeAfter: SourceRange | null,
      category: SemanticFinding["category"],
      severity: SemanticSeverity,
      beforeRep: string,
      afterRep: string,
      confidence: SemanticConfidence,
      explanation: string
    ): void => {
      const line = rangeAfter?.startLine ?? rangeBefore?.startLine ?? 1;
      const findingId = computeFindingId(
        filePath,
        category,
        beforeRep,
        afterRep,
        line
      );
      findings.push({
        findingId,
        file: filePath,
        language: lang,
        nodeType,
        rangeBefore,
        rangeAfter,
        category,
        severity,
        beforeRepresentation: beforeRep,
        afterRepresentation: afterRep,
        confidence,
        explanation,
      });
    };

    // Collect AST items from both files
    const ifsBefore: ts.IfStatement[] = [];
    const ifsAfter: ts.IfStatement[] = [];
    const callsBefore: ts.CallExpression[] = [];
    const callsAfter: ts.CallExpression[] = [];
    const catchesBefore: ts.CatchClause[] = [];
    const catchesAfter: ts.CatchClause[] = [];
    const returnsBefore: ts.ReturnStatement[] = [];
    const returnsAfter: ts.ReturnStatement[] = [];
    const throwsBefore: ts.ThrowStatement[] = [];
    const throwsAfter: ts.ThrowStatement[] = [];
    const importsBefore: ts.ImportDeclaration[] = [];
    const importsAfter: ts.ImportDeclaration[] = [];
    const exportsBefore = new Map<string, ts.Declaration>();
    const exportsAfter = new Map<string, ts.Declaration>();

    function walk(node: ts.Node, isBefore: boolean): void {
      if (ts.isIfStatement(node)) {
        (isBefore ? ifsBefore : ifsAfter).push(node);
      } else if (ts.isCallExpression(node)) {
        (isBefore ? callsBefore : callsAfter).push(node);
      } else if (ts.isCatchClause(node)) {
        (isBefore ? catchesBefore : catchesAfter).push(node);
      } else if (ts.isReturnStatement(node)) {
        (isBefore ? returnsBefore : returnsAfter).push(node);
      } else if (ts.isThrowStatement(node)) {
        (isBefore ? throwsBefore : throwsAfter).push(node);
      } else if (ts.isImportDeclaration(node)) {
        (isBefore ? importsBefore : importsAfter).push(node);
      }

      // Check export declarations
      if (
        (ts.isFunctionDeclaration(node) ||
          ts.isClassDeclaration(node) ||
          ts.isInterfaceDeclaration(node) ||
          ts.isTypeAliasDeclaration(node)) &&
        node.name
      ) {
        const isExported =
          ts.canHaveModifiers(node) &&
          ts
            .getModifiers(node)
            ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
        if (isExported) {
          const map = isBefore ? exportsBefore : exportsAfter;
          map.set(node.name.text, node);
        }
      }

      ts.forEachChild(node, (child) => walk(child, isBefore));
    }

    walk(sourceBefore, true);
    walk(sourceAfter, false);

    // 1. Detect Test Skips / Todos added in callsAfter
    const skippedBefore = new Set(
      callsBefore
        .map((call) => cleanText(call.expression, sourceBefore))
        .filter((text) =>
          /^(it|test|describe)\.(skip|todo)(?:\.|$)/.test(text)
        )
    );
    for (const call of callsAfter) {
      const text = cleanText(call.expression, sourceAfter);
      if (
        (text.startsWith("it.skip") ||
          text.startsWith("test.skip") ||
          text.startsWith("describe.skip") ||
          text.startsWith("it.todo") ||
          text.startsWith("test.todo")) &&
        !skippedBefore.has(text)
      ) {
        const range = getSourceRange(call, sourceAfter);
        addFinding(
          "CallExpression",
          null,
          range,
          "test-skip-added",
          "critical",
          "",
          text,
          "high",
          `Test skip or todo added: ${text}`
        );
      }
    }

    // 2. Detect Test Assertions removed / weakened
    const expectsBefore = callsBefore.filter((c) =>
      cleanText(c.expression, sourceBefore).startsWith("expect")
    );
    const expectsAfter = callsAfter.filter((c) =>
      cleanText(c.expression, sourceAfter).startsWith("expect")
    );
    if (expectsBefore.length > expectsAfter.length) {
      addFinding(
        "CallExpression",
        getSourceRange(sourceBefore, sourceBefore),
        getSourceRange(sourceAfter, sourceAfter),
        "assertion-weakening",
        "critical",
        `expect count: ${expectsBefore.length}`,
        `expect count: ${expectsAfter.length}`,
        "high",
        `Test assertion removed: went from ${expectsBefore.length} to ${expectsAfter.length} assertions`
      );
    }

    // 3. Inspect If Statements: condition inversion, guard inversion, logical operator changes
    const minIfs = Math.min(ifsBefore.length, ifsAfter.length);
    for (let i = 0; i < minIfs; i++) {
      const beforeIf = ifsBefore[i];
      const afterIf = ifsAfter[i];
      if (!beforeIf || !afterIf) continue;
      const beforeCondText = cleanText(beforeIf.expression, sourceBefore);
      const afterCondText = cleanText(afterIf.expression, sourceAfter);

      if (beforeCondText !== afterCondText) {
        const rangeB = getSourceRange(beforeIf.expression, sourceBefore);
        const rangeA = getSourceRange(afterIf.expression, sourceAfter);

        // Guard / Negation inversion check: e.g. !authorized vs authorized
        const isNegationInversion =
          (beforeCondText.startsWith("!") &&
            beforeCondText.slice(1).trim() === afterCondText) ||
          (afterCondText.startsWith("!") &&
            afterCondText.slice(1).trim() === beforeCondText);

        const isSecurityRelated =
          /auth|allow|permit|valid|admin|root|deny|access|secret/i.test(
            beforeCondText + afterCondText
          );

        if (isNegationInversion) {
          addFinding(
            "PrefixUnaryExpression",
            rangeB,
            rangeA,
            isSecurityRelated ? "guard-inversion" : "negation-inversion",
            isSecurityRelated ? "critical" : "high",
            beforeCondText,
            afterCondText,
            "high",
            isSecurityRelated
              ? `Critical security authorization guard inverted from '${beforeCondText}' to '${afterCondText}'`
              : `Unary negation inverted in condition from '${beforeCondText}' to '${afterCondText}'`
          );
        } else if (
          (beforeCondText.includes("===") && afterCondText.includes("!==")) ||
          (beforeCondText.includes("!==") && afterCondText.includes("===")) ||
          (beforeCondText.includes("==") && afterCondText.includes("!=")) ||
          (beforeCondText.includes("<") && afterCondText.includes(">")) ||
          (beforeCondText.includes("<=") && afterCondText.includes(">="))
        ) {
          addFinding(
            "BinaryExpression",
            rangeB,
            rangeA,
            "comparison-change",
            "high",
            beforeCondText,
            afterCondText,
            "high",
            `Comparison operator changed in condition from '${beforeCondText}' to '${afterCondText}'`
          );
        } else if (
          (beforeCondText.includes("&&") && afterCondText.includes("||")) ||
          (beforeCondText.includes("||") && afterCondText.includes("&&"))
        ) {
          addFinding(
            "BinaryExpression",
            rangeB,
            rangeA,
            "logical-operator-change",
            "high",
            beforeCondText,
            afterCondText,
            "high",
            `Logical operator changed in condition from '${beforeCondText}' to '${afterCondText}'`
          );
        } else if (
          ts.isBinaryExpression(afterIf.expression) &&
          afterIf.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
        ) {
          addFinding(
            "BinaryExpression",
            rangeB,
            rangeA,
            "assignment-in-condition",
            "critical",
            beforeCondText,
            afterCondText,
            "high",
            `Assignment operator '=' used inside conditional expression instead of comparison`
          );
        } else {
          addFinding(
            "IfStatement",
            rangeB,
            rangeA,
            "branch-condition-change",
            "medium",
            beforeCondText,
            afterCondText,
            "medium",
            `Branch condition modified from '${beforeCondText}' to '${afterCondText}'`
          );
        }
      }
    }

    if (ifsBefore.length !== ifsAfter.length) {
      addFinding(
        "IfStatement",
        getSourceRange(sourceBefore, sourceBefore),
        getSourceRange(sourceAfter, sourceAfter),
        "branch-condition-change",
        "medium",
        `if statements count: ${ifsBefore.length}`,
        `if statements count: ${ifsAfter.length}`,
        "high",
        `Control-flow branch count changed from ${ifsBefore.length} to ${ifsAfter.length}`
      );
    }
    if (ifsBefore.length > ifsAfter.length) {
      const removedSecurityGuards = ifsBefore.filter((statement) =>
        /auth|allow|permit|valid|admin|root|deny|access|secret/i.test(
          cleanText(statement.expression, sourceBefore)
        )
      );
      if (removedSecurityGuards.length > 0) {
        const removed = removedSecurityGuards[0]!;
        addFinding(
          "IfStatement",
          getSourceRange(removed, sourceBefore),
          null,
          "guard-inversion",
          "critical",
          cleanText(removed.expression, sourceBefore),
          "",
          "medium",
          "A security-related guard may have been removed."
        );
      }
    }

    // 4. Inspect Catch Clauses: detecting swallowed errors
    const catchBodiesBefore = new Set(
      catchesBefore.map((clause) => cleanText(clause.block, sourceBefore))
    );
    for (const catchAfter of catchesAfter) {
      const blockText = cleanText(catchAfter.block, sourceAfter);
      if (
        (blockText === "{}" ||
          blockText === "{ ; }" ||
          (!blockText.includes("throw") &&
            !blockText.includes("reject") &&
            !blockText.includes("console.error") &&
            !blockText.includes("process.exit"))) &&
        !catchBodiesBefore.has(blockText)
      ) {
        const range = getSourceRange(catchAfter, sourceAfter);
        addFinding(
          "CatchClause",
          null,
          range,
          "error-swallowed",
          "high",
          "",
          blockText,
          "high",
          `Catch block potentially swallows errors without rethrowing or logging error: ${blockText}`
        );
      }
    }

    // 4b. Detect newly introduced dynamic execution primitives.
    const dynamicCallsBefore = new Set(
      callsBefore.map((call) => cleanText(call, sourceBefore))
    );
    for (const call of callsAfter) {
      const expression = cleanText(call.expression, sourceAfter);
      const callText = cleanText(call, sourceAfter);
      const dynamicRequire =
        expression === "require" &&
        call.arguments.length > 0 &&
        !ts.isStringLiteralLike(call.arguments[0]!);
      const dangerous =
        expression === "eval" ||
        expression === "Function" ||
        expression.endsWith(".exec") ||
        dynamicRequire;
      if (dangerous && !dynamicCallsBefore.has(callText)) {
        addFinding(
          "CallExpression",
          null,
          getSourceRange(call, sourceAfter),
          "dynamic-execution-added",
          "high",
          "",
          callText,
          "high",
          `Dynamic execution primitive introduced: ${expression}`
        );
      }
    }

    // 4c. Detect visibility widening on named class members.
    const visibilityBefore = collectMemberVisibility(sourceBefore);
    const visibilityAfter = collectMemberVisibility(sourceAfter);
    for (const [member, beforeVisibility] of visibilityBefore) {
      const afterVisibility = visibilityAfter.get(member);
      if (
        afterVisibility === "public" &&
        (beforeVisibility === "private" || beforeVisibility === "protected")
      ) {
        addFinding(
          "ClassElement",
          null,
          null,
          "visibility-change",
          "medium",
          `${member}:${beforeVisibility}`,
          `${member}:${afterVisibility}`,
          "high",
          `Class member '${member}' visibility widened from ${beforeVisibility} to public.`
        );
      }
    }

    // 5. Throws vs Returns: Error converted to return
    if (throwsBefore.length > throwsAfter.length && returnsAfter.length > returnsBefore.length) {
      addFinding(
        "ThrowStatement",
        getSourceRange(sourceBefore, sourceBefore),
        getSourceRange(sourceAfter, sourceAfter),
        "return-throw-change",
        "high",
        `throws: ${throwsBefore.length}, returns: ${returnsBefore.length}`,
        `throws: ${throwsAfter.length}, returns: ${returnsAfter.length}`,
        "medium",
        `Possible thrown error converted to return value (throws decreased while returns increased)`
      );
    }

    // 6. Inspect Import Declarations: import source changes
    const importMapBefore = new Map<string, string>();
    for (const imp of importsBefore) {
      if (imp.importClause) {
        const clause = cleanText(imp.importClause, sourceBefore);
        const mod = cleanText(imp.moduleSpecifier, sourceBefore);
        importMapBefore.set(clause, mod);
      }
    }
    for (const imp of importsAfter) {
      if (imp.importClause) {
        const clause = cleanText(imp.importClause, sourceAfter);
        const modAfter = cleanText(imp.moduleSpecifier, sourceAfter);
        const modBefore = importMapBefore.get(clause);
        if (modBefore && modBefore !== modAfter) {
          const range = getSourceRange(imp, sourceAfter);
          addFinding(
            "ImportDeclaration",
            null,
            range,
            "import-source-change",
            "medium",
            `${clause} from ${modBefore}`,
            `${clause} from ${modAfter}`,
            "high",
            `Import source changed for '${clause}' from ${modBefore} to ${modAfter}`
          );
        }
      }
    }

    // 7. Inspect Exported API changes
    for (const [name, declBefore] of exportsBefore) {
      const declAfter = exportsAfter.get(name);
      if (!declAfter) {
        const range = getSourceRange(declBefore, sourceBefore);
        addFinding(
          "ExportDeclaration",
          range,
          null,
          "exported-api-change",
          "high",
          `export ${name}`,
          "",
          "high",
          `Exported symbol '${name}' removed from public API`
        );
      }
    }

    // 8. General AST Node Walk for Optional Chaining and Nullish Coalescing
    let optionalChainsBefore = 0;
    let optionalChainsAfter = 0;
    let nullishBefore = 0;
    let nullishAfter = 0;

    function countSyntax(node: ts.Node, isBefore: boolean): void {
      if (node.flags & ts.NodeFlags.Synthesized) return;
      if (ts.isPropertyAccessChain(node) || ts.isElementAccessChain(node) || ts.isCallChain(node)) {
        if (isBefore) optionalChainsBefore++;
        else optionalChainsAfter++;
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
      ) {
        if (isBefore) nullishBefore++;
        else nullishAfter++;
      }
      ts.forEachChild(node, (child) => countSyntax(child, isBefore));
    }
    countSyntax(sourceBefore, true);
    countSyntax(sourceAfter, false);

    if (optionalChainsBefore !== optionalChainsAfter) {
      addFinding(
        "PropertyAccessChain",
        null,
        null,
        "optional-chaining-change",
        "medium",
        `optional chains: ${optionalChainsBefore}`,
        `optional chains: ${optionalChainsAfter}`,
        "medium",
        `Optional chaining count changed from ${optionalChainsBefore} to ${optionalChainsAfter}`
      );
    }

    if (nullishBefore !== nullishAfter) {
      addFinding(
        "BinaryExpression",
        null,
        null,
        "nullish-coalescing-change",
        "medium",
        `nullish coalescing: ${nullishBefore}`,
        `nullish coalescing: ${nullishAfter}`,
        "medium",
        `Nullish coalescing operator '??' count changed from ${nullishBefore} to ${nullishAfter}`
      );
    }

    return findings;
  }
}
