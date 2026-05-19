import { describe, expect, it } from "vitest";
import { resolveE2EFunctionalScope } from "./e2e-functional-scope.mjs";
import {
  resolveE2EFunctionalFeatureForPath,
  AI_LIVE_CONTRACT_FEATURES,
  AI_FEATURES,
  getE2EFunctionalFeatureConfig,
  getLiveContractCommand,
  LIVE_CONTRACT_COMMAND,
} from "./e2e-functional-features.mjs";

describe("resolveE2EFunctionalScope", () => {
  it("does not run when no files changed", () => {
    const scope = resolveE2EFunctionalScope({ changedFiles: [] });

    expect(scope.shouldRun).toBe(false);
    expect(scope.features).toEqual([]);
  });

  it("maps ES review frontend/backend changes to es-review", () => {
    const scope = resolveE2EFunctionalScope({
      changedFiles: [
        "backend/app/routers/es_review.py",
        "backend/app/prompts/es_reference_guidance.py",
        "backend/scripts/es_review/generate_es_reference_guidance.py",
        "src/bff/es-review/handle-review-stream.ts",
        "src/features/es-review/hooks/transport.ts",
      ],
    });

    expect(scope.shouldRun).toBe(true);
    expect(scope.features).toEqual(["es-review"]);
  });

  it("includes actual page entrypoints for gakuchika and motivation", () => {
    const scope = resolveE2EFunctionalScope({
      changedFiles: [
        "src/app/(product)/gakuchika/[id]/page.tsx",
        "src/app/(product)/companies/[id]/motivation/page.tsx",
        "src/features/motivation/hooks/useMotivationConversationController.ts",
      ],
    });

    expect(scope.features).toEqual(["gakuchika", "motivation"]);
  });

  it("maps gakuchika draft quality evaluator changes to gakuchika", () => {
    const scope = resolveE2EFunctionalScope({
      changedFiles: ["backend/app/evaluators/draft_quality.py"],
    });

    expect(scope.features).toEqual(["gakuchika"]);
  });

  it("includes gakuchika when shared ES template changes", () => {
    const scope = resolveE2EFunctionalScope({
      changedFiles: ["backend/app/prompts/es_templates.py"],
    });

    expect(scope.features).toContain("gakuchika");
  });

  it("treats shared llm and live e2e files as all features", () => {
    const scope = resolveE2EFunctionalScope({
      changedFiles: ["backend/app/utils/llm.py", "e2e/live-smoke/live-ai-conversations.spec.ts"],
    });

    expect(scope.features).toEqual([
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
    ]);
  });

  it("LLM-only changes trigger only AI features, not CRUD", () => {
    const scope = resolveE2EFunctionalScope({
      changedFiles: ["backend/app/utils/llm_providers.py"],
    });

    expect(scope.shouldRun).toBe(true);
    expect(scope.features).toEqual([
      "es-review",
      "gakuchika",
      "motivation",
      "interview",
      "company-info-search",
    ]);
    expect(scope.source).toBe("feature-trigger");
  });

  it("separates company-info live features", () => {
    const scope = resolveE2EFunctionalScope({
      changedFiles: [
        "backend/app/routers/company_info_search.py",
        "backend/app/routers/company_info_rag_service.py",
        "backend/app/routers/company_info_schedule.py",
      ],
    });

    expect(scope.features).toEqual([
      "company-info-search",
      "rag-ingest",
      "selection-schedule",
    ]);
  });

  it("maps RAG package changes to company-info search and ingest", () => {
    const scope = resolveE2EFunctionalScope({
      changedFiles: [
        "backend/app/rag/hybrid_search.py",
        "backend/app/rag/vector_store.py",
        "backend/app/rag/reference_es.py",
      ],
    });

    expect(scope.features).toEqual(["company-info-search", "rag-ingest"]);
  });

  it("maps product page smoke targets to pages-smoke", () => {
    const scope = resolveE2EFunctionalScope({
      changedFiles: [
        "src/app/(product)/es/page.tsx",
        "src/app/(product)/gakuchika/page.tsx",
        "src/app/(product)/calendar/page.tsx",
        "src/app/(product)/notifications/page.tsx",
        "src/app/(product)/settings/page.tsx",
        "e2e/live-smoke/live-ai-pages.spec.ts",
      ],
    });

    expect(scope.features).toContain("pages-smoke");
  });

  it("maps absolute repo paths for shell hooks", () => {
    const feature = resolveE2EFunctionalFeatureForPath(
      `${process.cwd()}/src/app/(product)/gakuchika/[id]/page.tsx`,
    );

    expect(feature).toBe("gakuchika");
  });

  it("maps live-contract spec changes to all features", () => {
    const scope = resolveE2EFunctionalScope({
      changedFiles: ["e2e/live-contract/ai-live-contract.spec.ts"],
    });

    expect(scope.shouldRun).toBe(true);
    expect(scope.features.length).toBe(14);
  });

  it("maps e2e/mocks changes to all features", () => {
    const scope = resolveE2EFunctionalScope({
      changedFiles: ["e2e/mocks/gakuchika.ts"],
    });

    expect(scope.shouldRun).toBe(true);
    expect(scope.features.length).toBe(14);
  });

  it("maps playwright.live-contract.config.ts to all features", () => {
    const scope = resolveE2EFunctionalScope({
      changedFiles: ["playwright.live-contract.config.ts"],
    });

    expect(scope.shouldRun).toBe(true);
    expect(scope.features.length).toBe(14);
  });
});

describe("testLayers and live-contract exports", () => {
  it("AI_LIVE_CONTRACT_FEATURES matches AI_FEATURES", () => {
    expect(AI_LIVE_CONTRACT_FEATURES).toEqual(AI_FEATURES);
  });

  it("AI features have live-contract in testLayers", () => {
    for (const feature of AI_FEATURES) {
      const config = getE2EFunctionalFeatureConfig(feature);
      expect(config?.testLayers).toContain("live-contract");
    }
  });

  it("non-AI features have only functional in testLayers", () => {
    const nonAiFeatures = ["calendar", "tasks-deadlines", "notifications", "company-crud", "billing", "search-query", "pages-smoke"];
    for (const feature of nonAiFeatures) {
      const config = getE2EFunctionalFeatureConfig(feature);
      expect(config?.testLayers).toEqual(["functional"]);
    }
  });

  it("getLiveContractCommand returns the make target", () => {
    expect(getLiveContractCommand()).toBe(LIVE_CONTRACT_COMMAND);
    expect(LIVE_CONTRACT_COMMAND).toBe("make test-e2e-live-contract");
  });
});
