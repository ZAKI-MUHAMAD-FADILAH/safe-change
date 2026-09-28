import type { SecretFinding, SecretType } from "../types/index.js";

interface PatternDefinition {
  readonly type: SecretType;
  readonly pattern: RegExp;
}

const PATTERNS: readonly PatternDefinition[] = [
  {
    type: "github-token",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{20,255}\b/g,
  },
  {
    type: "npm-token",
    pattern: /\bnpm_[A-Za-z0-9]{20,255}\b/g,
  },
  {
    type: "aws-access-key",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  },
  {
    type: "authorization-header",
    pattern: /\bAuthorization\s*:\s*(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]{8,512}={0,2}/gi,
  },
  {
    type: "connection-string",
    pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^@\s]{3,512}@[^\s]{1,512}/gi,
  },
  {
    type: "generic-secret",
    pattern: /\b(?:api[_-]?key|client[_-]?secret|password|access[_-]?token)\s*[=:]\s*["']?[A-Za-z0-9._~+/-]{12,512}["']?/gi,
  },
];

const PRIVATE_KEY_BEGIN = "-----BEGIN PRIVATE KEY-----";
const RSA_PRIVATE_KEY_BEGIN = "-----BEGIN RSA PRIVATE KEY-----";
const EC_PRIVATE_KEY_BEGIN = "-----BEGIN EC PRIVATE KEY-----";
const OPENSSH_PRIVATE_KEY_BEGIN = "-----BEGIN OPENSSH PRIVATE KEY-----";
const PRIVATE_KEY_END = "-----END";

export interface RedactionResult {
  readonly text: string;
  readonly findings: readonly SecretFinding[];
  readonly detectedTypes: readonly SecretType[];
}

export function redactSecrets(input: string): RedactionResult {
  let text = input;
  const findings: SecretFinding[] = [];
  for (const definition of PATTERNS) {
    definition.pattern.lastIndex = 0;
    text = text.replace(definition.pattern, (match, offset: number) => {
      findings.push({
        type: definition.type,
        start: offset,
        end: offset + match.length,
      });
      return `[REDACTED:${definition.type}]`;
    });
  }

  const privateKeyStarts = [
    PRIVATE_KEY_BEGIN,
    RSA_PRIVATE_KEY_BEGIN,
    EC_PRIVATE_KEY_BEGIN,
    OPENSSH_PRIVATE_KEY_BEGIN,
  ];
  for (const marker of privateKeyStarts) {
    let start = text.indexOf(marker);
    while (start !== -1) {
      const endMarkerStart = text.indexOf(PRIVATE_KEY_END, start + marker.length);
      const lineEnd =
        endMarkerStart === -1 ? text.length : text.indexOf("\n", endMarkerStart);
      const end = lineEnd === -1 ? text.length : lineEnd;
      findings.push({ type: "private-key", start, end });
      text = `${text.slice(0, start)}[REDACTED:private-key]${text.slice(end)}`;
      start = text.indexOf(marker, start + 22);
    }
  }

  return {
    text,
    findings,
    detectedTypes: [...new Set(findings.map((finding) => finding.type))],
  };
}

export class StreamingSecretRedactor {
  private pending = "";
  private readonly detected = new Set<SecretType>();
  private readonly holdbackCharacters: number;
  private privateKeyMode = false;

  constructor(holdbackCharacters = 1024) {
    this.holdbackCharacters = Math.max(512, holdbackCharacters);
  }

  public push(chunk: Buffer): string {
    this.pending += chunk.toString("utf8");
    if (this.pending.length <= this.holdbackCharacters) return "";
    const splitAt = this.pending.length - this.holdbackCharacters;
    const emit = this.pending.slice(0, splitAt);
    this.pending = this.pending.slice(splitAt);
    return this.redact(emit);
  }

  public flush(): string {
    const output = this.redact(this.pending);
    this.pending = "";
    return output;
  }

  public get detectedTypes(): readonly SecretType[] {
    return [...this.detected].sort();
  }

  private redact(value: string): string {
    if (this.privateKeyMode) {
      this.detected.add("private-key");
      const end = value.indexOf(PRIVATE_KEY_END);
      if (end === -1) return "[REDACTED:private-key]";
      const lineEnd = value.indexOf("\n", end);
      this.privateKeyMode = false;
      return `[REDACTED:private-key]${value.slice(
        lineEnd === -1 ? value.length : lineEnd
      )}`;
    }
    const beginsPrivateKey = [
      PRIVATE_KEY_BEGIN,
      RSA_PRIVATE_KEY_BEGIN,
      EC_PRIVATE_KEY_BEGIN,
      OPENSSH_PRIVATE_KEY_BEGIN,
    ].some((marker) => value.includes(marker));
    if (beginsPrivateKey && !value.includes(PRIVATE_KEY_END)) {
      this.privateKeyMode = true;
      this.detected.add("private-key");
      return "[REDACTED:private-key]";
    }
    const result = redactSecrets(value);
    for (const type of result.detectedTypes) this.detected.add(type);
    return result.text;
  }
}