"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { toAppUiError, type AppUiError } from "@/lib/api-errors";
import { notifyUserFacingAppError } from "@/lib/client-error-ui";
import {
  createEmptyFeedback,
  INTERVIEW_PERSISTENCE_UNAVAILABLE_CODE,
  type Feedback,
  type FeedbackHistoryItem,
  type MaterialCard,
  type Message,
  type RoleOptionsResponse,
  type RoleSelectionSource,
  type SetupState,
} from "@/lib/interview/ui";
import type {
  InterviewPlan,
  InterviewStageStatus,
  InterviewTurnMeta,
  InterviewTurnState,
} from "@/lib/interview/session";

export const DEFAULT_SETUP_STATE: SetupState = {
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

export function useInterviewDomain() {
  const [companyName, setCompanyName] = useState("");
  const [materials, setMaterials] = useState<MaterialCard[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [streamingFeedback, setStreamingFeedback] = useState<Feedback | null>(null);
  const [feedbackHistories, setFeedbackHistories] = useState<FeedbackHistoryItem[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<FeedbackHistoryItem | null>(null);
  const [creditCost, setCreditCost] = useState(6);
  const [questionCount, setQuestionCount] = useState(0);
  const [questionStage, setQuestionStage] = useState<string | null>(null);
  const [stageStatus, setStageStatus] = useState<InterviewStageStatus | null>(null);
  const [turnState, setTurnState] = useState<InterviewTurnState | null>(null);
  const [turnMeta, setTurnMeta] = useState<InterviewTurnMeta | null>(null);
  const [interviewPlan, setInterviewPlan] = useState<InterviewPlan | null>(null);
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

  const shouldAnnounceFeedbackSuccessRef = useRef(false);

  const flattenedRoleOptions = useMemo(
    () => roleOptionsData?.roleGroups.flatMap((group) => group.options) ?? [],
    [roleOptionsData],
  );

  const effectiveIndustry =
    setupState.selectedIndustry || roleOptionsData?.industry || setupState.resolvedIndustry || "";
  const resolvedSelectedRole = customRoleName.trim() || selectedRoleName.trim();
  const setupComplete =
    Boolean(resolvedSelectedRole) && (!setupState.requiresIndustrySelection || Boolean(effectiveIndustry));
  const hasStarted = !legacySessionDetected && (messages.length > 0 || feedback !== null || questionFlowCompleted);
  const isComplete = feedback !== null;
  const visibleFeedback = feedback ?? streamingFeedback;
  const latestFeedbackHistory = feedbackHistories[0] ?? null;
  const feedbackHelperText = questionFlowCompleted
    ? `${questionCount}問の回答をもとに最終講評を作成します。成功時のみ ${creditCost} credits 消費です。`
    : "面接完了後に最終講評を作成できます。";

  const applyPersistenceDiagnosticState = useCallback((uiError: AppUiError) => {
    const isPersistenceError = uiError.code === INTERVIEW_PERSISTENCE_UNAVAILABLE_CODE;
    setPersistenceUnavailable(isPersistenceError);
    setPersistenceDeveloperHint(
      isPersistenceError && process.env.NODE_ENV === "development"
        ? uiError.details ?? uiError.developerMessage ?? "Interview persistence schema or migration is missing."
        : null,
    );
  }, []);

  const reportError = useCallback(
    (errorValue: unknown, fallback: { code: string; userMessage: string; action: string }, source: string) => {
      const uiError = toAppUiError(errorValue, fallback, source);
      setError(uiError.message);
      setErrorAction(uiError.action ?? null);
      notifyUserFacingAppError(uiError);
      applyPersistenceDiagnosticState(uiError);
    },
    [applyPersistenceDiagnosticState],
  );

  return {
    companyName,
    materials,
    messages,
    feedback,
    streamingFeedback,
    feedbackHistories,
    selectedHistory,
    creditCost,
    questionCount,
    questionStage,
    stageStatus,
    turnState,
    turnMeta,
    interviewPlan,
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
    feedbackCompletionCount,
    flattenedRoleOptions,
    effectiveIndustry,
    resolvedSelectedRole,
    setupComplete,
    hasStarted,
    isComplete,
    visibleFeedback,
    latestFeedbackHistory,
    feedbackHelperText,
    shouldAnnounceFeedbackSuccessRef,
    setCompanyName,
    setMaterials,
    setMessages,
    setFeedback,
    setStreamingFeedback,
    setFeedbackHistories,
    setSelectedHistory,
    setCreditCost,
    setQuestionCount,
    setQuestionStage,
    setStageStatus,
    setTurnState,
    setTurnMeta,
    setInterviewPlan,
    setQuestionFlowCompleted,
    setError,
    setErrorAction,
    setPersistenceUnavailable,
    setPersistenceDeveloperHint,
    setLegacySessionDetected,
    setSetupState,
    setRoleOptionsData,
    setSelectedRoleName,
    setCustomRoleNameState,
    setRoleSelectionSource,
    setFeedbackCompletionCount,
    reportError,
    createEmptyFeedback,
  };
}
