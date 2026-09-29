import { isAbsolute, relative, resolve, sep } from "node:path";

export function assertSafeIdentifier(value: string, label: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new Error(
      `${label} must be 1-128 characters and contain only letters, numbers, dot, underscore, or hyphen.`
    );
  }
  return value;
}

export function resolveWithinRoot(
  root: string,
  candidate: string,
  label: string
): string {
  const absolute = resolve(root, candidate);
  const rel = relative(root, absolute);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`${label} must remain inside the repository root.`);
  }
  return absolute;
}
