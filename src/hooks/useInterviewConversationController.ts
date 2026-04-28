"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { parseApiErrorResponse, toAppUiError, type AppUiError } from "@/lib/api-errors";
import { useStreamingTextPlayback } from "@/hooks/useStreamingTextPlayback";
import { notifyUserFacingAppError } from "@/lib/client-error-ui";
import { resolveRoleSelection } from "@/hooks/conversation/role-selection";
import {
  continueInterviewStream,
  fetchInterviewData,
  fetchInterviewRoleOptions,
  generateInterviewFeedbackStream,
  resetInterviewConversation,
  saveInterviewFeedbackSatisfaction,
  sendInterviewAnswerStream,
  startInterviewStream,
} from "@/lib/interview/client-api";
import {
  classifyInterviewRoleTrack,
  type InterviewPlan,
  type InterviewStageStatus,
  type InterviewTurnMeta,
  type InterviewTurnState,
} from "@/lib/interview/session";
import {
  createEmptyFeedback,
  INTERVIEW_PERSISTENCE_UNAVAILABLE_CODE,
  type InterviewBillingCosts,
  type InterviewMaterialReadiness,
  type InterviewModelLabels,
  type InterviewSessionState,
  type Feedback,
  type FeedbackHistoryItem,
  type HydratedConversation,
  type MaterialCard,
  type Message,
  type RoleOptionsResponse,
  type RoleSelectionSource,
  type SetupState,
} from "@/lib/interview/ui";
import {
  mergeContinueCompletePayload,
  mergeFeedbackCompletePayload,
  mergeStartCompletePayload,
  mergeTurnCompletePayload,
  type InterviewCompletePayload,
  type InterviewControllerState,
} from "@/lib/interview/reducers";

type StreamKind = "start" | "send" | "feedback" | "continue";

const DEFAULT_SETUP_STATE: SetupState = {
  selectedIndustry: null,
  selectedRole: null,
  selectedRoleSource: null,
  resolvedIndustry: null,
  requiresIndustrySelection: false,
  industryOptions: [],
  roleTrack: "biz_general",
  interviewFormat: "standard_behavioral",
  selectionType: "fulltime",
  interviewStage: "early",
  interviewerType: "hr",
  strictnessMode: "standard",
};

const DEFAULT_BILLING_COSTS: InterviewBillingCosts = {
  start: 2,
  turn: 1,
  continue: 1,
  feedback: 6,
};

const DEFAULT_MODEL_LABELS: InterviewModelLabels = {
  plan: "GPT-5.4",
  question: "Claude Haiku 4.5",
  feedback: "Claude Sonnet 4.6",
};

const DEFAULT_MATERIAL_READINESS: InterviewMaterialReadiness = {
  status: "thin",
  summary: "面接材料の確認中です。",
  items: [],
};

const DEFAULT_SESSION_STATE: InterviewSessionState = {
  status: "setup_pending",
  isActive: false,
  isLegacySession: false,
  questionCount: 0,
  hasFeedback: false,
};

function getStreamErrorContext(kind: StreamKind) {
  if (kind === "start") {
    return {
      code: "INTERVIEW_START_FAILED",
      userMessage: "面接対策の開始に失敗しました。",
      action: "少し時間をおいて、もう一度お試しください。",
      source: "interview:start",
    };
  }
  if (kind === "send") {
    return {
      code: "INTERVIEW_SEND_FAILED",
      userMessage: "面接対策の送信に失敗しました。",
      action: "少し時間をおいて、もう一度お試しください。",
      source: "interview:send",
    };
  }
  if (kind === "feedback") {
    return {
      code: "INTERVIEW_FEEDBACK_FAILED",
      userMessage: "最終講評の作成に失敗しました。",
      action: "少し時間をおいて、もう一度お試しください。",
      source: "interview:feedback",
    };
  }
  return {
    code: "INTERVIEW_CONTINUE_FAILED",
    userMessage: "続きの面接対策を開始できませんでした。",
    action: "少し時間をおいて、もう一度お試しください。",
    source: "interview:continue",
  };
}

function isFeedbackArrayField(value: string): value is "strengths" | "improvements" | "next_preparation" | "consistency_risks" | "preparation_points" {
  return ["strengths", "improvements", "next_preparation", "consistency_risks", "preparation_points"].includes(value);
}

export function useInterviewConversationController({
  companyId,
  enabled,
}: {
  companyId: string | null;
  enabled: boolean;
}) {
  const [companyName, setCompanyName] = useState("");
  const [materials, setMaterials] = useState<MaterialCard[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [streamingFeedback, setStreamingFeedback] = useState<Feedback | null>(null);
  const [feedbackHistories, setFeedbackHistories] = useState<FeedbackHistoryItem[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<FeedbackHistoryItem | null>(null);
  const [creditCost, setCreditCost] = useState(6);
  const [billingCosts, setBillingCosts] = useState<InterviewBillingCosts>(DEFAULT_BILLING_COSTS);
  const [modelLabels, setModelLabels] = useState<InterviewModelLabels>(DEFAULT_MODEL_LABELS);
  const [materialReadiness, setMaterialReadiness] = useState<InterviewMaterialReadiness>(DEFAULT_MATERIAL_READINESS);
  const [sessionState, setSessionState] = useState<InterviewSessionState>(DEFAULT_SESSION_STATE);
  const [questionCount, setQuestionCount] = useState(0);
  const [questionStage, setQuestionStage] = useState<string | null>(null);
  const [stageStatus, setStageStatus] = useState<InterviewStageStatus | null>(null);
  const [turnState, setTurnState] = useState<InterviewTurnState | null>(null);
  const [turnMeta, setTurnMeta] = useState<InterviewTurnMeta | null>(null);
  const [interviewPlan, setInterviewPlan] = useState<InterviewPlan | null>(null);
  const [streamingLabel, setStreamingLabel] = useState<string | null>(null);
  const [pendingAssistantMessage, setPendingAssistantMessage] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [isSavingSatisfaction, setIsSavingSatisfaction] = useState(false);
  const [questionFlowCompleted, setQuestionFlowCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<string | null>(null);
  const [persistenceUnavailable, setPersistenceUnavailable] = useState(false);
  const [persistenceDeveloperHint, setPersistenceDeveloperHint] = useState<string | null>(null);
  const [legacySessionDetected, setLegacySessionDetected] = useState(false);
  const [setupState, setSetupState] = useState<SetupState>(DEFAULT_SETUP_STATE);
  const [roleOptionsData, setRoleOptionsData] = useState<RoleOptionsResponse | null>(null);
  const [selectedRoleName, setSelectedRoleName] = useState("");
  const [customRoleName, setCustomRoleNameState] = useState("");
  const [roleSelectionSource, setRoleSelectionSource] = useState<RoleSelectionSource | null>(null);
  const [feedbackCompletionCount, setFeedbackCompletionCount] = useState(0);
  // Phase 2 Stage 6: 最新 turn の short coaching (null = 非表示)。
  // Stage 8 ダッシュボードが参照する。現時点では state に保持のみで UI 未表示。
  const [shortCoaching, setShortCoaching] =
    useState<import("@/lib/interview/conversation").InterviewShortCoaching | null>(null);

  const [streamingTargetText, setStreamingTargetText] = useState("");
  const [isTextStreaming, setIsTextStreaming] = useState(false);
  const [streamingSessionId, setStreamingSessionId] = useState(0);
  const [pendingCompleteState, setPendingCompleteState] = useState<InterviewControllerState | null>(null);

  const { displayedText: streamingText, isPlaybackComplete } = useStreamingTextPlayback(
    streamingTargetText,
    { isActive: isTextStreaming, resetKey: streamingSessionId },
  );

  const shouldAnnounceFeedbackSuccessRef = useRef(false);

  // SSE complete event merge reducer に渡す prev state スナップショット。
  // useCallback deps を肥大化させず latest state を読むため ref で同期する。
  const controllerStateRef = useRef<InterviewControllerState>({
    messages: [],
    questionCount: 0,
    stageStatus: null,
    questionStage: null,
    feedback: null,
    turnState: null,
    turnMeta: null,
    interviewPlan: null,
    questionFlowCompleted: false,
    creditCost: 6,
    feedbackHistories: [],
    feedbackCompletionCount: 0,
    shortCoaching: null,
  });
  useEffect(() => {
    controllerStateRef.current = {
      messages,
      questionCount,
      stageStatus,
      questionStage,
      feedback,
      turnState,
      turnMeta,
      interviewPlan,
      questionFlowCompleted,
      creditCost,
      feedbackHistories,
      feedbackCompletionCount,
      shortCoaching,
    };
  }, [
    messages,
    questionCount,
    stageStatus,
    questionStage,
    feedback,
    turnState,
    turnMeta,
    interviewPlan,
    questionFlowCompleted,
    creditCost,
    feedbackHistories,
    feedbackCompletionCount,
    shortCoaching,
  ]);

  const flattenedRoleOptions = useMemo(
    () => roleOptionsData?.roleGroups.flatMap((group) => group.options) ?? [],
    [roleOptionsData],
  );

  const effectiveIndustry =
    setupState.selectedIndustry ||
    roleOptionsData?.industry ||
    setupState.resolvedIndustry ||
    "";
  const resolvedSelectedRole = customRoleName.trim() || selectedRoleName.trim();
  const setupComplete = Boolean(resolvedSelectedRole) && (!setupState.requiresIndustrySelection || Boolean(effectiveIndustry));
  const hasStarted = !legacySessionDetected && (messages.length > 0 || feedback !== null || questionFlowCompleted);
  const isBusy = isSending || isGeneratingFeedback || isContinuing;
  const isComplete = feedback !== null;
  const visibleFeedback = feedback ?? streamingFeedback;
  const canSend = answer.trim().length > 0 && !isBusy && !isComplete && !questionFlowCompleted && hasStarted;
  const canGenerateFeedback = questionFlowCompleted && !isComplete && !isBusy;
  const canContinue = Boolean(feedback) && !isBusy;
  const latestFeedbackHistory = feedbackHistories[0] ?? null;
  const feedbackHelperText = questionFlowCompleted
    ? `${questionCount}問の回答をもとに最終講評を作成します。成功時のみ ${creditCost} credits 消費です。`
    : "面接完了後に最終講評を作成できます。";

  const applyPersistenceDiagnosticState = useCallback((uiError: AppUiError) => {
    const isPersistenceError = uiError.code === INTERVIEW_PERSISTENCE_UNAVAILABLE_CODE;
    setPersistenceUnavailable(isPersistenceError);
    setPersistenceDeveloperHint(
      isPersistenceError && process.env.NODE_ENV === "development"
        ? uiError.details ??
            uiError.developerMessage ??
            "Interview persistence schema or migration is missing."
        : null,
    );
  }, []);

  const reportError = useCallback((
    errorValue: unknown,
    fallback: { code: string; userMessage: string; action: string },
    source: string,
  ) => {
    const uiError = toAppUiError(errorValue, fallback, source);
    setError(uiError.message);
    setErrorAction(uiError.action ?? null);
    notifyUserFacingAppError(uiError);
    applyPersistenceDiagnosticState(uiError);
  }, [applyPersistenceDiagnosticState]);

  useEffect(() => {
    const classified = classifyInterviewRoleTrack(resolvedSelectedRole);
    setSetupState((prev) => (prev.roleTrack === classified ? prev : { ...prev, roleTrack: classified }));
  }, [resolvedSelectedRole]);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    if (!companyId) {
      setIsLoading(false);
      setError("このURLでは企業を特定できません。");
      setErrorAction("企業一覧から対象の企業を開き直してください。");
      return;
    }

    let isMounted = true;

    const hydrate = async () => {
      setIsLoading(true);
      setError(null);
      setErrorAction(null);
      setPersistenceUnavailable(false);
      setPersistenceDeveloperHint(null);
      try {
        const [interviewResponse, roleResponse] = await Promise.all([
          fetchInterviewData(companyId),
          fetchInterviewRoleOptions(companyId),
        ]);
        if (!interviewResponse.ok) {
          throw await parseApiErrorResponse(
            interviewResponse,
            {
              code: "INTERVIEW_HYDRATE_FAILED",
              userMessage: "面接対策の準備に失敗しました。",
              action: "時間をおいて、もう一度お試しください。",
              authMessage: "ログイン後に面接対策を利用してください。",
              notFoundMessage: "対象の企業が見つかりません。",
            },
            "interview:hydrate",
          );
        }

        const interviewData = await interviewResponse.json();
        const roleData = roleResponse.ok ? ((await roleResponse.json()) as RoleOptionsResponse) : null;
        if (!isMounted) return;

        const conversation = interviewData.conversation as HydratedConversation;
        const isLegacy = Boolean(conversation?.isLegacySession);
        setCompanyName(interviewData.company?.name || "");
        setMaterials(Array.isArray(interviewData.materials) ? interviewData.materials : []);
        setCreditCost(typeof interviewData.creditCost === "number" ? interviewData.creditCost : 6);
        setBillingCosts(interviewData.billingCosts ?? DEFAULT_BILLING_COSTS);
        setModelLabels(interviewData.models ?? DEFAULT_MODEL_LABELS);
        setMaterialReadiness(interviewData.materialReadiness ?? DEFAULT_MATERIAL_READINESS);
        setSessionState(interviewData.sessionState ?? DEFAULT_SESSION_STATE);
        setFeedbackHistories(Array.isArray(interviewData.feedbackHistories) ? interviewData.feedbackHistories : []);
        setRoleOptionsData(roleData);
        setSetupState(interviewData.setup);
        setPersistenceUnavailable(false);
        setPersistenceDeveloperHint(null);
        setLegacySessionDetected(isLegacy);
        setMessages(!isLegacy && Array.isArray(conversation?.messages) ? conversation.messages : []);
        setFeedback(!isLegacy ? conversation?.feedback ?? null : null);
        setQuestionCount(!isLegacy && typeof conversation?.questionCount === "number" ? conversation.questionCount : 0);
        setQuestionStage(!isLegacy ? conversation?.questionStage ?? null : null);
        setStageStatus(!isLegacy ? conversation?.stageStatus ?? interviewData.stageStatus ?? null : null);
        setTurnState(!isLegacy ? conversation?.turnState ?? interviewData.turnState ?? null : null);
        setTurnMeta(!isLegacy ? conversation?.turnMeta ?? null : null);
        setInterviewPlan(!isLegacy ? conversation?.plan ?? null : null);
        setQuestionFlowCompleted(!isLegacy && Boolean(conversation?.questionFlowCompleted));

        const resolvedRole = conversation?.selectedRole || interviewData.setup?.selectedRole || "";
        const nextRoleSelection = resolveRoleSelection({
          resolvedRole,
          resolvedSource: (conversation?.selectedRoleSource as string | null) ?? null,
          availableOptions: roleData?.roleGroups?.flatMap((group) => group.options) ?? [],
        });

        setSelectedRoleName(nextRoleSelection.selectedRoleName);
        setCustomRoleNameState(nextRoleSelection.customRoleInput);
        setRoleSelectionSource(nextRoleSelection.roleSelectionSource as RoleSelectionSource | null);
      } catch (fetchError) {
        if (!isMounted) return;
        reportError(
          fetchError,
          {
            code: "INTERVIEW_HYDRATE_FAILED",
            userMessage: "面接対策の準備に失敗しました。",
            action: "時間をおいて、もう一度お試しください。",
          },
          "interview:hydrate",
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void hydrate();
    return () => {
      isMounted = false;
    };
  }, [companyId, enabled, reportError]);

  const runStream = useCallback(async (
    kind: StreamKind,
    body?: Record<string, string | number | boolean | null | undefined>,
  ) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90_000);
    let pendingCompletePayload: InterviewCompletePayload | null = null;

    try {
      if (!companyId) {
        throw new Error("企業を特定できません。企業一覧から開き直してください。");
      }

      const response =
        kind === "start"
          ? await startInterviewStream(companyId, body ?? {}, controller.signal)
          : kind === "feedback"
            ? await generateInterviewFeedbackStream(companyId, controller.signal)
            : kind === "continue"
              ? await continueInterviewStream(companyId, controller.signal)
              : await sendInterviewAnswerStream(companyId, body ?? {}, controller.signal);

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "INTERVIEW_STREAM_FAILED",
            userMessage: "面接対策の送信に失敗しました。",
            action: "少し時間をおいて、もう一度お試しください。",
            authMessage: "ログイン後に面接対策を利用してください。",
          },
          "interview:stream",
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("ストリームが取得できませんでした。");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      let streamedQuestionText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          let event;
          try {
            event = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          if (event.type === "progress") {
            setStreamingLabel(event.label || null);
            continue;
          }

          if (event.type === "field_complete") {
            if (event.path === "question_stage") {
              setQuestionStage(event.value || null);
            }
            if (event.path === "stage_status") {
              setStageStatus(event.value || null);
            }
            if (event.path === "scores") {
              setStreamingFeedback((prev) => ({
                ...(prev ?? createEmptyFeedback()),
                scores: typeof event.value === "object" && event.value ? event.value : {},
              }));
            }
            if (event.path === "premise_consistency") {
              setStreamingFeedback((prev) => ({
                ...(prev ?? createEmptyFeedback()),
                premise_consistency:
                  typeof event.value === "number" ? event.value : undefined,
              }));
            }
            if (event.path === "weakest_question_type") {
              setStreamingFeedback((prev) => ({
                ...(prev ?? createEmptyFeedback()),
                weakest_question_type:
                  typeof event.value === "string" ? event.value : null,
              }));
            }
            continue;
          }

          if (event.type === "array_item_complete") {
            if (typeof event.path !== "string") continue;
            const [field, indexText] = event.path.split(".");
            const index = Number(indexText);
            if (!Number.isFinite(index) || !isFeedbackArrayField(field)) continue;
            setStreamingFeedback((prev) => {
              const next = prev ?? createEmptyFeedback();
              const key =
                field === "preparation_points"
                  ? "next_preparation"
                  : field;
              const currentItems = [...next[key]];
              currentItems[index] = typeof event.value === "string" ? event.value : String(event.value ?? "");
              return { ...next, [key]: currentItems };
            });
            continue;
          }

          if (event.type === "string_chunk") {
            if (event.path === "question") {
              streamedQuestionText += event.text || "";
            }
            if (event.path === "overall_comment" || event.path === "improved_answer") {
              setStreamingFeedback((prev) => {
                const next = prev ?? createEmptyFeedback();
                const chunk = event.text || "";
                return {
                  ...next,
                  overall_comment:
                    event.path === "overall_comment"
                      ? `${next.overall_comment}${chunk}`
                      : next.overall_comment,
                  improved_answer:
                    event.path === "improved_answer"
                      ? `${next.improved_answer}${chunk}`
                      : next.improved_answer,
                };
              });
            }
            continue;
          }

          if (event.type === "error") {
            throw new Error(event.message || "AIサービスでエラーが発生しました。");
          }

          if (event.type === "complete") {
            completed = true;
            pendingCompletePayload = (event.data ?? {}) as InterviewCompletePayload;
          }
        }
      }

      if (!completed || !pendingCompletePayload) {
        throw new Error("ストリームが途中で切断されました。");
      }

      const payload = pendingCompletePayload;
      const shouldAnnounceFeedback = shouldAnnounceFeedbackSuccessRef.current;
      // Pure reducer 経由で state を合成する (unit test は src/lib/interview/reducers.test.ts)。
      // prev state は最新値 ref (controllerStateRef) から取得し、runStream の useCallback deps を
      // 肥大化させない。個別 setter で分割 useState に反映することで既存の state 構造を保つ。
      const prevState = controllerStateRef.current;
      const mergeOptions = {
        fallbackCreditCost: prevState.creditCost,
        shouldAnnounceFeedback,
      };
      const nextState =
        kind === "start"
          ? mergeStartCompletePayload(prevState, payload, mergeOptions)
          : kind === "send"
            ? mergeTurnCompletePayload(prevState, payload, mergeOptions)
            : kind === "continue"
              ? mergeContinueCompletePayload(prevState, payload, mergeOptions)
              : mergeFeedbackCompletePayload(prevState, payload, mergeOptions);

      const lastMessage = Array.isArray(nextState.messages) ? nextState.messages.at(-1) : null;
      const questionForPlayback =
        (lastMessage?.role === "assistant" ? lastMessage.content : "") || streamedQuestionText.trim();

      if (questionForPlayback && kind !== "feedback") {
        setStreamingTargetText(questionForPlayback);
        setIsTextStreaming(true);
        setStreamingSessionId((prev) => prev + 1);
        setPendingCompleteState(nextState);
      } else {
        applyCompleteState(nextState, prevState);
      }
    } finally {
      clearTimeout(timeoutId);
      setStreamingLabel(null);
      setPendingAssistantMessage(null);
      if (kind !== "feedback") {
        setStreamingFeedback(null);
      }
    }
  }, [companyId]);

  const applyCompleteState = useCallback((nextState: InterviewControllerState, prevState: InterviewControllerState) => {
    startTransition(() => {
      setMessages(nextState.messages);
      setQuestionCount(nextState.questionCount);
      setStageStatus(nextState.stageStatus);
      setQuestionStage(nextState.questionStage);
      setFeedback(nextState.feedback);
      setTurnState(nextState.turnState);
      setTurnMeta(nextState.turnMeta);
      setInterviewPlan(nextState.interviewPlan);
      setQuestionFlowCompleted(nextState.questionFlowCompleted);
      setCreditCost(nextState.creditCost);
      setSessionState((prev) => ({
        ...prev,
        status: nextState.feedback
          ? "feedback_completed"
          : nextState.questionFlowCompleted
            ? "question_flow_completed"
            : nextState.messages.length > 0
              ? "in_progress"
              : "setup_pending",
        isActive: nextState.messages.length > 0 || nextState.questionFlowCompleted || Boolean(nextState.feedback),
        questionCount: nextState.questionCount,
        hasFeedback: Boolean(nextState.feedback),
      }));
      if (nextState.feedbackHistories !== prevState.feedbackHistories) {
        setFeedbackHistories(nextState.feedbackHistories);
      }
      if (nextState.feedbackCompletionCount !== prevState.feedbackCompletionCount) {
        setFeedbackCompletionCount(nextState.feedbackCompletionCount);
      }
      if (nextState.shortCoaching !== prevState.shortCoaching) {
        setShortCoaching(nextState.shortCoaching);
      }
      setPendingAssistantMessage(null);
    });
  }, []);

  useEffect(() => {
    if (!pendingCompleteState || !isTextStreaming || !isPlaybackComplete) return;
    const timer = window.setTimeout(() => {
      const prevState = controllerStateRef.current;
      applyCompleteState(pendingCompleteState, prevState);
      setPendingCompleteState(null);
      setIsTextStreaming(false);
      setStreamingTargetText("");
    }, 180);
    return () => window.clearTimeout(timer);
  }, [applyCompleteState, isPlaybackComplete, isTextStreaming, pendingCompleteState]);

  const handleStart = useCallback(async () => {
    if (!setupComplete || isBusy || hasStarted || persistenceUnavailable) return;
    setIsSending(true);
    setError(null);
    setErrorAction(null);
    try {
      await runStream("start", {
        selectedIndustry: effectiveIndustry || null,
        selectedRole: resolvedSelectedRole,
        selectedRoleSource:
          roleSelectionSource === "custom" ? "custom" : roleSelectionSource,
        roleTrack: setupState.roleTrack,
        interviewFormat: setupState.interviewFormat,
        selectionType: setupState.selectionType,
        interviewStage: setupState.interviewStage,
        interviewerType: setupState.interviewerType,
        strictnessMode: setupState.strictnessMode,
      });
    } catch (streamError) {
      const context = getStreamErrorContext("start");
      reportError(streamError, context, context.source);
    } finally {
      setIsSending(false);
    }
  }, [effectiveIndustry, hasStarted, isBusy, persistenceUnavailable, reportError, resolvedSelectedRole, roleSelectionSource, runStream, setupComplete, setupState]);

  const handleSend = useCallback(async () => {
    if (!canSend) return;
    const optimisticMessages = [...messages, { role: "user" as const, content: answer.trim() }];
    setMessages(optimisticMessages);
    setAnswer("");
    setIsSending(true);
    setError(null);
    setErrorAction(null);

    try {
      await runStream("send", { answer: optimisticMessages.at(-1)?.content });
    } catch (streamError) {
      setMessages(messages);
      const context = getStreamErrorContext("send");
      reportError(streamError, context, context.source);
    } finally {
      setIsSending(false);
    }
  }, [answer, canSend, messages, reportError, runStream]);

  const handleGenerateFeedback = useCallback(async () => {
    if (!canGenerateFeedback) return;
    setIsGeneratingFeedback(true);
    setStreamingFeedback(createEmptyFeedback());
    setError(null);
    setErrorAction(null);
    shouldAnnounceFeedbackSuccessRef.current = true;
    try {
      await runStream("feedback");
    } catch (streamError) {
      shouldAnnounceFeedbackSuccessRef.current = false;
      setStreamingFeedback(null);
      const context = getStreamErrorContext("feedback");
      reportError(streamError, context, context.source);
    } finally {
      setIsGeneratingFeedback(false);
    }
  }, [canGenerateFeedback, reportError, runStream]);

  const handleContinue = useCallback(async () => {
    if (!canContinue || persistenceUnavailable) return;
    const previousFeedback = feedback;
    setIsContinuing(true);
    setError(null);
    setErrorAction(null);
    setFeedback(null);
    setStreamingFeedback(null);
    setQuestionFlowCompleted(false);
    try {
      await runStream("continue");
    } catch (streamError) {
      setFeedback(previousFeedback);
      const context = getStreamErrorContext("continue");
      reportError(streamError, context, context.source);
    } finally {
      setIsContinuing(false);
    }
  }, [canContinue, feedback, persistenceUnavailable, reportError, runStream]);

  const handleReset = useCallback(async () => {
    if (!companyId || isBusy || persistenceUnavailable) return;
    setError(null);
    setErrorAction(null);
    try {
      const response = await resetInterviewConversation(companyId);

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "INTERVIEW_RESET_FAILED",
            userMessage: "会話のリセットに失敗しました。",
            action: "少し時間をおいて、もう一度お試しください。",
          },
          "interview:reset",
        );
      }
      const data = await response.json();
      setMessages([]);
      setFeedback(null);
      setStreamingFeedback(null);
      setAnswer("");
      setQuestionCount(0);
      setQuestionStage(data.conversation?.questionStage ?? null);
      setStageStatus(data.conversation?.stageStatus ?? null);
      setTurnState(data.conversation?.turnState ?? null);
      setTurnMeta(data.conversation?.turnMeta ?? null);
      setInterviewPlan(data.conversation?.plan ?? null);
      setQuestionFlowCompleted(false);
      setLegacySessionDetected(false);
      setSessionState(DEFAULT_SESSION_STATE);
      setFeedbackHistories(Array.isArray(data.feedbackHistories) ? data.feedbackHistories : []);
    } catch (resetError) {
      reportError(
        resetError,
        {
          code: "INTERVIEW_RESET_FAILED",
          userMessage: "会話のリセットに失敗しました。",
          action: "少し時間をおいて、もう一度お試しください。",
        },
        "interview:reset",
      );
    }
  }, [companyId, isBusy, persistenceUnavailable, reportError]);

  const handleSaveSatisfaction = useCallback(async (score: number) => {
    if (!companyId || !latestFeedbackHistory || isSavingSatisfaction) return;
    setIsSavingSatisfaction(true);
    setError(null);
    setErrorAction(null);
    try {
      const response = await saveInterviewFeedbackSatisfaction(companyId, {
        historyId: latestFeedbackHistory.id,
        satisfactionScore: score,
      });

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "INTERVIEW_SATISFACTION_FAILED",
            userMessage: "満足度の保存に失敗しました。",
            action: "少し時間をおいて、もう一度お試しください。",
          },
          "interview:satisfaction",
        );
      }

      setFeedbackHistories((prev) =>
        prev.map((item) => (item.id === latestFeedbackHistory.id ? { ...item, satisfactionScore: score } : item)),
      );
      setFeedback((prev) => (prev ? { ...prev, satisfaction_score: score } : prev));
    } catch (saveError) {
      reportError(
        saveError,
        {
          code: "INTERVIEW_SATISFACTION_FAILED",
          userMessage: "満足度の保存に失敗しました。",
          action: "少し時間をおいて、もう一度お試しください。",
        },
        "interview:satisfaction",
      );
    } finally {
      setIsSavingSatisfaction(false);
    }
  }, [companyId, isSavingSatisfaction, latestFeedbackHistory, reportError]);

  const handleSelectRole = useCallback((value: string, unsetValue: string) => {
    if (value === unsetValue) {
      setSelectedRoleName("");
      setRoleSelectionSource(null);
      return;
    }
    const option = flattenedRoleOptions.find((item) => item.value === value);
    setSelectedRoleName(value);
    setCustomRoleNameState("");
    setRoleSelectionSource(option?.source ?? null);
  }, [flattenedRoleOptions]);

  const setCustomRoleName = useCallback((value: string) => {
    setCustomRoleNameState(value);
    if (value.trim()) {
      setSelectedRoleName("");
      setRoleSelectionSource("custom");
    }
  }, []);

  return {
    state: {
      companyName,
      materials,
      messages,
      answer,
      feedback,
      streamingFeedback,
      feedbackHistories,
      selectedHistory,
      creditCost,
      billingCosts,
      modelLabels,
      materialReadiness,
      sessionState,
      questionCount,
      questionStage,
      stageStatus,
      turnState,
      turnMeta,
      interviewPlan,
      streamingLabel,
      pendingAssistantMessage,
      streamingText,
      isTextStreaming,
      isLoading,
      isSending,
      isGeneratingFeedback,
      isContinuing,
      isSavingSatisfaction,
      questionFlowCompleted,
      error,
      errorAction,
      persistenceUnavailable,
      persistenceDeveloperHint,
      legacySessionDetected,
      setupState,
      roleOptionsData,
      selectedRoleName,
      customRoleName,
      roleSelectionSource,
      flattenedRoleOptions,
      effectiveIndustry,
      resolvedSelectedRole,
      setupComplete,
      hasStarted,
      isBusy,
      isComplete,
      visibleFeedback,
      canSend,
      canGenerateFeedback,
      canContinue,
      latestFeedbackHistory,
      feedbackHelperText,
      feedbackCompletionCount,
      shortCoaching,
    },
    actions: {
      setAnswer,
      setSetupState,
      setSelectedHistory,
      selectRole: handleSelectRole,
      setCustomRoleName,
      start: handleStart,
      send: handleSend,
      generateFeedback: handleGenerateFeedback,
      continueInterview: handleContinue,
      reset: handleReset,
      saveSatisfaction: handleSaveSatisfaction,
    },
  };
}
