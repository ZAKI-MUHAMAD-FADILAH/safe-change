/**
 * Deterministic JSON Canonicalization Scheme (RFC 8785 / JCS compatible)
 * Ensures deterministic string representation for cryptographic hashing and signing.
 */
export function canonicalizeJson(val: unknown): string {
  if (val === null || typeof val !== "object") {
    return JSON.stringify(val);
  }

  if (Array.isArray(val)) {
    const items = val.map((item) => canonicalizeJson(item));
    return `[${items.join(",")}]`;
  }

  const obj = val as Record<string, unknown>;
  const sortedKeys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();

  const pairs = sortedKeys.map((k) => {
    return `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`;
  });

  return `{${pairs.join(",")}}`;
}
