import type { SemanticFinding, SemanticLanguage } from "../types.js";

export interface LanguageSemanticAdapter {
  supports(filePath: string): boolean;
  getLanguage(filePath: string): SemanticLanguage;
  compare(
    filePath: string,
    beforeContent: string,
    afterContent: string
  ): readonly SemanticFinding[];
}
