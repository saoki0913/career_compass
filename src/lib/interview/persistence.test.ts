import { beforeEach, describe, expect, it, vi } from "vitest";

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

const txUpdateMock = vi.fn();

function makeDb() {
  const selectChain = createChainMock(() => Promise.resolve([]));
  const insertChain = createChainMock(() => Promise.resolve([]));
  const updateChain = createChainMock(() => Promise.resolve([]));
  return {
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
  };
}

vi.mock("@/lib/db", () => {
  const base = makeDb();
  const txUpdateChain = createChainMock(() => Promise.resolve([]));
  const tx: Record<string, unknown> = {
    ...base,
    update: () => {
      txUpdateMock();
      return txUpdateChain;
    },
  };
  return {
    db: {
      ...base,
      // transaction invokes its callback with a tx handle so *Tx variants are
      // exercised without a real database.
      transaction: (fn: (txHandle: typeof tx) => Promise<unknown>) => fn(tx),
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

  it("saveInterviewFeedbackSheet calls db.update", async () => {
    const { saveInterviewFeedbackSheet } = await import("./persistence");

    await saveInterviewFeedbackSheet({
      companyId: "company-1",
      identity: { userId: "user-1", guestId: null },
      historyId: "history-1",
      sheetContent: "# Sheet content",
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("saveInterviewConversationProgress updates inside a db.transaction (via the tx handle)", async () => {
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

    // The wrapper delegates to db.transaction, so the update runs on the tx handle.
    expect(txUpdateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("saveInterviewConversationProgressTx runs the update on the passed transaction handle", async () => {
    const { saveInterviewConversationProgressTx } = await import("./persistence");
    const { db } = await import("@/lib/db");

    await db.transaction(async (tx) =>
      saveInterviewConversationProgressTx(tx, {
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
      }),
    );

    // The tx handle's update runs, not the top-level db.update.
    expect(txUpdateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
