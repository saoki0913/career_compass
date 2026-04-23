import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock DB and dependencies
// ---------------------------------------------------------------------------

const insertMock = vi.fn();
const updateMock = vi.fn();
const selectMock = vi.fn();

function createChainMock(terminal: () => Promise<unknown>) {
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => terminal());
  chain.orderBy = vi.fn(() => chain);
  chain.set = vi.fn(() => chain);
  chain.values = vi.fn(() => chain);
  chain.returning = vi.fn(() => terminal());
  return chain;
}

vi.mock("@/lib/db", () => {
  const selectChain = createChainMock(() => Promise.resolve([]));
  const insertChain = createChainMock(() => Promise.resolve([]));
  const updateChain = createChainMock(() => Promise.resolve([]));

  return {
    db: {
      select: () => {
        selectMock();
        return selectChain;
      },
      insert: () => {
        insertMock();
        return insertChain;
      },
      update: () => {
        updateMock();
        return updateChain;
      },
    },
  };
});

vi.mock("@/lib/db/schema", () => ({
  interviewConversations: {
    id: "id",
    companyId: "companyId",
    userId: "userId",
    guestId: "guestId",
  },
  interviewFeedbackHistories: {
    id: "id",
    companyId: "companyId",
    userId: "userId",
    guestId: "guestId",
    createdAt: "createdAt",
  },
  interviewTurnEvents: {
    companyId: "companyId",
    conversationId: "conversationId",
    userId: "userId",
    guestId: "guestId",
    createdAt: "createdAt",
  },
}));

vi.mock("@/lib/interview/persistence-errors", () => ({
  normalizeInterviewPersistenceError: () => null,
}));

describe("interview persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ensureInterviewConversation calls db.select then db.insert for new conversations", async () => {
    const { ensureInterviewConversation } = await import("./persistence");

    await ensureInterviewConversation("company-1", { userId: "user-1", guestId: null }, {
      selectedIndustry: "IT",
      selectedRole: "Engineer",
      selectedRoleSource: "user",
      resolvedIndustry: "IT",
      requiresIndustrySelection: false,
      industryOptions: ["IT"],
      roleTrack: "biz_general",
      interviewFormat: "standard_behavioral",
      selectionType: "fulltime",
      interviewStage: "early",
      interviewerType: "hr",
      strictnessMode: "standard",
    });

    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("resetInterviewConversation calls db.update", async () => {
    const { resetInterviewConversation } = await import("./persistence");

    await resetInterviewConversation("company-1", { userId: "user-1", guestId: null });

    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("saveInterviewConversationProgress calls db.update with turnState", async () => {
    const { saveInterviewConversationProgress } = await import("./persistence");

    await saveInterviewConversationProgress({
      conversationId: "conv-1",
      companyId: "company-1",
      messages: [{ role: "assistant", content: "Question?" }],
      turnState: {
        turnCount: 1,
        currentTopic: "intro",
        coverageState: [],
        coveredTopics: [],
        remainingTopics: [],
        recentQuestionSummariesV2: [],
        formatPhase: "opening",
        lastQuestion: null,
        lastAnswer: null,
        lastTopic: null,
        currentTurnMeta: null,
        nextAction: "ask",
      },
      status: "in_progress",
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});
