import { collectChangedFiles } from "./ui-ci-context.mjs";
import {
  AI_FEATURES,
  ALL_E2E_FUNCTIONAL_FEATURES,
  COMPANY_INFO_SHARED_PATTERNS,
  CRUD_SHARED_PATTERNS,
  getE2EFunctionalFeatureConfig,
  LLM_SHARED_TRIGGER_PATTERNS,
  matchesAnyE2EFunctionalPattern,
  normalizeE2EFunctionalPath,
  SHARED_TRIGGER_PATTERNS,
} from "./e2e-functional-features.mjs";

function normalizePath(path) {
  return normalizeE2EFunctionalPath(path);
}

export function resolveE2EFunctionalScope({
  changedFiles = [],
} = {}) {
  const normalizedChangedFiles = [...new Set(changedFiles.map(normalizePath).filter(Boolean))];

  if (normalizedChangedFiles.length === 0) {
    return {
      shouldRun: false,
      features: [],
      changedFiles: [],
      source: "no-op",
    };
  }

  if (normalizedChangedFiles.some((file) => matchesAnyE2EFunctionalPattern(file, SHARED_TRIGGER_PATTERNS))) {
    return {
      shouldRun: true,
      features: [...ALL_E2E_FUNCTIONAL_FEATURES],
      changedFiles: normalizedChangedFiles,
      source: "shared-trigger",
    };
  }

  const llmSharedChanged = normalizedChangedFiles.some((file) =>
    matchesAnyE2EFunctionalPattern(file, LLM_SHARED_TRIGGER_PATTERNS),
  );

  const companyInfoSharedChanged = normalizedChangedFiles.some((file) =>
    matchesAnyE2EFunctionalPattern(file, COMPANY_INFO_SHARED_PATTERNS),
  );

  const crudSharedChanged = normalizedChangedFiles.some((file) =>
    matchesAnyE2EFunctionalPattern(file, CRUD_SHARED_PATTERNS),
  );

  const aiFeatureSet = new Set(AI_FEATURES);
  const crudFeatures = new Set([
    "calendar", "tasks-deadlines", "notifications", "company-crud",
    "billing", "search-query",
  ]);

  const matchedFeatures = ALL_E2E_FUNCTIONAL_FEATURES.filter((feature) =>
    (aiFeatureSet.has(feature) && llmSharedChanged) ||
    ((feature === "company-info-search" || feature === "rag-ingest" || feature === "selection-schedule") &&
      companyInfoSharedChanged) ||
    (crudFeatures.has(feature) && crudSharedChanged) ||
    normalizedChangedFiles.some((file) =>
      matchesAnyE2EFunctionalPattern(file, getE2EFunctionalFeatureConfig(feature)?.patterns ?? []),
    ),
  );

  return {
    shouldRun: matchedFeatures.length > 0,
    features: matchedFeatures,
    changedFiles: normalizedChangedFiles,
    source: matchedFeatures.length > 0 ? "feature-trigger" : "no-match",
  };
}

export function resolveE2EFunctionalScopeFromContext({
  cwd = process.cwd(),
  env = process.env,
  explicitFiles = [],
} = {}) {
  const changedFiles = collectChangedFiles({ cwd, env, explicitFiles });
  return resolveE2EFunctionalScope({ changedFiles });
}
