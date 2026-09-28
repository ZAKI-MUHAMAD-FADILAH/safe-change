import type {
  ChangeBudget,
  EnterpriseMode,
  EnterprisePolicy,
} from "../types/index.js";

export const ENTERPRISE_MODES: readonly EnterpriseMode[] = [
  "standard",
  "enhanced",
  "high-assurance",
  "critical-change",
];

export const DEFAULT_CHANGE_BUDGET: ChangeBudget = {
  maxFilesChanged: 12,
  maxLinesAdded: 500,
  maxLinesDeleted: 200,
  maxPublicApisChanged: 0,
  maxDeletedFiles: 0,
  allowLockfileChanges: false,
};

export const DEFAULT_ENTERPRISE_POLICY: EnterprisePolicy = {
  policyVersion: 1,
  minimumMode: "standard",
  requireBaseline: true,
  requireTests: true,
  requireCoverage: false,
  requireDependencyAudit: false,
  requireDiffReview: true,
  allowForcePush: false,
  allowDestructiveGit: false,
  changeBudget: DEFAULT_CHANGE_BUDGET,
};

export function maxMode(
  left: EnterpriseMode,
  right: EnterpriseMode
): EnterpriseMode {
  return ENTERPRISE_MODES.indexOf(left) >= ENTERPRISE_MODES.indexOf(right)
    ? left
    : right;
}