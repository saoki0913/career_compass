import { DEFAULT_INTERVIEW_SESSION_CREDIT_COST } from "@/lib/credits";
import { SSE_RESPONSE_HEADERS } from "@/lib/fastapi/stream-config";
import type {
  InterviewFeedback,
  InterviewMessage,
  InterviewShortCoaching,
} from "@/lib/interview/conversation";
import type {
  InterviewPlan,
  InterviewStageStatus,
  InterviewTurnMeta,
  InterviewTurnState,
} from "@/lib/interview/session";
import type { InterviewFeedbackHistoryItem } from ".";

export type UpstreamCompleteData = {
  question?: string;
  transition_line?: string | null;
  focus?: string | null;
  question_stage?: string | null;
  stage_status?: InterviewStageStatus | null;
  question_flow_completed?: boolean;
  turn_state?: Partial<InterviewTurnState> | null;
  turn_meta?: Partial<InterviewTurnMeta> | null;
  interview_plan?: InterviewPlan | null;
  overall_comment?: string;
  scores?: InterviewFeedback["scores"];
  strengths?: string[];
  improvements?: string[];
  consistency_risks?: string[];
  weakest_question_type?: string | null;
  weakest_turn_id?: string | null;
  weakest_question_snapshot?: string | null;
  weakest_answer_snapshot?: string | null;
  improved_answer?: string;
  preparation_points?: string[];
  next_preparation?: string[];
  premise_consistency?: number;
  satisfaction_score?: number;
  prompt_version?: string | null;
  followup_policy_version?: string | null;
  case_seed_version?: string | null;
  short_coaching?: InterviewShortCoaching | null;
};

export type InterviewClientCompleteData = {
  messages: InterviewMessage[];
  questionCount: number;
  stageStatus: InterviewStageStatus | null;
  questionStage: string | null;
  focus: string | null;
  feedback: InterviewFeedback | null;
  questionFlowCompleted: boolean;
  creditCost: number;
  turnState: InterviewTurnState | null;
  turnMeta?: InterviewTurnMeta | null;
  plan?: InterviewPlan | null;
  transitionLine?: string | null;
  feedbackHistories?: InterviewFeedbackHistoryItem[];
  shortCoaching?: InterviewShortCoaching | null;
};

export function createImmediateInterviewStream(data: InterviewClientCompleteData) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "complete",
            data: {
              ...data,
              creditCost: data.creditCost ?? DEFAULT_INTERVIEW_SESSION_CREDIT_COST,
            },
          })}\n\n`,
        ),
      );
      controller.close();
    },
  });

  return new Response(stream, { headers: SSE_RESPONSE_HEADERS });
}

export function normalizeFeedback(data: UpstreamCompleteData): InterviewFeedback {
  return {
    overall_comment: typeof data.overall_comment === "string" ? data.overall_comment : "",
    scores: data.scores || {},
    strengths: Array.isArray(data.strengths) ? data.strengths : [],
    improvements: Array.isArray(data.improvements) ? data.improvements : [],
    consistency_risks: Array.isArray(data.consistency_risks) ? data.consistency_risks : [],
    weakest_question_type:
      typeof data.weakest_question_type === "string" ? data.weakest_question_type : null,
    weakest_turn_id:
      typeof data.weakest_turn_id === "string" ? data.weakest_turn_id : null,
    weakest_question_snapshot:
      typeof data.weakest_question_snapshot === "string" ? data.weakest_question_snapshot : null,
    weakest_answer_snapshot:
      typeof data.weakest_answer_snapshot === "string" ? data.weakest_answer_snapshot : null,
    improved_answer:
      typeof data.improved_answer === "string" ? data.improved_answer : "",
    next_preparation: Array.isArray(data.next_preparation)
      ? data.next_preparation
      : Array.isArray(data.preparation_points)
        ? data.preparation_points
        : [],
    premise_consistency:
      typeof data.premise_consistency === "number" ? data.premise_consistency : undefined,
    satisfaction_score:
      typeof data.satisfaction_score === "number" ? data.satisfaction_score : undefined,
  };
}
