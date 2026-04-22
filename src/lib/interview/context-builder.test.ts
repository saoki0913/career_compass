import { beforeEach, describe, expect, it, vi } from "vitest";

import { extractTextFromContent } from "@/lib/search/utils";

// ---------------------------------------------------------------------------
// Hoisted mock state so vi.mock closures and tests share the same references.
// ---------------------------------------------------------------------------

const { selectResultsByIndex } = vi.hoisted(() => ({
  selectResultsByIndex: { value: new Map<number, unknown[]>() },
}));

vi.mock("@/lib/db", () => {
  function chainWithTerminal(terminal: () => Promise<unknown[]>) {
    const c: Record<string, (...a: unknown[]) => unknown> = {};
    c.from = vi.fn(() => c);
    c.where = vi.fn(() => c);
    c.limit = vi.fn(() => terminal());
    c.orderBy = vi.fn(() => c);
    c.leftJoin = vi.fn(() => c);
    return c;
  }

  let selectCallIndex = 0;
  return {
    db: {
      select: vi.fn(() => {
        selectCallIndex++;
        return chainWithTerminal(() =>
          Promise.resolve(selectResultsByIndex.value.get(selectCallIndex) ?? [])
        );
      }),
    },
    __resetSelectIndex: () => {
      selectCallIndex = 0;
    },
  };
});

vi.mock("@/lib/db/schema", () => ({
  companies: { id: "id", userId: "userId", guestId: "guestId" },
  applications: { companyId: "companyId", userId: "userId", guestId: "guestId", type: "type" },
  documents: {
    userId: "userId",
    guestId: "guestId",
    companyId: "companyId",
    type: "type",
    status: "status",
    title: "title",
    content: "content",
    esCategory: "esCategory",
    updatedAt: "updatedAt",
  },
  gakuchikaContents: {
    userId: "userId",
    guestId: "guestId",
    title: "title",
    summary: "summary",
    updatedAt: "updatedAt",
  },
  motivationConversations: {
    companyId: "companyId",
    userId: "userId",
    guestId: "guestId",
    generatedDraft: "generatedDraft",
    messages: "messages",
    selectedRole: "selectedRole",
    selectedRoleSource: "selectedRoleSource",
    desiredWork: "desiredWork",
  },
  interviewConversations: { companyId: "companyId", userId: "userId", guestId: "guestId" },
  interviewFeedbackHistories: { companyId: "companyId", userId: "userId", guestId: "guestId", createdAt: "createdAt" },
  jobTypes: { applicationId: "applicationId", name: "name" },
}));

vi.mock("@/lib/interview/company-seeds", () => ({
  getInterviewIndustrySeed: () => null,
  getInterviewCompanySeed: () => null,
}));

vi.mock("@/lib/constants/es-review-role-catalog", () => ({
  resolveMotivationRoleContext: () => ({
    resolvedIndustry: "IT",
    requiresIndustrySelection: false,
    industryOptions: ["IT"],
  }),
}));

vi.mock("@/lib/interview/persistence-errors", () => ({
  normalizeInterviewPersistenceError: () => null,
}));

describe("buildInterviewContext", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    selectResultsByIndex.value = new Map();
    const db = await import("@/lib/db");
    (db as unknown as { __resetSelectIndex: () => void }).__resetSelectIndex();
  });

  it("returns null when the company is not owned by the identity", async () => {
    const { buildInterviewContext } = await import("./context-builder");

    const result = await buildInterviewContext("company-1", {
      userId: "user-1",
      guestId: null,
    });

    expect(result).toBeNull();
  });

  it("returns a context shape with expected keys when company exists", async () => {
    selectResultsByIndex.value.set(1, [
      {
        id: "company-1",
        name: "Test Corp",
        industry: "IT",
        status: "interview_1",
        notes: null,
        recruitmentUrl: null,
        corporateUrl: null,
      },
    ]);

    const { buildInterviewContext } = await import("./context-builder");

    const result = await buildInterviewContext("company-1", {
      userId: "user-1",
      guestId: null,
    });

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.company).toMatchObject({ id: "company-1", name: "Test Corp" });
    expect(result).toHaveProperty("companySummary");
    expect(result).toHaveProperty("materials");
    expect(result).toHaveProperty("setup");
    expect(result).toHaveProperty("conversation");
    expect(result).toHaveProperty("feedbackHistories");
    expect(Array.isArray(result.materials)).toBe(true);
    expect(Array.isArray(result.feedbackHistories)).toBe(true);
    // conversation is null when no active interview row exists
    expect(result.conversation).toBeNull();
    // setup should reflect resolved values
    expect(result.setup.resolvedIndustry).toBe("IT");
  });

  it("uses structured gakuchika previews instead of raw JSON keys", async () => {
    selectResultsByIndex.value.set(1, [
      {
        id: "company-1",
        name: "Test Corp",
        industry: "IT",
        status: "interview_1",
        notes: null,
        recruitmentUrl: null,
        corporateUrl: null,
      },
    ]);
    selectResultsByIndex.value.set(3, [
      {
        title: "学園祭運営",
        summary: JSON.stringify({
          situation_text: "参加率が低かった",
          task_text: "集客導線を立て直した",
          action_text: "SNS告知と導線改善を主導した",
          result_text: "来場者数が前年より増えた",
          one_line_core_answer: "SNS告知と導線改善で来場者数を伸ばした",
        }),
      },
    ]);

    const { buildInterviewContext } = await import("./context-builder");
    const result = await buildInterviewContext("company-1", {
      userId: "user-1",
      guestId: null,
    });

    expect(result?.gakuchikaSummary).toContain("学園祭運営");
    expect(result?.gakuchikaSummary).toContain("SNS告知と導線改善で来場者数を伸ばした");
    expect(result?.gakuchikaSummary).not.toContain("situation_text");
    expect(result?.gakuchikaSummary).not.toContain('{"');
  });

  it("falls back to title when gakuchika summary is empty", async () => {
    selectResultsByIndex.value.set(1, [
      {
        id: "company-1",
        name: "Test Corp",
        industry: "IT",
        status: "interview_1",
        notes: null,
        recruitmentUrl: null,
        corporateUrl: null,
      },
    ]);
    selectResultsByIndex.value.set(3, [
      {
        title: "アルバイト改善",
        summary: "",
      },
    ]);

    const { buildInterviewContext } = await import("./context-builder");
    const result = await buildInterviewContext("company-1", {
      userId: "user-1",
      guestId: null,
    });

    expect(result?.gakuchikaSummary).toBe("アルバイト改善");
  });

  it("builds es summary from extracted document text without leaking UUIDs", async () => {
    const leakedUuid = "550e8400-e29b-41d4-a716-446655440000";
    selectResultsByIndex.value.set(1, [
      {
        id: "company-1",
        name: "Test Corp",
        industry: "IT",
        status: "interview_1",
        notes: null,
        recruitmentUrl: null,
        corporateUrl: null,
      },
    ]);
    selectResultsByIndex.value.set(4, [
      {
        title: "ES 下書き",
        content: JSON.stringify([
          { id: leakedUuid, type: "paragraph", text: "学生時代は地域イベントの運営に注力しました。" },
          { id: "ignored-id", type: "paragraph", children: [{ text: "来場者導線の改善も担当しました。" }] },
        ]),
        esCategory: "interview_prep",
      },
    ]);

    const { buildInterviewContext } = await import("./context-builder");
    const result = await buildInterviewContext("company-1", {
      userId: "user-1",
      guestId: null,
    });

    expect(result?.esSummary).toContain("学生時代は地域イベントの運営に注力しました。");
    expect(result?.esSummary).toContain("来場者導線の改善も担当しました。");
    expect(result?.esSummary).not.toContain(leakedUuid);
  });
});

describe("extractTextFromContent", () => {
  it("returns empty string for null content", () => {
    expect(extractTextFromContent(null)).toBe("");
  });
});
