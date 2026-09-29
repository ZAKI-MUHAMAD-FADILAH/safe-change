import { createHash } from "node:crypto";
import type {
  SemanticConfidence,
  SemanticFinding,
  SemanticLanguage,
  SemanticSeverity,
} from "../types.js";
import type { LanguageSemanticAdapter } from "./adapter.js";

function computeFindingId(
  file: string,
  category: string,
  beforeRep: string,
  afterRep: string
): string {
  return createHash("sha256")
    .update(`${file}:${category}:${beforeRep}->${afterRep}`)
    .digest("hex")
    .slice(0, 16);
}

export class JsonSemanticAdapter implements LanguageSemanticAdapter {
  supports(filePath: string): boolean {
    const ext = filePath.toLowerCase();
    return ext.endsWith(".json") || ext.endsWith(".jsonc");
  }

  getLanguage(filePath: string): SemanticLanguage {
    const ext = filePath.toLowerCase();
    return ext.endsWith(".jsonc") ? "jsonc" : "json";
  }

  compare(
    filePath: string,
    beforeContent: string,
    afterContent: string
  ): readonly SemanticFinding[] {
    const lang = this.getLanguage(filePath);
    let parsedBefore: unknown;
    let parsedAfter: unknown;

    try {
      // Strip comments for jsonc if needed
      const cleanBefore = beforeContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
      parsedBefore = JSON.parse(cleanBefore);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return [
        {
          findingId: computeFindingId(filePath, "parser-failure", "", msg),
          file: filePath,
          language: lang,
          nodeType: "JSONDocument",
          rangeBefore: null,
          rangeAfter: null,
          category: "parser-failure",
          severity: "high",
          beforeRepresentation: "",
          afterRepresentation: msg,
          confidence: "high",
          explanation: `Failed to parse before JSON content: ${msg}`,
        },
      ];
    }

    try {
      const cleanAfter = afterContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
      parsedAfter = JSON.parse(cleanAfter);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return [
        {
          findingId: computeFindingId(filePath, "parser-failure", "", msg),
          file: filePath,
          language: lang,
          nodeType: "JSONDocument",
          rangeBefore: null,
          rangeAfter: null,
          category: "parser-failure",
          severity: "high",
          beforeRepresentation: "",
          afterRepresentation: msg,
          confidence: "high",
          explanation: `Failed to parse after JSON content: ${msg}`,
        },
      ];
    }

    const findings: SemanticFinding[] = [];

    const addFinding = (
      nodeType: string,
      category: SemanticFinding["category"],
      severity: SemanticSeverity,
      beforeRep: string,
      afterRep: string,
      confidence: SemanticConfidence,
      explanation: string
    ): void => {
      findings.push({
        findingId: computeFindingId(filePath, category, beforeRep, afterRep),
        file: filePath,
        language: lang,
        nodeType,
        rangeBefore: null,
        rangeAfter: null,
        category,
        severity,
        beforeRepresentation: beforeRep,
        afterRepresentation: afterRep,
        confidence,
        explanation,
      });
    };

    // Deep compare objects
    function compareObjects(
      objB: Record<string, unknown>,
      objA: Record<string, unknown>,
      pathPrefix: string
    ): void {
      const allKeys = Array.from(
        new Set([...Object.keys(objB), ...Object.keys(objA)])
      ).sort();

      for (const key of allKeys) {
        const fullPath = pathPrefix ? `${pathPrefix}.${key}` : key;
        const valB = objB[key];
        const valA = objA[key];

        if (valB !== undefined && valA === undefined) {
          const isSecurity =
            /scripts|policy|enforcement|sandbox|checks|auth/i.test(fullPath);
          addFinding(
            "JSONProperty",
            "security-sensitive-literal",
            isSecurity ? "critical" : "medium",
            `${fullPath}: ${JSON.stringify(valB)}`,
            "",
            "high",
            `Key '${fullPath}' removed from JSON document`
          );
        } else if (valB === undefined && valA !== undefined) {
          const isSecurity =
            /scripts|policy|enforcement|sandbox|checks|auth/i.test(fullPath);
          addFinding(
            "JSONProperty",
            "security-sensitive-literal",
            isSecurity ? "critical" : "medium",
            "",
            `${fullPath}: ${JSON.stringify(valA)}`,
            "high",
            `Key '${fullPath}' added to JSON document`
          );
        } else if (
          typeof valB === "object" &&
          valB !== null &&
          typeof valA === "object" &&
          valA !== null &&
          !Array.isArray(valB) &&
          !Array.isArray(valA)
        ) {
          compareObjects(
            valB as Record<string, unknown>,
            valA as Record<string, unknown>,
            fullPath
          );
        } else if (JSON.stringify(valB) !== JSON.stringify(valA)) {
          const isScriptOrPolicy =
            /scripts|policy|enforcement|checks|command/i.test(fullPath);
          const isDependency = /dependencies|devDependencies/i.test(fullPath);
          const severity: SemanticSeverity = isScriptOrPolicy
            ? "critical"
            : isDependency
              ? "high"
              : "medium";

          addFinding(
            "JSONProperty",
            "security-sensitive-literal",
            severity,
            `${fullPath}: ${JSON.stringify(valB)}`,
            `${fullPath}: ${JSON.stringify(valA)}`,
            "high",
            `Value for '${fullPath}' modified in JSON document`
          );
        }
      }
    }

    if (
      typeof parsedBefore === "object" &&
      parsedBefore !== null &&
      typeof parsedAfter === "object" &&
      parsedAfter !== null &&
      !Array.isArray(parsedBefore) &&
      !Array.isArray(parsedAfter)
    ) {
      compareObjects(
        parsedBefore as Record<string, unknown>,
        parsedAfter as Record<string, unknown>,
        ""
      );
    } else if (JSON.stringify(parsedBefore) !== JSON.stringify(parsedAfter)) {
      addFinding(
        "JSONDocument",
        "security-sensitive-literal",
        "medium",
        JSON.stringify(parsedBefore),
        JSON.stringify(parsedAfter),
        "high",
        `JSON root element modified`
      );
    }

    return findings;
  }
}
