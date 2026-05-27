import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
const txInsertMock = vi.fn();

function createChainMock(terminal: () => Promise<unknown>) {
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  chain.values = vi.fn(() => terminal());
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => terminal());
  return chain;
}

vi.mock("@/lib/db", () => {
  const insertChain = createChainMock(() => Promise.resolve([]));
  const txInsertChain = createChainMock(() => Promise.resolve([]));
  const tx: Record<string, unknown> = {
    insert: () => {
      txInsertMock();
      return txInsertChain;
    },
  };
  return {
    db: {
      insert: () => {
        insertMock();
        return insertChain;
      },
      select: () => createChainMock(() => Promise.resolve([])),
      transaction: (fn: (txHandle: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});

vi.mock("@/lib/db/schema", () => ({
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

const baseArgs = {
  conversationId: "conv-1",
  companyId: "company-1",
  identity: { userId: "user-1", guestId: null },
  turnId: "turn-1",
  question: "Q?",
  answer: "A.",
  questionType: "intro",
  turnState: {
    turnCount: 1,
    currentTopic: "intro",
    coverageState: [],
    coveredTopics: [],
    remainingTopics: [],
    recentQuestionSummariesV2: [],
    formatPhase: "opening" as const,
    lastQuestion: null,
    lastAnswer: null,
    lastTopic: null,
    currentTurnMeta: null,
    nextAction: "ask" as const,
  },
  turnMeta: null,
};

describe("interview turn-event persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saveInterviewTurnEvent inserts inside a db.transaction (via the tx handle)", async () => {
    const { saveInterviewTurnEvent } = await import("./persistence-turn-events");
    await saveInterviewTurnEvent(baseArgs);
    // The wrapper delegates to db.transaction, so the insert runs on the tx handle.
    expect(txInsertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("saveInterviewTurnEventTx inserts on the passed transaction handle", async () => {
    const { saveInterviewTurnEventTx } = await import("./persistence-turn-events");
    const { db } = await import("@/lib/db");
    await db.transaction(async (tx) => saveInterviewTurnEventTx(tx, baseArgs));
    expect(txInsertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).not.toHaveBeenCalled();
  });
});
