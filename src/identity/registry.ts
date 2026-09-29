import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import type { IdentityPublicKey, TrustRegistry } from "./types.js";
import { appendAuditEvent } from "../integrity/audit-log.js";
import { stableDigest } from "../integrity/hash.js";

const DEFAULT_REGISTRY: TrustRegistry = {
  version: 1,
  identities: [],
};

export function getRegistryPath(repoRoot: string): string {
  return resolve(repoRoot, ".safe-change", "identities.json");
}

export async function loadTrustRegistry(
  repoRoot: string
): Promise<TrustRegistry> {
  const filePath = getRegistryPath(repoRoot);
  try {
    const raw = await readFile(filePath, "utf-8");
    const data = JSON.parse(raw) as TrustRegistry;
    if (data.version === 1 && Array.isArray(data.identities)) {
      return data;
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new Error(`Identity trust registry is invalid: ${String(error)}`);
    }
  }
  return DEFAULT_REGISTRY;
}

export async function saveTrustRegistry(
  repoRoot: string,
  registry: TrustRegistry
): Promise<void> {
  const filePath = getRegistryPath(repoRoot);
  await mkdir(resolve(repoRoot, ".safe-change"), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(registry, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, filePath);
}

export async function registerIdentity(
  repoRoot: string,
  identity: IdentityPublicKey
): Promise<TrustRegistry> {
  const current = await loadTrustRegistry(repoRoot);

  // Check if keyId already registered
  const existing = current.identities.find((id) => id.keyId === identity.keyId);
  if (existing) {
    throw new Error(
      `Identity with keyId '${identity.keyId}' is already registered.`
    );
  }

  const updated: TrustRegistry = {
    version: 1,
    identities: [...current.identities, identity],
  };

  await saveTrustRegistry(repoRoot, updated);
  await appendAuditEvent(repoRoot, "IDENTITY_REGISTERED", null, {
    keyId: identity.keyId,
    owner: identity.owner,
    role: identity.role,
    publicKeyDigest: stableDigest(identity.publicKeyPem),
    registryDigest: stableDigest(updated),
  });
  return updated;
}

export async function revokeIdentity(
  repoRoot: string,
  keyId: string,
  reason: string
): Promise<TrustRegistry> {
  const current = await loadTrustRegistry(repoRoot);
  const target = current.identities.find((id) => id.keyId === keyId);
  if (!target) {
    throw new Error(`Identity keyId '${keyId}' not found in registry.`);
  }

  const updatedIdentities = current.identities.map((id) => {
    if (id.keyId === keyId) {
      return {
        ...id,
        revoked: true,
        revokedAt: new Date().toISOString(),
        revocationReason: reason,
      };
    }
    return id;
  });

  const updated: TrustRegistry = {
    version: 1,
    identities: updatedIdentities,
  };

  await saveTrustRegistry(repoRoot, updated);
  await appendAuditEvent(repoRoot, "IDENTITY_REVOKED", null, {
    keyId,
    reason,
    registryDigest: stableDigest(updated),
  });
  return updated;
}

export function findIdentity(
  registry: TrustRegistry,
  keyId: string
): IdentityPublicKey | null {
  return registry.identities.find((id) => id.keyId === keyId) ?? null;
}
