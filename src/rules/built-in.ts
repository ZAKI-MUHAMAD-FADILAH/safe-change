import type { SafeChangeRule } from "../types/index.js";

export const BUILT_IN_RULES: readonly SafeChangeRule[] = [
  {
    id: "no-delete-migrations",
    name: "No Delete Migrations",
    description: "Prevent deletion of database migration files",
    severity: "error",
    condition: {
      type: "file-not-deleted",
      pattern: "**/migrations/**",
    },
    builtIn: true,
  },
  {
    id: "no-delete-env",
    name: "No Delete Environment Files",
    description: "Prevent deletion of .env configuration files",
    severity: "error",
    condition: {
      type: "file-not-deleted",
      pattern: "**/.env*",
    },
    builtIn: true,
  },
  {
    id: "no-modify-lockfile",
    name: "No Modify Lockfiles",
    description: "Ensure dependency lockfiles are not modified directly",
    severity: "warn",
    condition: {
      type: "file-not-modified",
      patterns: [
        "**/package-lock.json",
        "**/yarn.lock",
        "**/pnpm-lock.yaml",
        "**/Cargo.lock",
        "**/poetry.lock",
        "**/composer.lock",
      ],
    },
    builtIn: true,
  },
  {
    id: "max-files-changed",
    name: "Max Files Changed",
    description: "Limit total number of files changed in a single iteration",
    severity: "warn",
    condition: {
      type: "max-files-changed",
      threshold: 50,
    },
    builtIn: true,
  },
  {
    id: "max-deleted-files",
    name: "Max Deleted Files",
    description: "Prevent bulk accidental file deletions",
    severity: "error",
    condition: {
      type: "max-deleted-files",
      threshold: 10,
    },
    builtIn: true,
  },
  {
    id: "require-tests-pass",
    name: "Require Tests Pass",
    description: "Ensure test suite passes before accepting changes",
    severity: "error",
    condition: {
      type: "require-check-pass",
      checkName: "test",
    },
    builtIn: true,
  },
] as const;

export function getBuiltInRule(id: string): SafeChangeRule | undefined {
  return BUILT_IN_RULES.find((r) => r.id === id);
}

export function getAllBuiltInRules(): readonly SafeChangeRule[] {
  return BUILT_IN_RULES;
}
