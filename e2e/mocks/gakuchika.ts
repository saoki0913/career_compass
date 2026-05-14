import type { Page } from "@playwright/test";
import {
  buildConversationStream,
  buildSseStream,
  buildStringChunkEvents,
  buildFieldCompleteEvent,
  buildCompleteEvent,
  mockSseRoute,
  mockJsonRoute,
} from "./sse-helpers";

export const GAKUCHIKA_MOCK_ID = "gakuchika-mock-id";

const DEFAULT_CONVERSATION_STATE = {
  stage: "es_building",
  focus_key: "action",
  coach_progress_message: "あと1問で材料が揃いそうです。",
  remaining_questions_estimate: 1,
  ready_for_draft: false,
  draft_readiness_reason: null,
};

export function buildGakuchikaQuestionStream(opts?: {
  question?: string;
  conversationState?: Record<string, unknown>;
  nextAction?: string;
}): string {
  const question = opts?.question ?? "その経験で最も工夫した点を教えてください。";
  const completeData = {
    question,
    conversation_state: opts?.conversationState ?? DEFAULT_CONVERSATION_STATE,
    next_action: opts?.nextAction ?? "continue",
  };

  return buildSseStream([
    ...buildStringChunkEvents("question", question),
    buildFieldCompleteEvent("focus_key", "action"),
    buildFieldCompleteEvent("progress_label", "行動の深掘り中"),
    buildFieldCompleteEvent("remaining_questions_estimate", 1),
    buildCompleteEvent(completeData),
  ]);
}

export function buildGakuchikaDraftReadyStream(): string {
  const question = "材料が揃いました。「ES下書きを生成」ボタンで下書きを作成できます。";
  return buildConversationStream({
    questionText: question,
    completeData: {
      question,
      conversation_state: {
        ...DEFAULT_CONVERSATION_STATE,
        ready_for_draft: true,
        draft_readiness_reason: "STAR要素がすべて揃いました",
        remaining_questions_estimate: 0,
      },
      next_action: "show_generate_draft_cta",
    },
    fieldCompletes: [
      { path: "ready_for_draft", value: true },
      { path: "draft_readiness_reason", value: "STAR要素がすべて揃いました" },
      { path: "remaining_questions_estimate", value: 0 },
    ],
  });
}

const STRUCTURED_SUMMARY = {
  situation_text: "大学3年時にサークルの運営改善に取り組んだ。",
  task_text: "参加率が前年比30%低下という課題があった。",
  action_text: "メンバーへのヒアリングを実施し、活動内容を刷新した。",
  result_text: "参加率が前年比20%向上し、新規メンバーも5名増加した。",
  strengths: [{ title: "傾聴力", description: "メンバーの声を丁寧に拾い上げた" }],
  learnings: [{ title: "巻き込み力", description: "多様な立場の人を巻き込む重要性を学んだ" }],
  numbers: ["参加率20%向上", "新規5名増"],
  one_line_core_answer: "傾聴と改善提案でチームの参加率を回復させた経験",
  two_minute_version_outline: ["状況説明", "課題特定", "施策実行", "成果"],
  likely_followup_questions: ["困難にどう対処したか", "チームメンバーの反応は"],
  weak_points_to_prepare: ["数字の根拠をもう少し具体的に"],
  interviewer_hooks: ["リーダーシップ", "課題解決力"],
  reusable_principles: ["現場の声を聴く姿勢"],
  interview_supporting_details: ["ヒアリングシートの設計"],
  future_outlook_notes: ["入社後もチームの声を活かしたい"],
  backstory_notes: ["サークル副代表としての責任感"],
};

export async function mockGakuchikaApis(
  page: Page,
  gakuchikaId: string = GAKUCHIKA_MOCK_ID,
): Promise<void> {
  await mockJsonRoute(page, `**/api/gakuchika/${gakuchikaId}`, {
    id: gakuchikaId,
    title: "サークル運営改善",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  });

  await mockJsonRoute(page, `**/api/gakuchika/${gakuchikaId}/conversation`, {
    messages: [
      { id: "a-1", role: "assistant", content: "学生時代に力を入れたことを教えてください。" },
    ],
    conversationState: DEFAULT_CONVERSATION_STATE,
    structuredSummary: null,
  });

  await mockSseRoute(
    page,
    `**/api/gakuchika/${gakuchikaId}/next-question/stream`,
    buildGakuchikaQuestionStream(),
  );

  await mockJsonRoute(
    page,
    `**/api/gakuchika/${gakuchikaId}/generate-draft`,
    { structuredSummary: STRUCTURED_SUMMARY, documentId: "doc-gakuchika-mock" },
    "POST",
  );
}
