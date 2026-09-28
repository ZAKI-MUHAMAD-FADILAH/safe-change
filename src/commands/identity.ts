import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { OutputFormat } from "../types/index.js";
import { ExitCodes } from "../types/index.js";
import { getRepositoryRoot } from "../git/inspector.js";
import {
  loadTrustRegistry,
  registerIdentity,
  revokeIdentity,
} from "../identity/registry.js";
import type { ApproverRole, IdentityPublicKey } from "../identity/types.js";

export interface IdentityCommandOptions {
  readonly action: "register" | "verify" | "revoke" | "list";
  readonly values: readonly string[];
  readonly format: OutputFormat;
}

export async function runIdentity(
  options: IdentityCommandOptions
): Promise<number> {
  const repoRoot = await getRepositoryRoot(process.cwd()).catch(() => null);
  if (!repoRoot) return ExitCodes.NOT_GIT_REPO;

  try {
    if (options.action === "register") {
      const [keyId, publicKeyPath, owner, roleText, validDaysText] =
        options.values;
      if (!keyId || !publicKeyPath || !owner || !roleText) {
        throw new Error(
          "identity register requires <keyId> <publicKeyFile> <owner> <role> [validDays]"
        );
      }

      const validRoles: readonly ApproverRole[] = [
        "security-lead",
        "release-manager",
        "lead-maintainer",
        "developer",
      ];
      if (!validRoles.includes(roleText as ApproverRole)) {
        throw new Error(
          `Invalid role '${roleText}'. Allowed roles: ${validRoles.join(", ")}`
        );
      }

      const pubKeyAbs = resolve(process.cwd(), publicKeyPath);
      const publicKeyPem = await readFile(pubKeyAbs, "utf-8");

      const days = validDaysText ? Number(validDaysText) : 365;
      const now = new Date();
      const validUntil = new Date(
        now.getTime() + days * 24 * 60 * 60 * 1000
      ).toISOString();

      const identity: IdentityPublicKey = {
        keyId,
        publicKeyPem: publicKeyPem.trim(),
        owner,
        role: roleText as ApproverRole,
        validFrom: now.toISOString(),
        validUntil,
        revoked: false,
      };

      const registry = await registerIdentity(repoRoot, identity);

      if (options.format === "json") {
        process.stdout.write(
          `${JSON.stringify({ registered: true, identity }, null, 2)}\n`
        );
      } else {
        process.stdout.write(`Identity registered successfully.\n`);
        process.stdout.write(`Key ID: ${keyId}\nOwner: ${owner}\nRole: ${roleText}\n`);
      }
      return ExitCodes.OK;
    }

    if (options.action === "revoke") {
      const [keyId, ...reasonParts] = options.values;
      if (!keyId) {
        throw new Error("identity revoke requires <keyId> [reason]");
      }
      const reason = reasonParts.join(" ") || "Administrative key revocation";
      const registry = await revokeIdentity(repoRoot, keyId, reason);

      if (options.format === "json") {
        process.stdout.write(
          `${JSON.stringify({ revoked: true, keyId, reason }, null, 2)}\n`
        );
      } else {
        process.stdout.write(`Identity keyId '${keyId}' revoked: ${reason}\n`);
      }
      return ExitCodes.OK;
    }

    if (options.action === "verify" || options.action === "list") {
      const registry = await loadTrustRegistry(repoRoot);
      const now = Date.now();
      const summary = registry.identities.map((id) => {
        const from = new Date(id.validFrom).getTime();
        const until = new Date(id.validUntil).getTime();
        const isExpired = now > until;
        const isValid = !id.revoked && now >= from && !isExpired;
        return {
          keyId: id.keyId,
          owner: id.owner,
          role: id.role,
          status: id.revoked ? "REVOKED" : isExpired ? "EXPIRED" : "VALID",
          validFrom: id.validFrom,
          validUntil: id.validUntil,
          active: isValid,
        };
      });

      if (options.format === "json") {
        process.stdout.write(
          `${JSON.stringify({ count: registry.identities.length, identities: summary }, null, 2)}\n`
        );
      } else {
        process.stdout.write(`Identity Trust Registry (${registry.identities.length} keys):\n`);
        for (const item of summary) {
          process.stdout.write(
            `  [${item.status}] ${item.keyId} (${item.owner} / ${item.role}) Valid: ${item.validFrom} -> ${item.validUntil}\n`
          );
        }
      }
      return ExitCodes.OK;
    }

    return ExitCodes.CONFIG_ERROR;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Identity command error: ${msg}\n`);
    return ExitCodes.CONFIG_ERROR;
  }
}
