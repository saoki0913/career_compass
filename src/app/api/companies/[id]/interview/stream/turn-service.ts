import { INTERVIEW_TURN_CREDIT_COST } from "@/lib/credits";
import {
  normalizeInterviewTurnMeta,
  type InterviewPlan,
  type InterviewTurnMeta,
  type InterviewTurnState,
} from "@/lib/interview/session";
import { safeParseInterviewShortCoaching } from "@/lib/interview/conversation";
import type { RequestIdentity } from "@/app/api/_shared/request-identity";
import {
  buildInterviewContext,
  listInterviewTurnEvents,
  normalizeInterviewPlanValue,
  saveInterviewConversationProgress,
  saveInterviewTurnEvent,
  validateInterviewTurnState,
} from "..";
import type {
  InterviewClientCompleteData,
  UpstreamCompleteData,
} from "../stream-shared";

type InterviewContext = NonNullable<Awaited<ReturnType<typeof buildInterviewContext>>>;
type InterviewConversation = NonNullable<InterviewContext["conversation"]>;
type InterviewContextWithConversation = InterviewContext & { conversation: InterviewConversation };

export function buildSeedSummary(materials: Array<{ kind?: string; label: string; text: string }>) {
  return materials
    .filter((material) => material.kind === "industry_seed" || material.kind === "company_seed")
    .map((material) => `${material.label}: ${material.text}`)
    .join("\n");
}

function getLatestAssistantQuestion(messages: Array<{ role: "user" | "assistant"; content: string }>) {
  return [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";
}

export async function buildInterviewTurnPayload(args: {
  context: InterviewContextWithConversation;
  companyId: string;
  identity: RequestIdentity;
  answer: string;
}) {
  const turnEvents = await listInterviewTurnEvents({
    conversationId: args.context.conversation.id,
    companyId: args.companyId,
    identity: args.identity,
    limit: 24,
  });

  return {
    turnEvents,
    nextMessages: [
      ...args.context.conversation.messages,
      { role: "user" as const, content: args.answer },
    ],
    upstreamPayload: {
      company_name: args.context.company.name,
      company_summary: args.context.companySummary,
      motivation_summary: args.context.motivationSummary,
      gakuchika_summary: args.context.gakuchikaSummary,
      academic_summary: args.context.academicSummary,
      research_summary: args.context.researchSummary,
      es_summary: args.context.esSummary,
      conversation_history: [
        ...args.context.conversation.messages,
        { role: "user" as const, content: args.answer },
      ],
      turn_state: args.context.conversation.turnState,
      selected_industry: args.context.setup.selectedIndustry,
      selected_role: args.context.setup.selectedRole,
      selected_role_source: args.context.setup.selectedRoleSource,
      role_track: args.context.setup.roleTrack,
      interview_format: args.context.setup.interviewFormat,
      selection_type: args.context.setup.selectionType,
      interview_stage: args.context.setup.interviewStage,
      interviewer_type: args.context.setup.interviewerType,
      strictness_mode: args.context.setup.strictnessMode,
      interview_plan: args.context.conversation.plan,
      turn_events: turnEvents,
      seed_summary: buildSeedSummary(args.context.materials),
    },
  };
}

export async function completeInterviewTurnStream(args: {
  upstreamData: UpstreamCompleteData;
  context: InterviewContextWithConversation;
  companyId: string;
  identity: RequestIdentity;
  answer: string;
  nextMessages: InterviewContextWithConversation["conversation"]["messages"];
  onPersisted?: () => Promise<void>;
}): Promise<InterviewClientCompleteData> {
  const transitionLine =
    typeof args.upstreamData.transition_line === "string" &&
    args.upstreamData.transition_line.trim().length > 0
      ? args.upstreamData.transition_line.trim()
      : null;
  const question = typeof args.upstreamData.question === "string" ? args.upstreamData.question.trim() : "";
  const assistantMessages = [
    ...(transitionLine ? [{ role: "assistant" as const, content: transitionLine }] : []),
    ...(question ? [{ role: "assistant" as const, content: question }] : []),
  ];
  const messages = [...args.nextMessages, ...assistantMessages];
  const turnState =
    validateInterviewTurnState(args.upstreamData.turn_state ?? null) ??
    args.context.conversation.turnState;
  const turnMeta: InterviewTurnMeta | null = normalizeInterviewTurnMeta(args.upstreamData.turn_meta ?? null);
  const plan: InterviewPlan | null = normalizeInterviewPlanValue(args.upstreamData.interview_plan ?? null);
  const questionFlowCompleted =
    Boolean(args.upstreamData.question_flow_completed) ||
    (turnState as InterviewTurnState).nextAction === "feedback";
  const status = questionFlowCompleted ? "question_flow_completed" : "in_progress";

  await saveInterviewConversationProgress({
    conversationId: args.context.conversation.id,
    companyId: args.companyId,
    messages,
    turnState,
    status,
    turnMeta,
    plan,
  });
  await saveInterviewTurnEvent({
    conversationId: args.context.conversation.id,
    companyId: args.companyId,
    identity: args.identity,
    turnId:
      args.context.conversation.turnState.recentQuestionSummariesV2.at(-1)?.turnId ??
      `turn-${args.context.conversation.questionCount || args.context.conversation.turnState.turnCount || 1}`,
    question: getLatestAssistantQuestion(args.context.conversation.messages),
    answer: args.answer,
    questionType:
      typeof args.context.conversation.turnState.currentTopic === "string"
        ? args.context.conversation.turnState.currentTopic
        : null,
    turnState: args.context.conversation.turnState,
    turnMeta: args.context.conversation.turnMeta,
    versionMetadata: {
      promptVersion: args.upstreamData.prompt_version ?? null,
      followupPolicyVersion: args.upstreamData.followup_policy_version ?? null,
      caseSeedVersion: args.upstreamData.case_seed_version ?? null,
    },
  });

  await args.onPersisted?.();

  const shortCoaching = safeParseInterviewShortCoaching(args.upstreamData.short_coaching ?? null);

  return {
    messages,
    questionCount: turnState.turnCount,
    stageStatus:
      args.upstreamData.stage_status ?? {
        currentTopicLabel: turnMeta?.interviewSetupNote ?? turnState.currentTopic,
        coveredTopics: turnState.coveredTopics,
        remainingTopics: turnState.remainingTopics,
      },
    questionStage:
      typeof args.upstreamData.question_stage === "string"
        ? args.upstreamData.question_stage
        : turnState.currentTopic,
    focus:
      typeof args.upstreamData.focus === "string" && args.upstreamData.focus.trim().length > 0
        ? args.upstreamData.focus.trim()
        : turnMeta?.topic ?? turnState.currentTopic,
    feedback: null,
    questionFlowCompleted,
    creditCost: INTERVIEW_TURN_CREDIT_COST,
    turnState,
    turnMeta,
    plan,
    transitionLine,
    feedbackHistories: args.context.feedbackHistories,
    shortCoaching,
  };
}
