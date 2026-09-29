/**
 * Deterministic JSON Canonicalization Scheme (RFC 8785 / JCS compatible)
 * Ensures deterministic string representation for cryptographic hashing and signing.
 */
export function canonicalizeJson(val: unknown): string {
  if (val === null) return "null";
  if (typeof val === "number") {
    if (!Number.isFinite(val)) {
      throw new TypeError("JCS does not permit NaN or Infinity.");
    }
    return JSON.stringify(val);
  }
  if (typeof val === "string") {
    for (let index = 0; index < val.length; index++) {
      const code = val.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = val.charCodeAt(index + 1);
        if (next < 0xdc00 || next > 0xdfff) {
          throw new TypeError("JCS does not permit unpaired Unicode surrogates.");
        }
        index++;
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        throw new TypeError("JCS does not permit unpaired Unicode surrogates.");
      }
    }
    return JSON.stringify(val);
  }
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val !== "object") {
    throw new TypeError(`JCS cannot canonicalize ${typeof val}.`);
  }

  if (Array.isArray(val)) {
    const items = val.map((item) => canonicalizeJson(item));
    return `[${items.join(",")}]`;
  }

  const obj = val as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();

  const pairs = sortedKeys.map((k) => {
    if (obj[k] === undefined) {
      throw new TypeError("JCS does not permit undefined object values.");
    }
    return `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`;
  });

  return `{${pairs.join(",")}}`;
}
