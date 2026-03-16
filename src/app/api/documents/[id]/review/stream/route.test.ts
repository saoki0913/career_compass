import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  db: {},
}));

vi.mock("@/lib/ai/user-context", () => ({
  extractOtherDocumentSections: vi.fn(),
  fetchGakuchikaContext: vi.fn(),
  fetchProfileContext: vi.fn(),
}));

vi.mock("@/lib/auth/guest", () => ({
  getGuestUser: vi.fn(),
}));

vi.mock("@/lib/credits", () => ({
  reserveCredits: vi.fn(),
  confirmReservation: vi.fn(),
  cancelReservation: vi.fn(),
  calculateESReviewCost: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  createRateLimitKey: vi.fn(),
  RATE_LIMITS: {},
}));

vi.mock("@/lib/ai/es-review-models", () => ({
  isStandardESReviewModel: vi.fn(),
}));

vi.mock("@/lib/constants/es-review-role-catalog", () => ({
  resolveIndustryForReview: vi.fn(),
}));

describe("api/documents/[id]/review/stream prestream enrichment policy", () => {
  it("treats trusted official sources as sufficient coverage for required templates", async () => {
    const { hasSufficientCompanyCoverage, shouldRunPrestreamEnrichment } = await import(
      "@/app/api/documents/[id]/review/stream/route"
    );

    const entries = [
      {
        url: "https://example.com/recruit",
        contentType: "new_grad_recruitment",
        sourceType: "official" as const,
        trustedForEsReview: true,
      },
      {
        url: "https://example.com/about",
        contentType: "corporate_site",
        sourceType: "official" as const,
        trustedForEsReview: true,
      },
    ];

    expect(
      hasSufficientCompanyCoverage({
        templateType: "role_course_reason",
        question: "デジタル企画を選択した理由を教えてください。",
        answer: "技術と事業をつなぐ仕事に関心がある。",
        roleName: "デジタル企画",
        entries,
      }),
    ).toBe(true);

    expect(
      shouldRunPrestreamEnrichment({
        templateType: "role_course_reason",
        question: "デジタル企画を選択した理由を教えてください。",
        answer: "技術と事業をつなぐ仕事に関心がある。",
        roleName: "デジタル企画",
        corporateInfoUrls: entries,
      }),
    ).toBe(false);
  });

  it("ignores untrusted third-party sources when judging coverage", async () => {
    const { hasSufficientCompanyCoverage, shouldRunPrestreamEnrichment } = await import(
      "@/app/api/documents/[id]/review/stream/route"
    );

    const entries = [
      {
        url: "https://job.example.com/motivation",
        contentType: "new_grad_recruitment",
        sourceType: "job_site" as const,
        trustedForEsReview: false,
      },
      {
        url: "https://blog.example.com/about",
        contentType: "corporate_site",
        sourceType: "blog" as const,
        trustedForEsReview: false,
      },
    ];

    expect(
      hasSufficientCompanyCoverage({
        templateType: "company_motivation",
        question: "志望理由を教えてください。",
        answer: "事業の幅に魅力を感じる。",
        roleName: "総合職",
        entries,
      }),
    ).toBe(false);

    expect(
      shouldRunPrestreamEnrichment({
        templateType: "company_motivation",
        question: "志望理由を教えてください。",
        answer: "事業の幅に魅力を感じる。",
        roleName: "総合職",
        corporateInfoUrls: entries,
      }),
    ).toBe(true);
  });

  it("accepts parent-allowed sources as trusted coverage", async () => {
    const { hasSufficientCompanyCoverage } = await import(
      "@/app/api/documents/[id]/review/stream/route"
    );

    const entries = [
      {
        url: "https://parent.example.com/recruit",
        contentType: "new_grad_recruitment",
        sourceType: "parent" as const,
        parentAllowed: true,
        trustedForEsReview: true,
      },
      {
        url: "https://parent.example.com/about",
        contentType: "corporate_site",
        sourceType: "parent" as const,
        parentAllowed: true,
        trustedForEsReview: true,
      },
    ];

    expect(
      hasSufficientCompanyCoverage({
        templateType: "company_motivation",
        question: "当社を志望する理由を教えてください。",
        answer: "事業理解を深めたい。",
        roleName: "総合職",
        entries,
      }),
    ).toBe(true);
  });

  it("does not run assistive enrichment without a company signal", async () => {
    const { shouldRunPrestreamEnrichment } = await import(
      "@/app/api/documents/[id]/review/stream/route"
    );

    expect(
      shouldRunPrestreamEnrichment({
        templateType: "gakuchika",
        question: "学生時代に力を入れたことを教えてください。",
        answer: "研究室で進捗管理を改善した。",
        roleName: null,
        corporateInfoUrls: [],
      }),
    ).toBe(false);
  });
});
