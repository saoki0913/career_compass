import { beforeEach, describe, expect, it, vi } from "vitest";

type TestMessage = { id: string; role: "user" | "assistant"; content: string };
type TestState = {
  stage: "deep_dive_active" | "interview_ready";
  draftText: string | null;
  pausedQuestion: string | null;
};
type TestContext = {
  gakuchikaId: string;
  userId: string;
  conversationId: string;
  messages: TestMessage[];
  newQC: number;
  shouldConsumeCredit: boolean;
  streamedQ: string;
  stateMachine: {
    getMergedState: () => TestState;
    processEvent: (event: Record<string, unknown>) => void;
  };
  billingOutcomeStatus: "success" | "failed" | "cancelled" | null;
  creditsAppliedForSummary: number;
};
type CapturedStreamConfig = {
  onComplete: (
    ctx: TestContext,
    event: Record<string, unknown>,
    meta: { telemetry: null; identity: { userId: string; guestId: null } },
  ) => Promise<{ replaceEvent?: Record<string, unknown>; cancel?: boolean } | void>;
  onStreamError: (ctx: TestContext) => Promise<void>;
  onFinally: (
    ctx: TestContext,
    summary: {
      success: boolean;
      errorSeen: boolean;
      telemetry: null;
      identity: { userId: string; guestId: null };
    },
  ) => Promise<void>;
};

const mocks = vi.hoisted(() => {
  // Optimistic-locked UPDATE: .returning() resolves to the claimed rows.
  const returningMock = vi.fn().mockResolvedValue([{ id: "conv-1" }]);
  const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
  const setMock = vi.fn().mockReturnValue({ where: whereMock });
  const updateMock = vi.fn().mockReturnValue({ set: setMock });
  const txMock = { update: updateMock };
  const transactionMock = vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock));

  return {
    capturedConfig: undefined as CapturedStreamConfig | undefined,
    updateMock,
    setMock,
    whereMock,
    returningMock,
    transactionMock,
    txMock,
    confirmInTxMock: vi.fn().mockResolvedValue(undefined),
    cancelMock: vi.fn().mockResolvedValue(undefined),
    logAiCreditCostSummaryMock: vi.fn(),
    incrementDailyTokenCountMock: vi.fn(),
    computeTotalTokensMock: vi.fn().mockReturnValue(12),
    serializeConversationStateMock: vi.fn().mockReturnValue("{}"),
  };
});

vi.mock("@/bff/api/stream-handler", () => ({
  createConversationStreamHandler: vi.fn((config: CapturedStreamConfig) => {
    mocks.capturedConfig = config;
    return vi.fn();
  }),
}));
vi.mock("@/lib/db", () => ({
  db: {
    update: mocks.updateMock,
    transaction: mocks.transactionMock,
  },
}));
vi.mock("@/lib/db/schema", () => ({
  gakuchikaContents: {},
  gakuchikaConversations: {
    id: "id",
  },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn().mockReturnValue({ op: "and" }),
  eq: vi.fn().mockReturnValue({ op: "eq" }),
  desc: vi.fn().mockReturnValue({ op: "desc" }),
}));
vi.mock("@/lib/credits", () => ({
  CONVERSATION_CREDITS_PER_TURN: 1,
}));
vi.mock("@/bff/billing/gakuchika-stream-policy", () => ({
  gakuchikaStreamPolicy: {
    precheck: vi.fn().mockResolvedValue({ ok: true, freeQuotaAvailable: false }),
    confirmInTx: mocks.confirmInTxMock,
    cancel: mocks.cancelMock,
  },
}));
vi.mock("@/bff/gakuchika", () => ({
  getGakuchikaNextAction: vi.fn().mockReturnValue("ask"),
  isInterviewReady: vi.fn().mockReturnValue(false),
  safeParseConversationState: vi.fn().mockReturnValue({
    stage: "deep_dive_active",
    draftText: null,
    pausedQuestion: null,
  }),
  safeParseMessages: vi.fn().mockReturnValue([]),
  serializeConversationState: mocks.serializeConversationStateMock,
}));
vi.mock("@/lib/server/loader-helpers", () => ({
  getViewerPlan: vi.fn().mockResolvedValue("free"),
}));
vi.mock("@/lib/ai/cost-summary-log", () => ({
  logAiCreditCostSummary: mocks.logAiCreditCostSummaryMock,
}));
vi.mock("@/lib/llm-cost-limit", () => ({
  incrementDailyTokenCount: mocks.incrementDailyTokenCountMock,
  computeTotalTokens: mocks.computeTotalTokensMock,
}));
vi.mock("@/lib/gakuchika/stream-state-machine", () => ({
  createGakuchikaStreamStateMachine: vi.fn(),
}));
vi.mock("@/bff/api/error-response", () => ({
  createApiErrorResponse: vi.fn(
    (_request: Request, options: { status: number; code: string }) =>
      new Response(JSON.stringify({ error: options.code }), { status: options.status }),
  ),
}));

function makeContext(): TestContext {
  return {
    gakuchikaId: "gaku-1",
    userId: "user-1",
    conversationId: "conv-1",
    messages: [
      { id: "m1", role: "assistant", content: "前の質問" },
      { id: "m2", role: "user", content: "回答" },
    ],
    newQC: 2,
    shouldConsumeCredit: true,
    streamedQ: "",
    stateMachine: {
      getMergedState: () => ({
        stage: "deep_dive_active",
        draftText: null,
        pausedQuestion: null,
      }),
      processEvent: vi.fn(),
    },
    billingOutcomeStatus: null,
    creditsAppliedForSummary: 0,
  };
}

function getConfig(): CapturedStreamConfig {
  const config = mocks.capturedConfig;
  if (!config) {
    throw new Error("stream config was not captured");
  }
  return config;
}

describe("gakuchika stream route", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.returningMock.mockResolvedValue([{ id: "conv-1" }]);
    mocks.whereMock.mockReturnValue({ returning: mocks.returningMock });
    mocks.setMock.mockReturnValue({ where: mocks.whereMock });
    mocks.updateMock.mockReturnValue({ set: mocks.setMock });
    mocks.transactionMock.mockImplementation(async (fn: (tx: typeof mocks.txMock) => Promise<unknown>) => fn(mocks.txMock));
    mocks.confirmInTxMock.mockResolvedValue(undefined);
    mocks.cancelMock.mockResolvedValue(undefined);
    mocks.computeTotalTokensMock.mockReturnValue(12);
    mocks.serializeConversationStateMock.mockReturnValue("{}");
    await import("./route");
  });

  it("exports POST handler", async () => {
    const mod = await import("./route");
    expect(typeof mod.POST).toBe("function");
  });

  it("refunds with a cancel error event when billing confirm fails inside the persist transaction", async () => {
    const config = getConfig();
    const ctx = makeContext();
    // confirmInTx throws on a failed claim, rolling back the conversation update.
    mocks.confirmInTxMock.mockRejectedValue(new Error("billing confirm failed"));

    const result = await config.onComplete(
      ctx,
      {
        data: {
          question: "次の質問",
          conversation_state: { stage: "deep_dive_active" },
        },
      },
      { telemetry: null, identity: { userId: "user-1", guestId: null } },
    );

    // Persist + confirm ran inside one transaction; confirm used the tx handle.
    expect(mocks.transactionMock).toHaveBeenCalledOnce();
    expect(mocks.updateMock).toHaveBeenCalled();
    expect(mocks.confirmInTxMock).toHaveBeenCalledOnce();
    expect(mocks.confirmInTxMock.mock.calls[0]?.[0]).toBe(mocks.txMock);
    // A saved-but-uncharged turn is never delivered: complete is replaced by an
    // error event with cancel:true so sse-proxy refunds.
    expect(result?.replaceEvent?.type).toBe("error");
    expect(result?.cancel).toBe(true);
    expect(ctx.billingOutcomeStatus).toBe("failed");
    expect(ctx.creditsAppliedForSummary).toBe(0);

    await config.onFinally(ctx, {
      success: true,
      errorSeen: false,
      telemetry: null,
      identity: { userId: "user-1", guestId: null },
    });
    expect(mocks.logAiCreditCostSummaryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "gakuchika",
        status: "failed",
        creditsUsed: 0,
      }),
    );
  });

  it("refunds with a reload prompt when the optimistic lock matches no rows", async () => {
    const config = getConfig();
    const ctx = makeContext();
    // Stale conversation: the optimistic-locked UPDATE claims 0 rows.
    mocks.returningMock.mockResolvedValue([]);

    const result = await config.onComplete(
      ctx,
      {
        data: {
          question: "次の質問",
          conversation_state: { stage: "deep_dive_active" },
        },
      },
      { telemetry: null, identity: { userId: "user-1", guestId: null } },
    );

    expect(result?.replaceEvent?.type).toBe("error");
    expect(result?.replaceEvent?.message).toContain("別のタブ");
    expect(result?.cancel).toBe(true);
    // No charge is attempted when the conversation moved on.
    expect(mocks.confirmInTxMock).not.toHaveBeenCalled();
    expect(ctx.billingOutcomeStatus).toBe("failed");
  });

  it("logs consumed credits only after billing confirm succeeds inside the transaction", async () => {
    const config = getConfig();
    const ctx = makeContext();

    const result = await config.onComplete(
      ctx,
      {
        data: {
          question: "次の質問",
          conversation_state: { stage: "deep_dive_active" },
        },
      },
      { telemetry: null, identity: { userId: "user-1", guestId: null } },
    );
    await config.onFinally(ctx, {
      success: true,
      errorSeen: false,
      telemetry: null,
      identity: { userId: "user-1", guestId: null },
    });

    expect(mocks.transactionMock).toHaveBeenCalledOnce();
    expect(mocks.confirmInTxMock).toHaveBeenCalledOnce();
    expect(mocks.confirmInTxMock.mock.calls[0]?.[0]).toBe(mocks.txMock);
    expect(result?.replaceEvent?.type).toBe("complete");
    expect(ctx.billingOutcomeStatus).toBe("success");
    expect(ctx.creditsAppliedForSummary).toBe(1);
    expect(mocks.logAiCreditCostSummaryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "gakuchika",
        status: "success",
        creditsUsed: 1,
      }),
    );
  });

  it("marks upstream stream errors as failed for final telemetry", async () => {
    const config = getConfig();
    const ctx = makeContext();

    await config.onStreamError(ctx);
    await config.onFinally(ctx, {
      success: false,
      errorSeen: true,
      telemetry: null,
      identity: { userId: "user-1", guestId: null },
    });

    expect(ctx.billingOutcomeStatus).toBe("failed");
    expect(mocks.logAiCreditCostSummaryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "gakuchika",
        status: "failed",
        creditsUsed: 0,
      }),
    );
  });
});
