export const LOCAL_ALL_COMMAND = "make test-e2e-functional-local";
export const STAGING_ALL_COMMAND = "make test-e2e-functional";

export const ALL_E2E_FUNCTIONAL_FEATURES = [
  "es-review",
  "gakuchika",
  "motivation",
  "interview",
  "company-info-search",
  "rag-ingest",
  "selection-schedule",
  "calendar",
  "tasks-deadlines",
  "notifications",
  "company-crud",
  "billing",
  "search-query",
  "pages-smoke",
];

const FEATURE_CONFIG = {
  "es-review": {
    localCommand: "make test-e2e-functional-local-es",
    stagingCommand: "make test-e2e-functional-es",
    browserRequired: true,
    patterns: [
      /^backend\/app\/routers\/es_review[^/]*\.py$/u,
      /^backend\/app\/prompts\/es_[^/]+\.py$/u,
      /^backend\/app\/prompts\/reference_es\.py$/u,
      /^backend\/app\/testing\/es_review_live_gate\.py$/u,
      /^src\/components\/es\/.+/u,
      /^src\/hooks\/useESReview\.ts$/u,
      /^src\/hooks\/es-review\/.+/u,
      /^src\/app\/api\/documents\/\[id\]\/review\/stream\/route\.ts$/u,
      /^src\/app\/api\/documents\/_services\/handle-review-stream\.ts$/u,
      /^src\/app\/\(product\)\/es\/.+/u,
    ],
  },
  gakuchika: {
    localCommand: "make test-e2e-functional-local-gakuchika",
    stagingCommand: "make test-e2e-functional-gakuchika",
    browserRequired: true,
    patterns: [
      /^backend\/app\/routers\/gakuchika\.py$/u,
      /^backend\/app\/prompts\/gakuchika[^/]*\.py$/u,
      /^backend\/app\/normalization\/gakuchika_payload\.py$/u,
      /^backend\/app\/utils\/gakuchika_text\.py$/u,
      /^src\/components\/gakuchika\/.+/u,
      /^src\/hooks\/useGakuchikaConversationController\.ts$/u,
      /^src\/hooks\/gakuchika\/.+/u,
      /^src\/app\/api\/gakuchika\/.+/u,
      /^src\/app\/\(product\)\/gakuchika\/.+/u,
    ],
  },
  motivation: {
    localCommand: "make test-e2e-functional-local-motivation",
    stagingCommand: "make test-e2e-functional-motivation",
    browserRequired: true,
    patterns: [
      /^backend\/app\/routers\/motivation[^/]*\.py$/u,
      /^backend\/app\/prompts\/motivation[^/]*\.py$/u,
      /^src\/components\/motivation\/.+/u,
      /^src\/hooks\/useMotivationConversationController\.ts$/u,
      /^src\/hooks\/motivation\/.+/u,
      /^src\/app\/api\/motivation\/.+/u,
      /^src\/app\/\(product\)\/companies\/\[id\]\/motivation\/.+/u,
    ],
  },
  interview: {
    localCommand: "make test-e2e-functional-local-interview",
    stagingCommand: "make test-e2e-functional-interview",
    browserRequired: true,
    patterns: [
      /^backend\/app\/routers\/interview\.py$/u,
      /^backend\/app\/routers\/_interview\/.+/u,
      /^backend\/app\/prompts\/interview[^/]*\.py$/u,
      /^backend\/app\/prompts\/reference_interview_importer\.py$/u,
      /^src\/components\/interview\/.+/u,
      /^src\/hooks\/useInterviewConversationController\.ts$/u,
      /^src\/hooks\/interview\/.+/u,
      /^src\/app\/api\/companies\/\[id\]\/interview\/.+/u,
      /^src\/app\/api\/interview\/.+/u,
      /^src\/app\/\(product\)\/companies\/\[id\]\/interview\/.+/u,
      /^src\/app\/\(product\)\/interview\/.+/u,
    ],
  },
  "company-info-search": {
    localCommand: "make test-e2e-functional-local-company-info-search",
    stagingCommand: "make test-e2e-functional-company-info-search",
    browserRequired: false,
    patterns: [
      /^backend\/app\/routers\/company_info(?:_search|_candidate_scoring|_scoring|_url_utils)?\.py$/u,
      /^backend\/app\/utils\/hybrid_search\.py$/u,
      /^backend\/app\/utils\/bm25_store\.py$/u,
      /^backend\/app\/utils\/reranker\.py$/u,
      /^backend\/app\/utils\/japanese_tokenizer\.py$/u,
      /^backend\/app\/utils\/web_search\.py$/u,
      /^backend\/tests\/company_info\/integration\/test_live_company_info_search_report\.py$/u,
      /^src\/app\/api\/companies\/\[id\]\/search-pages\/.+/u,
      /^src\/app\/api\/companies\/\[id\]\/search-corporate-pages\/.+/u,
    ],
  },
  "rag-ingest": {
    localCommand: "make test-e2e-functional-local-rag-ingest",
    stagingCommand: "make test-e2e-functional-rag-ingest",
    browserRequired: false,
    patterns: [
      /^backend\/app\/routers\/company_info_(?:ingest_service|rag_service|pdf)\.py$/u,
      /^backend\/app\/utils\/vector_store\.py$/u,
      /^backend\/app\/utils\/embeddings\.py$/u,
      /^backend\/app\/utils\/text_chunker\.py$/u,
      /^backend\/tests\/company_info\/integration\/test_live_rag_ingest_report\.py$/u,
      /^src\/app\/api\/companies\/\[id\]\/upload-pdf\/.+/u,
      /^src\/app\/api\/companies\/\[id\]\/fetch-corporate-site-pdf\/.+/u,
    ],
  },
  "selection-schedule": {
    localCommand: "make test-e2e-functional-local-selection-schedule",
    stagingCommand: "make test-e2e-functional-selection-schedule",
    browserRequired: false,
    patterns: [
      /^backend\/app\/routers\/company_info_schedule(?:_service|_links)?\.py$/u,
      /^backend\/tests\/company_info\/integration\/test_live_selection_schedule_report\.py$/u,
      /^src\/app\/api\/companies\/\[id\]\/fetch-info\/route\.ts$/u,
      /^src\/app\/api\/companies\/\[id\]\/save-deadline\/route\.ts$/u,
      /^src\/app\/api\/companies\/\[id\]\/applications\/.+/u,
    ],
  },
  calendar: {
    localCommand: "make test-e2e-functional-local-calendar",
    stagingCommand: "make test-e2e-functional-calendar",
    browserRequired: false,
    patterns: [
      /^src\/app\/api\/calendar\/.+/u,
      /^src\/app\/\(product\)\/calendar\/.+/u,
      /^src\/components\/calendar\/.+/u,
    ],
  },
  "tasks-deadlines": {
    localCommand: "make test-e2e-functional-local-tasks-deadlines",
    stagingCommand: "make test-e2e-functional-tasks-deadlines",
    browserRequired: false,
    patterns: [
      /^src\/app\/api\/tasks\/.+/u,
      /^src\/app\/api\/deadlines\/.+/u,
      /^src\/app\/\(product\)\/deadlines\/.+/u,
      /^src\/app\/\(product\)\/tasks\/.+/u,
    ],
  },
  notifications: {
    localCommand: "make test-e2e-functional-local-notifications",
    stagingCommand: "make test-e2e-functional-notifications",
    browserRequired: false,
    patterns: [
      /^src\/app\/api\/notifications\/.+/u,
      /^src\/app\/\(product\)\/notifications\/.+/u,
      /^src\/lib\/notifications\.ts$/u,
      /^src\/app\/api\/settings\/.+/u,
      /^src\/app\/\(product\)\/profile\/.+/u,
      /^src\/app\/\(product\)\/settings\/.+/u,
    ],
  },
  "company-crud": {
    localCommand: "make test-e2e-functional-local-company-crud",
    stagingCommand: "make test-e2e-functional-company-crud",
    browserRequired: false,
    patterns: [
      /^src\/app\/api\/companies\/route\.ts$/u,
      /^src\/app\/api\/companies\/\[id\]\/route\.ts$/u,
      /^src\/app\/\(product\)\/companies\/page\.tsx$/u,
      /^src\/app\/\(product\)\/companies\/new\/.+/u,
    ],
  },
  billing: {
    localCommand: "make test-e2e-functional-local-billing",
    stagingCommand: "make test-e2e-functional-billing",
    browserRequired: false,
    patterns: [
      /^src\/app\/api\/credits\/.+/u,
      /^src\/app\/api\/stripe\/.+/u,
      /^src\/lib\/stripe\/.+/u,
      /^src\/app\/api\/webhooks\/stripe\/.+/u,
    ],
  },
  "search-query": {
    localCommand: "make test-e2e-functional-local-search-query",
    stagingCommand: "make test-e2e-functional-search-query",
    browserRequired: false,
    patterns: [
      /^src\/app\/api\/search\/.+/u,
      /^src\/app\/\(product\)\/search\/.+/u,
    ],
  },
  "pages-smoke": {
    localCommand: "make test-e2e-functional-local-pages-smoke",
    stagingCommand: "make test-e2e-functional-pages-smoke",
    browserRequired: true,
    patterns: [
      /^src\/app\/\(product\)\/dashboard\/.+/u,
      /^src\/app\/\(product\)\/companies\/page\.tsx$/u,
      /^src\/components\/dashboard\/.+/u,
      /^src\/components\/layout\/.+/u,
    ],
  },
};

export const AI_FEATURES = [
  "es-review",
  "gakuchika",
  "motivation",
  "interview",
  "company-info-search",
];

export const SHARED_TRIGGER_PATTERNS = [
  /^e2e\/live-ai-.*\.spec\.ts$/u,
  /^e2e\/fixtures\/auth\.ts$/u,
  /^scripts\/ci\/run-ai-live\.sh$/u,
  /^scripts\/ci\/run-e2e-functional\.sh$/u,
  /^playwright\.live\.config\.ts$/u,
];

export const LLM_SHARED_TRIGGER_PATTERNS = [
  /^backend\/app\/utils\/llm[^/]*\.py$/u,
  /^backend\/app\/prompts\/__init__\.py$/u,
];

export const COMPANY_INFO_SHARED_PATTERNS = [
  /^backend\/app\/routers\/company_info\.py$/u,
  /^backend\/app\/routers\/company_info_config\.py$/u,
  /^backend\/app\/routers\/company_info_models\.py$/u,
  /^backend\/tests\/company_info\/integration\/live_feature_report\.py$/u,
];

export const CRUD_SHARED_PATTERNS = [
  /^backend\/tests\/crud\/.+/u,
  /^backend\/tests\/conversation\/staging_client\.py$/u,
];

export function normalizeE2EFunctionalPath(path) {
  const normalized = String(path || "").replaceAll("\\", "/").trim().replace(/\/+$/u, "");
  if (!normalized) {
    return "";
  }

  const repoRoot = String(process.cwd() || "").replaceAll("\\", "/").replace(/\/+$/u, "");
  if (repoRoot && normalized.startsWith(`${repoRoot}/`)) {
    return normalized.slice(repoRoot.length + 1);
  }

  return normalized.replace(/^\.\/+/u, "");
}

export function getE2EFunctionalFeatureConfig(feature) {
  return FEATURE_CONFIG[feature] ?? null;
}

export function getE2EFunctionalCommand(feature, environment = "local") {
  if (feature === "all") {
    return environment === "staging" ? STAGING_ALL_COMMAND : LOCAL_ALL_COMMAND;
  }

  const config = getE2EFunctionalFeatureConfig(feature);
  if (!config) {
    return null;
  }
  return environment === "staging" ? config.stagingCommand : config.localCommand;
}

export function matchesAnyE2EFunctionalPattern(path, patterns) {
  return patterns.some((pattern) => pattern.test(path));
}

export function resolveE2EFunctionalFeatureForPath(filePath) {
  const normalizedPath = normalizeE2EFunctionalPath(filePath);
  if (!normalizedPath) {
    return null;
  }

  if (matchesAnyE2EFunctionalPattern(normalizedPath, SHARED_TRIGGER_PATTERNS)) {
    return "all";
  }

  if (matchesAnyE2EFunctionalPattern(normalizedPath, COMPANY_INFO_SHARED_PATTERNS)) {
    return "all";
  }

  for (const feature of ALL_E2E_FUNCTIONAL_FEATURES) {
    const config = getE2EFunctionalFeatureConfig(feature);
    if (config && matchesAnyE2EFunctionalPattern(normalizedPath, config.patterns)) {
      return feature;
    }
  }

  return null;
}

export function getAllE2EFunctionalFeatureConfigs() {
  return ALL_E2E_FUNCTIONAL_FEATURES.map((feature) => ({
    feature,
    ...FEATURE_CONFIG[feature],
  }));
}
import process from "node:process";
