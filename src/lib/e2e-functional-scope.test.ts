import { describe, expect, it } from "vitest";
import { resolveE2EFunctionalScope } from "./e2e-functional-scope.mjs";
import { resolveE2EFunctionalFeatureForPath } from "./e2e-functional-features.mjs";

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
        "src/app/api/documents/_services/handle-review-stream.ts",
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
      ],
    });

    expect(scope.features).toEqual(["gakuchika", "motivation"]);
  });

  it("treats shared llm and live e2e files as all features", () => {
    const scope = resolveE2EFunctionalScope({
      changedFiles: ["backend/app/utils/llm.py", "e2e/live-ai-conversations.spec.ts"],
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

  it("maps absolute repo paths for shell hooks", () => {
    const feature = resolveE2EFunctionalFeatureForPath(
      `${process.cwd()}/src/app/(product)/gakuchika/[id]/page.tsx`,
    );

    expect(feature).toBe("gakuchika");
  });
});
