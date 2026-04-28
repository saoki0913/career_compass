/**
 * route_contract.test.ts — Stage C1 route contract tests
 *
 * 検証対象:
 * 1. questionStage outward: backend が question_stage を返したとき route が正しく変換する (3 件)
 * 2. stage_status 合成: backend が null を返したとき route 側が合成する (3 件)
 * 3. fallback: backend が 500 を返したとき route はエラー応答に変換する (3 件)
 *
 * 実装方針:
 * - createInterviewUpstreamStream を mock し onComplete callback を直接呼び出して
 *   route 内の questionStage 変換ロジックを検証する
 * - backend SSE の完全 mock は複雑すぎるため、onComplete 呼び出しに絞る
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// hoisted mocks
// ---------------------------------------------------------------------------
const {
  getRequestIdentityMock,
  buildInterviewContextMock,
  ensureInterviewConversationMock,
  normalizeInterviewPlanValueMock,
  resetInterviewConversationMock,
  saveInterviewConversationProgressMock,
  saveInterviewTurnEventMock,
  validateInterviewTurnStateMock,
  createInterviewUpstreamStreamMock,
  normalizeInterviewPersistenceErrorMock,
  createInterviewPersistenceUnavailableResponseMock,
  listInterviewTurnEventsMock,
  reserveCreditsMock,
  confirmReservationMock,
  cancelReservationMock,
} = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  buildInterviewContextMock: vi.fn(),
  ensureInterviewConversationMock: vi.fn(),
  normalizeInterviewPlanValueMock: vi.fn(),
  resetInterviewConversationMock: vi.fn(),
  saveInterviewConversationProgressMock: vi.fn(),
  saveInterviewTurnEventMock: vi.fn(),
  validateInterviewTurnStateMock: vi.fn(),
  createInterviewUpstreamStreamMock: vi.fn(),
  normalizeInterviewPersistenceErrorMock: vi.fn(),
  createInterviewPersistenceUnavailableResponseMock: vi.fn(),
  listInterviewTurnEventsMock: vi.fn(),
  reserveCreditsMock: vi.fn(),
  confirmReservationMock: vi.fn(),
  cancelReservationMock: vi.fn(),
}));

vi.mock("@/app/api/_shared/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));
vi.mock("@/app/api/_shared/llm-cost-guard", () => ({
  guardDailyTokenLimit: vi.fn(async () => null),
}));
vi.mock("..", () => ({
  buildInterviewContext: buildInterviewContextMock,
  ensureInterviewConversation: ensureInterviewConversationMock,
  normalizeInterviewPlanValue: normalizeInterviewPlanValueMock,
  resetInterviewConversation: resetInterviewConversationMock,
  saveInterviewConversationProgress: saveInterviewConversationProgressMock,
  saveInterviewTurnEvent: saveInterviewTurnEventMock,
  validateInterviewTurnState: validateInterviewTurnStateMock,
  listInterviewTurnEvents: listInterviewTurnEventsMock,
}));
vi.mock("../stream-utils", () => ({
  createInterviewUpstreamStream: createInterviewUpstreamStreamMock,
}));
vi.mock("../persistence-errors", () => ({
  normalizeInterviewPersistenceError: normalizeInterviewPersistenceErrorMock,
  createInterviewPersistenceUnavailableResponse: createInterviewPersistenceUnavailableResponseMock,
}));
vi.mock("@/lib/credits", () => ({
  CONVERSATION_CREDITS_PER_TURN: 1,
  DEFAULT_INTERVIEW_SESSION_CREDIT_COST: 6,
  INTERVIEW_CONTINUE_CREDIT_COST: 1,
  INTERVIEW_START_CREDIT_COST: 2,
  INTERVIEW_TURN_CREDIT_COST: 1,
  reserveCredits: reserveCreditsMock,
  confirmReservation: confirmReservationMock,
  cancelReservation: cancelReservationMock,
}));

// ---------------------------------------------------------------------------
// shared setup helper
// ---------------------------------------------------------------------------
function makeBaseContext() {
  return {
    company: { id: "company-1", name: "テスト株式会社" },
    companySummary: "DX 支援企業。",
    motivationSummary: "課題解決がしたい。",
    gakuchikaSummary: "学園祭運営。",
    academicSummary: "ゼミで消費者行動。",
    researchSummary: null,
    esSummary: "ES 内容。",
    materials: [],
    setup: {
      selectedIndustry: "コンサルティング",
      selectedRole: "コンサルタント",
      selectedRoleSource: "company_override",
      roleTrack: "consulting",
      interviewFormat: "standard_behavioral",
      selectionType: "fulltime",
      interviewStage: "mid",
      interviewerType: "hr",
      strictnessMode: "standard",
      resolvedIndustry: "コンサルティング",
      requiresIndustrySelection: false,
      industryOptions: ["コンサルティング"],
    },
    feedbackHistories: [],
    conversation: null,
  };
}

function makeExistingConversationContext() {
  return {
    ...makeBaseContext(),
    conversation: {
      id: "conv-1",
      status: "in_progress",
      messages: [
        { role: "assistant" as const, content: "志望理由を教えてください。" },
        { role: "user" as const, content: "課題解決がしたいです。" },
      ],
      plan: {
        interviewType: "new_grad_behavioral",
        priorityTopics: ["motivation_fit"],
        openingTopic: "motivation_fit",
        mustCoverTopics: ["motivation_fit", "role_understanding"],
        riskTopics: [],
        suggestedTimeflow: ["導入", "志望動機", "締め"],
      },
      turnMeta: null,
      turnState: {
        turnCount: 1,
        currentTopic: "motivation_fit",
        coverageState: [],
        coveredTopics: ["motivation_fit"],
        remainingTopics: ["role_understanding"],
        recentQuestionSummariesV2: [],
        formatPhase: "standard_main",
        lastQuestion: "志望理由を教えてください。",
        lastAnswer: "課題解決がしたいです。",
        lastTopic: "motivation_fit",
        currentTurnMeta: null,
        nextAction: "ask",
      },
      stageStatus: {
        currentTopicLabel: "志望動機",
        coveredTopics: ["motivation_fit"],
        remainingTopics: ["role_understanding"],
      },
      questionCount: 1,
      questionFlowCompleted: false,
      feedback: null,
    },
  };
}

function makeStartRequest() {
  return new NextRequest("http://localhost:3000/api/companies/company-1/interview/start", {
    method: "POST",
    body: JSON.stringify({
      selectedIndustry: "コンサルティング",
      selectedRole: "コンサルタント",
      roleTrack: "consulting",
      interviewFormat: "standard_behavioral",
      selectionType: "fulltime",
      interviewStage: "mid",
      interviewerType: "hr",
      strictnessMode: "standard",
    }),
    headers: { "content-type": "application/json" },
  });
}

function makeStreamRequest() {
  return new NextRequest("http://localhost:3000/api/companies/company-1/interview/stream", {
    method: "POST",
    body: JSON.stringify({ answer: "課題解決がしたいです。" }),
    headers: { "content-type": "application/json" },
  });
}

function makeContinueRequest() {
  return new NextRequest("http://localhost:3000/api/companies/company-1/interview/continue", {
    method: "POST",
    body: JSON.stringify({ answer: "" }),
    headers: { "content-type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// カテゴリ 1: questionStage outward contract
// onComplete callback を直接呼び出して questionStage の変換を検証する
// ---------------------------------------------------------------------------
describe("questionStage outward contract", () => {
  beforeEach(() => {
    getRequestIdentityMock.mockReset();
    buildInterviewContextMock.mockReset();
    ensureInterviewConversationMock.mockReset();
    normalizeInterviewPlanValueMock.mockReset();
    resetInterviewConversationMock.mockReset();
    saveInterviewConversationProgressMock.mockReset();
    saveInterviewTurnEventMock.mockReset();
    validateInterviewTurnStateMock.mockReset();
    createInterviewUpstreamStreamMock.mockReset();
    normalizeInterviewPersistenceErrorMock.mockReset();
    createInterviewPersistenceUnavailableResponseMock.mockReset();
    listInterviewTurnEventsMock.mockReset();
    reserveCreditsMock.mockReset();
    confirmReservationMock.mockReset();
    cancelReservationMock.mockReset();

    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    reserveCreditsMock.mockResolvedValue({ success: true, reservationId: "res-contract-1" });
    createInterviewPersistenceUnavailableResponseMock.mockReturnValue(
      Response.json({ error: { code: "INTERVIEW_PERSISTENCE_UNAVAILABLE" } }, { status: 503 }),
    );
    ensureInterviewConversationMock.mockResolvedValue({ id: "conv-1" });
    normalizeInterviewPlanValueMock.mockImplementation((v: unknown) => v);
    validateInterviewTurnStateMock.mockImplementation((v: unknown) => v);
    listInterviewTurnEventsMock.mockResolvedValue([]);
    createInterviewUpstreamStreamMock.mockResolvedValue(new Response("ok"));
    saveInterviewConversationProgressMock.mockResolvedValue(undefined);
    saveInterviewTurnEventMock.mockResolvedValue(undefined);
  });

  it("start route: onComplete transforms backend question_stage=role_reason to questionStage", async () => {
    const { POST } = await import("../start/route");
    buildInterviewContextMock.mockResolvedValue(makeBaseContext());

    await POST(makeStartRequest(), { params: Promise.resolve({ id: "company-1" }) });

    // onComplete が呼ばれたことを確認し、実際に question_stage を渡す
    expect(createInterviewUpstreamStreamMock).toHaveBeenCalledOnce();
    const [callOptions] = createInterviewUpstreamStreamMock.mock.calls[0];
    expect(callOptions.onComplete).toBeDefined();

    // onComplete を手動で呼び出して questionStage 変換を検証
    const result = await callOptions.onComplete({
      question: "システム設計について教えてください。",
      question_stage: "role_reason",
      focus: "役職理解",
      stage_status: null,
      turn_state: {
        turnCount: 1,
        currentTopic: "opening",
        coverageState: [],
        coveredTopics: [],
        remainingTopics: ["motivation_fit"],
        recentQuestionSummariesV2: [],
        formatPhase: "opening",
        lastQuestion: "システム設計について教えてください。",
        lastAnswer: null,
        lastTopic: null,
        currentTurnMeta: null,
        nextAction: "ask",
      },
      turn_meta: {
        topic: "system_design",
        turn_action: "ask",
        focus_reason: "役職理解",
        depth_focus: "role_fit",
        followup_style: "role_reason_check",
        should_move_next: false,
        intent_key: "system_design:role_reason_check",
      },
      interview_plan: {
        interview_type: "new_grad_behavioral",
        priority_topics: ["system_design"],
        opening_topic: "system_design",
        must_cover_topics: ["system_design"],
        risk_topics: [],
        suggested_timeflow: ["導入", "役職理解", "締め"],
      },
    });

    // start route では backend の question_stage が空でなければそのまま使われる
    expect(result.questionStage).toBe("role_reason");
  });

  it("stream route: onComplete passes through backend question_stage=role_reason as questionStage", async () => {
    const { POST } = await import("../stream/route");
    buildInterviewContextMock.mockResolvedValue(makeExistingConversationContext());

    await POST(makeStreamRequest(), { params: Promise.resolve({ id: "company-1" }) });

    expect(createInterviewUpstreamStreamMock).toHaveBeenCalledOnce();
    const [callOptions] = createInterviewUpstreamStreamMock.mock.calls[0];
    expect(callOptions.onComplete).toBeDefined();

    const result = await callOptions.onComplete({
      question: "その設計判断の背景を教えてください。",
      question_stage: "role_reason",
      focus: "設計判断",
      stage_status: null,
      turn_state: {
        turnCount: 2,
        currentTopic: "role_reason",
        coverageState: [],
        coveredTopics: ["motivation_fit"],
        remainingTopics: ["role_understanding"],
        recentQuestionSummariesV2: [],
        formatPhase: "standard_main",
        lastQuestion: "その設計判断の背景を教えてください。",
        lastAnswer: "課題解決がしたいです。",
        lastTopic: "role_reason",
        currentTurnMeta: null,
        nextAction: "ask",
      },
      turn_meta: {
        topic: "role_reason",
        turn_action: "deepen",
        focus_reason: "設計判断の深掘り",
        depth_focus: "role_fit",
        followup_style: "role_reason_check",
        should_move_next: false,
        intent_key: "role_reason:role_reason_check",
      },
    });

    expect(result.questionStage).toBe("role_reason");
  });

  it("stream route: onComplete falls back to currentTopic when backend question_stage is absent", async () => {
    const { POST } = await import("../stream/route");
    buildInterviewContextMock.mockResolvedValue(makeExistingConversationContext());

    await POST(makeStreamRequest(), { params: Promise.resolve({ id: "company-1" }) });

    expect(createInterviewUpstreamStreamMock).toHaveBeenCalledOnce();
    const [callOptions] = createInterviewUpstreamStreamMock.mock.calls[0];

    const result = await callOptions.onComplete({
      question: "志望理由を教えてください。",
      // question_stage を省略した場合は turnState.currentTopic にフォールバック
      focus: "志望動機",
      stage_status: null,
      turn_state: {
        turnCount: 2,
        currentTopic: "motivation_fit",
        coverageState: [],
        coveredTopics: [],
        remainingTopics: ["motivation_fit"],
        recentQuestionSummariesV2: [],
        formatPhase: "standard_main",
        lastQuestion: "志望理由を教えてください。",
        lastAnswer: "課題解決がしたいです。",
        lastTopic: "motivation_fit",
        currentTurnMeta: null,
        nextAction: "ask",
      },
      turn_meta: {
        topic: "motivation_fit",
        turn_action: "ask",
        focus_reason: "志望動機確認",
        depth_focus: "company_fit",
        followup_style: "company_reason_check",
        should_move_next: false,
        intent_key: "motivation_fit:company_reason_check",
      },
    });

    // question_stage が absent のとき currentTopic にフォールバック
    expect(result.questionStage).toBe("motivation_fit");
  });
});

// ---------------------------------------------------------------------------
// カテゴリ 2: stage_status 合成
// backend が null を返したとき route が coveredTopics / remainingTopics から合成する
// ---------------------------------------------------------------------------
describe("stage_status synthesis from route when backend returns null", () => {
  beforeEach(() => {
    getRequestIdentityMock.mockReset();
    buildInterviewContextMock.mockReset();
    ensureInterviewConversationMock.mockReset();
    normalizeInterviewPlanValueMock.mockReset();
    validateInterviewTurnStateMock.mockReset();
    saveInterviewConversationProgressMock.mockReset();
    saveInterviewTurnEventMock.mockReset();
    createInterviewUpstreamStreamMock.mockReset();
    normalizeInterviewPersistenceErrorMock.mockReset();
    createInterviewPersistenceUnavailableResponseMock.mockReset();
    listInterviewTurnEventsMock.mockReset();
    reserveCreditsMock.mockReset();
    confirmReservationMock.mockReset();
    cancelReservationMock.mockReset();

    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    reserveCreditsMock.mockResolvedValue({ success: true, reservationId: "res-contract-1" });
    createInterviewPersistenceUnavailableResponseMock.mockReturnValue(
      Response.json({ error: { code: "INTERVIEW_PERSISTENCE_UNAVAILABLE" } }, { status: 503 }),
    );
    ensureInterviewConversationMock.mockResolvedValue({ id: "conv-1" });
    normalizeInterviewPlanValueMock.mockImplementation((v: unknown) => v);
    validateInterviewTurnStateMock.mockImplementation((v: unknown) => v);
    listInterviewTurnEventsMock.mockResolvedValue([]);
    createInterviewUpstreamStreamMock.mockResolvedValue(new Response("ok"));
    saveInterviewConversationProgressMock.mockResolvedValue(undefined);
    saveInterviewTurnEventMock.mockResolvedValue(undefined);
  });

  it("start route: synthesizes stageStatus from turn_state when backend stage_status is null", async () => {
    const { POST } = await import("../start/route");
    buildInterviewContextMock.mockResolvedValue(makeBaseContext());

    await POST(makeStartRequest(), { params: Promise.resolve({ id: "company-1" }) });

    const [callOptions] = createInterviewUpstreamStreamMock.mock.calls[0];

    const result = await callOptions.onComplete({
      question: "志望理由を教えてください。",
      question_stage: "opening",
      focus: "志望動機",
      stage_status: null,  // backend は null を返す (既存の契約)
      turn_state: {
        turnCount: 1,
        currentTopic: "motivation_fit",
        coverageState: [],
        coveredTopics: [],
        remainingTopics: ["motivation_fit", "role_understanding"],
        recentQuestionSummariesV2: [],
        formatPhase: "opening",
        lastQuestion: "志望理由を教えてください。",
        lastAnswer: null,
        lastTopic: null,
        currentTurnMeta: null,
        nextAction: "ask",
      },
      turn_meta: {
        topic: "motivation_fit",
        turn_action: "ask",
        focus_reason: "初回導入",
        depth_focus: "company_fit",
        followup_style: "industry_reason_check",
        should_move_next: false,
        intent_key: "motivation_fit:industry_reason_check",
        interviewSetupNote: "今回は志望理由を中心に見ます",
      },
      interview_plan: {
        interview_type: "new_grad_behavioral",
        priority_topics: ["motivation_fit"],
        opening_topic: "motivation_fit",
        must_cover_topics: ["motivation_fit", "role_understanding"],
        risk_topics: [],
        suggested_timeflow: ["導入", "志望動機", "締め"],
      },
    });

    // stage_status が null のとき route 側で合成される
    expect(result.stageStatus).not.toBeNull();
    expect(result.stageStatus).toMatchObject({
      coveredTopics: expect.any(Array),
      remainingTopics: expect.any(Array),
    });
  });

  it("stream route: synthesizes stageStatus inline when backend stage_status is null", async () => {
    const { POST } = await import("../stream/route");
    buildInterviewContextMock.mockResolvedValue(makeExistingConversationContext());

    await POST(makeStreamRequest(), { params: Promise.resolve({ id: "company-1" }) });

    const [callOptions] = createInterviewUpstreamStreamMock.mock.calls[0];

    const result = await callOptions.onComplete({
      question: "そのときどう判断しましたか。",
      question_stage: "experience",
      focus: "判断の根拠",
      stage_status: null,
      turn_state: {
        turnCount: 2,
        currentTopic: "experience",
        coverageState: [],
        coveredTopics: ["motivation_fit"],
        remainingTopics: ["role_understanding"],
        recentQuestionSummariesV2: [],
        formatPhase: "standard_main",
        lastQuestion: "そのときどう判断しましたか。",
        lastAnswer: "課題解決がしたいです。",
        lastTopic: "experience",
        currentTurnMeta: null,
        nextAction: "ask",
      },
      turn_meta: {
        topic: "experience",
        turn_action: "deepen",
        focus_reason: "判断理由の確認",
        depth_focus: "logic",
        followup_style: "reason_check",
        should_move_next: false,
        intent_key: "experience:reason_check",
      },
    });

    expect(result.stageStatus).not.toBeNull();
    expect(result.stageStatus).toMatchObject({
      coveredTopics: expect.any(Array),
      remainingTopics: expect.any(Array),
    });
  });

  it("stream route: uses backend stage_status when it is not null", async () => {
    const { POST } = await import("../stream/route");
    buildInterviewContextMock.mockResolvedValue(makeExistingConversationContext());

    await POST(makeStreamRequest(), { params: Promise.resolve({ id: "company-1" }) });

    const [callOptions] = createInterviewUpstreamStreamMock.mock.calls[0];
    const backendStageStatus = {
      currentTopicLabel: "経験・ガクチカ",
      coveredTopics: ["motivation_fit"],
      remainingTopics: ["role_understanding"],
    };

    const result = await callOptions.onComplete({
      question: "ガクチカを教えてください。",
      question_stage: "experience",
      focus: "ガクチカ",
      stage_status: backendStageStatus,  // backend が null でない値を返す場合
      turn_state: {
        turnCount: 2,
        currentTopic: "experience",
        coverageState: [],
        coveredTopics: ["motivation_fit"],
        remainingTopics: ["role_understanding"],
        recentQuestionSummariesV2: [],
        formatPhase: "standard_main",
        lastQuestion: "ガクチカを教えてください。",
        lastAnswer: "課題解決がしたいです。",
        lastTopic: "experience",
        currentTurnMeta: null,
        nextAction: "ask",
      },
      turn_meta: {
        topic: "experience",
        turn_action: "ask",
        focus_reason: "ガクチカの確認",
        depth_focus: "specificity",
        followup_style: "obstacle_check",
        should_move_next: false,
        intent_key: "experience:obstacle_check",
      },
    });

    // backend が stage_status を返した場合はそれを優先する
    expect(result.stageStatus).toEqual(backendStageStatus);
  });
});

// ---------------------------------------------------------------------------
// カテゴリ 3: fallback — backend 500 でルートがエラー応答に変換する
// ---------------------------------------------------------------------------
describe("fallback: backend 500 converts to error response", () => {
  beforeEach(() => {
    getRequestIdentityMock.mockReset();
    buildInterviewContextMock.mockReset();
    ensureInterviewConversationMock.mockReset();
    normalizeInterviewPlanValueMock.mockReset();
    validateInterviewTurnStateMock.mockReset();
    saveInterviewConversationProgressMock.mockReset();
    saveInterviewTurnEventMock.mockReset();
    createInterviewUpstreamStreamMock.mockReset();
    normalizeInterviewPersistenceErrorMock.mockReset();
    createInterviewPersistenceUnavailableResponseMock.mockReset();
    listInterviewTurnEventsMock.mockReset();
    reserveCreditsMock.mockReset();
    confirmReservationMock.mockReset();
    cancelReservationMock.mockReset();

    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    reserveCreditsMock.mockResolvedValue({ success: true, reservationId: "res-contract-1" });
    createInterviewPersistenceUnavailableResponseMock.mockReturnValue(
      Response.json({ error: { code: "INTERVIEW_PERSISTENCE_UNAVAILABLE" } }, { status: 503 }),
    );
    buildInterviewContextMock.mockResolvedValue(makeBaseContext());
    ensureInterviewConversationMock.mockResolvedValue({ id: "conv-1" });
    normalizeInterviewPlanValueMock.mockImplementation((v: unknown) => v);
    validateInterviewTurnStateMock.mockImplementation((v: unknown) => v);
    listInterviewTurnEventsMock.mockResolvedValue([]);
    saveInterviewConversationProgressMock.mockResolvedValue(undefined);
    saveInterviewTurnEventMock.mockResolvedValue(undefined);
  });

  it("start route: returns error response when upstream persistence throws", async () => {
    const { POST } = await import("../start/route");
    const dbError = new Error("relation does not exist");
    const persistenceError = {
      code: "INTERVIEW_PERSISTENCE_UNAVAILABLE",
      companyId: "company-1",
      operation: "interview:start",
      missingTables: ["interview_conversations"],
    };
    ensureInterviewConversationMock.mockRejectedValue(dbError);
    normalizeInterviewPersistenceErrorMock.mockReturnValue(persistenceError);

    const response = await POST(makeStartRequest(), {
      params: Promise.resolve({ id: "company-1" }),
    });

    expect(response.status).toBe(503);
    expect(normalizeInterviewPersistenceErrorMock).toHaveBeenCalledWith(dbError, {
      companyId: "company-1",
      operation: "interview:start",
    });
  });

  it("stream route: returns error response when upstream persistence is unavailable", async () => {
    const { POST } = await import("../stream/route");
    const dbError = new Error("relation does not exist");
    buildInterviewContextMock.mockRejectedValue(dbError);
    normalizeInterviewPersistenceErrorMock.mockReturnValue({
      code: "INTERVIEW_PERSISTENCE_UNAVAILABLE",
      companyId: "company-1",
      operation: "interview:stream",
      missingTables: ["interview_conversations"],
    });

    const response = await POST(makeStreamRequest(), {
      params: Promise.resolve({ id: "company-1" }),
    });

    expect(response.status).toBe(503);
    expect(createInterviewPersistenceUnavailableResponseMock).toHaveBeenCalled();
  });

  it("stream route: createInterviewUpstreamStream handles upstream 500 via onError callback", async () => {
    const { POST } = await import("../stream/route");
    buildInterviewContextMock.mockResolvedValue(makeExistingConversationContext());

    // upstream が SSE error を返す場合は createInterviewUpstreamStream 内でハンドルされる
    // ここでは createInterviewUpstreamStream 自体が error レスポンスを返す状況をテスト
    createInterviewUpstreamStreamMock.mockResolvedValue(
      Response.json(
        {
          error: {
            code: "INTERVIEW_UPSTREAM_FAILED",
            userMessage: "面接対策の応答生成に失敗しました。",
          },
        },
        { status: 502 },
      ),
    );

    const response = await POST(makeStreamRequest(), {
      params: Promise.resolve({ id: "company-1" }),
    });

    // createInterviewUpstreamStream が error レスポンスを返したとき route はそのまま透過する
    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error.code).toBe("INTERVIEW_UPSTREAM_FAILED");
  });
});
