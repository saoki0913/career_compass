"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";

import { parseApiErrorResponse } from "@/lib/api-errors";
import { reportUserFacingError } from "@/lib/client-error-ui";
import {
  fetchMotivationCompany,
  fetchMotivationConversation,
  fetchMotivationRoleOptions,
  generateMotivationDraft,
  generateMotivationDraftDirect,
  resetMotivationConversation,
  resumeMotivationDeepDive,
  saveMotivationDraft,
  startMotivationConversation,
  streamMotivationConversation,
} from "@/lib/motivation/client-api";
import {
  type CausalGap,
  type ConversationMode,
  type EvidenceCard,
  type MotivationCompany,
  type MotivationMessage,
  type MotivationProgress,
  type MotivationSetupSnapshot,
  type MotivationStageKey,
  type RoleOptionsResponse,
  type RoleSelectionSource,
  type StageStatus,
} from "@/lib/motivation/ui";
import type { MotivationConversationPayload } from "@/lib/motivation/conversation-payload";
import { notifyMotivationDraftGenerated, notifyMotivationDraftReady, notifyMotivationDraftSaved } from "@/lib/notifications";
import { appendOptimisticUserMessage, rollbackOptimisticMessageById } from "@/hooks/conversation/optimistic-message";
import { resolveRoleSelection } from "@/hooks/conversation/role-selection";
import { useStreamingTextPlayback } from "@/hooks/useStreamingTextPlayback";
import { useOperationLock } from "@/hooks/useOperationLock";

type ConversationPayload = Partial<
  Omit<
    MotivationConversationPayload,
    "questionStage" | "conversationMode" | "currentSlot" | "conversationContext" | "setup"
  >
> & {
  questionStage?: MotivationStageKey | null;
  conversationMode?: ConversationMode | null;
  currentSlot?: Exclude<MotivationStageKey, "closing"> | null;
  conversationContext?: {
    selectedIndustry?: string | null;
    selectedRole?: string | null;
    selectedRoleSource?: string | null;
  } | null;
  setup?: MotivationSetupSnapshot | null;
};

type PendingCompleteData = {
  messages: MotivationMessage[];
  nextQuestion: string | null;
  questionCount: number;
  isDraftReady: boolean;
  draftReadyJustUnlocked: boolean;
  evidenceSummary: string | null;
  evidenceCards: EvidenceCard[];
  questionStage: MotivationStageKey | null;
  stageStatus: StageStatus | null;
  coachingFocus: string | null;
  conversationMode: ConversationMode;
  currentSlot: Exclude<MotivationStageKey, "closing"> | null;
  currentIntent: string | null;
  nextAdvanceCondition: string | null;
  progress: MotivationProgress | null;
  causalGaps: CausalGap[];
};

function withIds(
  messages: Array<{ role: "user" | "assistant"; content: string; id?: string }>,
) {
  return messages.map((message, index) => ({
    ...message,
    id: message.id || `msg-${index}`,
  }));
}

export function useMotivationConversationController({ companyId }: { companyId: string }) {
  const { isLocked, activeOperationLabel, acquireLock, releaseLock } = useOperationLock();

  const [company, setCompany] = useState<MotivationCompany | null>(null);
  const [messages, setMessages] = useState<MotivationMessage[]>([]);
  const [nextQuestion, setNextQuestion] = useState<string | null>(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [isDraftReady, setIsDraftReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [conversationLoadError, setConversationLoadError] = useState<string | null>(null);
  const [evidenceSummary, setEvidenceSummary] = useState<string | null>(null);
  const [evidenceCards, setEvidenceCards] = useState<EvidenceCard[]>([]);
  const [generatedDraft, setGeneratedDraft] = useState<string | null>(null);
  const [generatedDocumentId, setGeneratedDocumentId] = useState<string | null>(null);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isStartingConversation, setIsStartingConversation] = useState(false);
  const [charLimit, setCharLimit] = useState<300 | 400 | 500>(400);
  const [streamingLabel, setStreamingLabel] = useState<string | null>(null);
  const [streamingTargetText, setStreamingTargetText] = useState("");
  const [isTextStreaming, setIsTextStreaming] = useState(false);
  const [streamingSessionId, setStreamingSessionId] = useState(0);
  const [questionStage, setQuestionStage] = useState<MotivationStageKey | null>(null);
  const [stageStatus, setStageStatus] = useState<StageStatus | null>(null);
  const [coachingFocus, setCoachingFocus] = useState<string | null>(null);
  const [conversationMode, setConversationMode] = useState<ConversationMode>("slot_fill");
  const [currentSlot, setCurrentSlot] = useState<Exclude<MotivationStageKey, "closing"> | null>(null);
  const [currentIntent, setCurrentIntent] = useState<string | null>(null);
  const [nextAdvanceCondition, setNextAdvanceCondition] = useState<string | null>(null);
  const [progress, setProgress] = useState<MotivationProgress | null>(null);
  const [causalGaps, setCausalGaps] = useState<CausalGap[]>([]);
  const [roleOptionsData, setRoleOptionsData] = useState<RoleOptionsResponse | null>(null);
  const [isRoleOptionsLoading, setIsRoleOptionsLoading] = useState(false);
  const [roleOptionsError, setRoleOptionsError] = useState<string | null>(null);
  const [setupSnapshot, setSetupSnapshot] = useState<MotivationSetupSnapshot | null>(null);
  const [selectedIndustry, setSelectedIndustry] = useState("");
  const [selectedRoleName, setSelectedRoleName] = useState("");
  const [roleSelectionSource, setRoleSelectionSource] = useState<RoleSelectionSource | null>(null);
  const [customRoleInput, setCustomRoleInput] = useState("");
  const [pendingCompleteData, setPendingCompleteData] = useState<PendingCompleteData | null>(null);

  const roleOptionsRequestIdRef = useRef(0);
  const fetchDataRequestIdRef = useRef(0);

  const { displayedText: streamingText, isPlaybackComplete } = useStreamingTextPlayback(
    streamingTargetText,
    { isActive: isTextStreaming, resetKey: streamingSessionId },
  );

  const applySetupSelection = useCallback((
    setup: MotivationSetupSnapshot | null | undefined,
    roleOptions: RoleOptionsResponse | null,
    conversationContext: {
      selectedIndustry?: string | null;
      selectedRole?: string | null;
      selectedRoleSource?: string | null;
    } | null | undefined,
  ) => {
    const resolvedIndustry =
      setup?.selectedIndustry ||
      setup?.resolvedIndustry ||
      conversationContext?.selectedIndustry ||
      roleOptions?.industry ||
      "";
    const resolvedRole = setup?.selectedRole || conversationContext?.selectedRole || "";
    const resolvedSource = setup?.selectedRoleSource || conversationContext?.selectedRoleSource || null;
    const nextRoleSelection = resolveRoleSelection({
      resolvedRole,
      resolvedSource,
      availableOptions: roleOptions?.roleGroups.flatMap((group) => group.options) ?? [],
    });

    setSetupSnapshot(setup || null);
    setSelectedIndustry(resolvedIndustry);
    setSelectedRoleName(nextRoleSelection.selectedRoleName);
    setRoleSelectionSource(nextRoleSelection.roleSelectionSource as RoleSelectionSource | null);
    setCustomRoleInput(nextRoleSelection.customRoleInput);
  }, []);

  const applyConversationPayload = useCallback((conversation: ConversationPayload, roleOptions: RoleOptionsResponse | null) => {
    const has = <K extends keyof ConversationPayload>(k: K) => k in conversation;
    if (has("messages")) setMessages(withIds(conversation.messages ?? []));
    if (has("nextQuestion")) setNextQuestion(conversation.nextQuestion ?? null);
    if (has("questionCount")) setQuestionCount(conversation.questionCount ?? 0);
    if (has("isDraftReady")) setIsDraftReady(conversation.isDraftReady ?? false);
    if (has("evidenceSummary")) setEvidenceSummary(conversation.evidenceSummary ?? null);
    if (has("evidenceCards")) setEvidenceCards(conversation.evidenceCards ?? []);
    if (has("generatedDraft")) setGeneratedDraft(conversation.generatedDraft ?? null);
    if (has("questionStage")) setQuestionStage(conversation.questionStage ?? null);
    if (has("stageStatus")) setStageStatus(conversation.stageStatus ?? null);
    if (has("coachingFocus")) setCoachingFocus(conversation.coachingFocus ?? null);
    if (has("conversationMode")) setConversationMode(conversation.conversationMode ?? "slot_fill");
    if (has("currentSlot")) setCurrentSlot(conversation.currentSlot ?? null);
    if (has("currentIntent")) setCurrentIntent(conversation.currentIntent ?? null);
    if (has("nextAdvanceCondition")) setNextAdvanceCondition(conversation.nextAdvanceCondition ?? null);
    if (has("progress")) setProgress(conversation.progress ?? null);
    if (has("causalGaps")) setCausalGaps(conversation.causalGaps ?? []);
    if (has("setup")) applySetupSelection(conversation.setup!, roleOptions, conversation.conversationContext);
    if (has("error")) setConversationLoadError(conversation.error ?? null);
  }, [applySetupSelection]);

  const fetchRoleOptions = useCallback(async (industryOverride?: string | null) => {
    const requestId = ++roleOptionsRequestIdRef.current;
    setIsRoleOptionsLoading(true);
    setRoleOptionsError(null);

    try {
      const response = await fetchMotivationRoleOptions(companyId, industryOverride);
      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "MOTIVATION_ROLE_OPTIONS_FETCH_FAILED",
            userMessage: "職種候補の取得に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.fetchRoleOptions",
        );
      }

      const data = await response.json();
      if (requestId !== roleOptionsRequestIdRef.current) {
        return null;
      }
      setRoleOptionsData(data);
      return data as RoleOptionsResponse;
    } catch (err) {
      if (requestId !== roleOptionsRequestIdRef.current) {
        return null;
      }
      setRoleOptionsData(null);
      setRoleOptionsError(
        reportUserFacingError(
          err,
          {
            code: "MOTIVATION_ROLE_OPTIONS_FETCH_FAILED",
            userMessage: "職種候補の取得に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.fetchRoleOptions",
        ),
      );
      return null;
    } finally {
      if (requestId === roleOptionsRequestIdRef.current) {
        setIsRoleOptionsLoading(false);
      }
    }
  }, [companyId]);

  const resetConversationState = useCallback(() => {
    startTransition(() => {
      setMessages([]);
      setNextQuestion(null);
      setQuestionCount(0);
      setIsDraftReady(false);
      setAnswer("");
      setEvidenceSummary(null);
      setEvidenceCards([]);
      setGeneratedDraft(null);
      setGeneratedDocumentId(null);
      setIsDraftModalOpen(false);
      setQuestionStage(null);
      setStageStatus(null);
      setCoachingFocus(null);
      setConversationMode("slot_fill");
      setCurrentSlot(null);
      setCurrentIntent(null);
      setNextAdvanceCondition(null);
      setProgress(null);
      setCausalGaps([]);
      setConversationLoadError(null);
      setSetupSnapshot(null);
      setSelectedIndustry("");
      setSelectedRoleName("");
      setRoleSelectionSource(null);
      setCustomRoleInput("");
      setPendingCompleteData(null);
      setStreamingTargetText("");
      setIsTextStreaming(false);
      setStreamingSessionId((prev) => prev + 1);
    });
  }, []);

  const fetchData = useCallback(async () => {
    const requestId = ++fetchDataRequestIdRef.current;
    setError(null);
    setConversationLoadError(null);

    try {
      const [companyRes, conversationRes] = await Promise.all([
        fetchMotivationCompany(companyId),
        fetchMotivationConversation(companyId),
      ]);

      if (!companyRes.ok) {
        throw await parseApiErrorResponse(
          companyRes,
          {
            code: "MOTIVATION_COMPANY_FETCH_FAILED",
            userMessage: "企業情報の取得に失敗しました。",
            action: "ページを再読み込みして、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.fetchData.company",
        );
      }

      const companyData = await companyRes.json();
      if (requestId !== fetchDataRequestIdRef.current) {
        return;
      }
      setCompany(companyData.company);

      const conversationData = conversationRes.ok ? await conversationRes.json() : null;
      const setupIndustry =
        conversationData?.setup?.selectedIndustry ||
        conversationData?.setup?.resolvedIndustry ||
        conversationData?.conversationContext?.selectedIndustry ||
        companyData.company.industry ||
        null;
      const roleData = await fetchRoleOptions(setupIndustry);
      if (requestId !== fetchDataRequestIdRef.current) {
        return;
      }

      if (conversationData) {
        applyConversationPayload(conversationData, roleData);
        return;
      }

      const errorData = await conversationRes.json().catch(() => null);
      const message =
        typeof errorData?.error === "string"
          ? errorData.error
          : "保存済みの会話は復元できませんでした。業界と職種を選び直して再開できます。";

      applyConversationPayload({
        messages: [],
        nextQuestion: null,
        questionCount: 0,
        isDraftReady: false,
        evidenceSummary: null,
        evidenceCards: [],
        generatedDraft: null,
        questionStage: null,
        stageStatus: null,
        coachingFocus: null,
        conversationMode: "slot_fill",
        currentSlot: null,
        currentIntent: null,
        nextAdvanceCondition: null,
        progress: null,
        causalGaps: [],
        conversationContext: {
          selectedIndustry: roleData?.industry || companyData.company.industry,
          selectedRole: null,
          selectedRoleSource: null,
        },
        setup: {
          selectedIndustry: roleData?.industry || companyData.company.industry,
          selectedRole: null,
          selectedRoleSource: null,
          requiresIndustrySelection: Boolean(roleData?.requiresIndustrySelection),
          resolvedIndustry: roleData?.industry || companyData.company.industry,
          isComplete: false,
          requiresRestart: false,
          hasSavedConversation: false,
        },
      }, roleData);
      setConversationLoadError(message);
    } catch (err) {
      if (requestId !== fetchDataRequestIdRef.current) {
        return;
      }
      setError(
        reportUserFacingError(
          err,
          {
            code: "MOTIVATION_DATA_FETCH_FAILED",
            userMessage: "データの取得に失敗しました。",
            action: "ページを再読み込みして、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.fetchData",
        ),
      );
    } finally {
      if (requestId === fetchDataRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [applyConversationPayload, companyId, fetchRoleOptions]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!pendingCompleteData || !isTextStreaming) {
      return;
    }
    if (!isPlaybackComplete) {
      return;
    }

    const timer = window.setTimeout(() => {
      startTransition(() => {
        setMessages(pendingCompleteData.messages);
        setNextQuestion(pendingCompleteData.nextQuestion);
        setQuestionCount(pendingCompleteData.questionCount || 0);
        setIsDraftReady(pendingCompleteData.isDraftReady || false);
        setEvidenceSummary(pendingCompleteData.evidenceSummary || null);
        setEvidenceCards(pendingCompleteData.evidenceCards || []);
        setQuestionStage(pendingCompleteData.questionStage || null);
        setStageStatus(pendingCompleteData.stageStatus || null);
        setCoachingFocus(pendingCompleteData.coachingFocus || null);
        setConversationMode(pendingCompleteData.conversationMode || "slot_fill");
        setCurrentSlot(pendingCompleteData.currentSlot || null);
        setCurrentIntent(pendingCompleteData.currentIntent || null);
        setNextAdvanceCondition(pendingCompleteData.nextAdvanceCondition || null);
        setProgress(pendingCompleteData.progress || null);
        setCausalGaps(pendingCompleteData.causalGaps || []);
        setPendingCompleteData(null);
        setIsTextStreaming(false);
        setStreamingTargetText("");
      });
      if (pendingCompleteData.draftReadyJustUnlocked) {
        notifyMotivationDraftReady();
      }
    }, 180);

    return () => window.clearTimeout(timer);
  }, [isPlaybackComplete, isTextStreaming, pendingCompleteData]);

  const handleIndustryChange = useCallback(async (value: string) => {
    setSelectedIndustry(value);
    setSelectedRoleName("");
    setRoleSelectionSource(null);
    setCustomRoleInput("");

    const nextRoleOptions = await fetchRoleOptions(value);
    if (!nextRoleOptions) {
      return;
    }

    setSelectedIndustry(value || nextRoleOptions.industry || "");
  }, [fetchRoleOptions]);

  const handleStartConversation = useCallback(async () => {
    if (isStartingConversation || isSending || isLocked) return;

    const trimmedRole = selectedRoleName.trim();
    const requiresIndustrySelection = Boolean(roleOptionsData?.requiresIndustrySelection);
    const resolvedIndustry = selectedIndustry || roleOptionsData?.industry || setupSnapshot?.resolvedIndustry || "";

    if (!trimmedRole || (requiresIndustrySelection && !resolvedIndustry)) {
      setError("先に業界と職種の設定を完了してください");
      return;
    }

    if (!acquireLock("質問を準備中")) {
      setError(`${activeOperationLabel || "別の操作"}が進行中です。完了までお待ちください。`);
      return;
    }

    setIsStartingConversation(true);
    setError(null);
    setConversationLoadError(null);

    try {
      const response = await startMotivationConversation(companyId, {
        selectedIndustry: requiresIndustrySelection ? resolvedIndustry : null,
        selectedRole: trimmedRole,
        roleSelectionSource:
          roleSelectionSource === "custom"
            ? "user_free_text"
            : roleSelectionSource,
      });

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "MOTIVATION_CONVERSATION_START_FAILED",
            userMessage: "会話の開始に失敗しました。",
            action: "入力内容を確認して、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.handleStartConversation",
        );
      }

      const data = await response.json();
      applyConversationPayload(data, roleOptionsData);
    } catch (err) {
      setError(
        reportUserFacingError(
          err,
          {
            code: "MOTIVATION_CONVERSATION_START_FAILED",
            userMessage: "会話の開始に失敗しました。",
            action: "入力内容を確認して、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.handleStartConversation",
        ),
      );
    } finally {
      setIsStartingConversation(false);
      releaseLock();
    }
  }, [
    acquireLock,
    activeOperationLabel,
    applyConversationPayload,
    companyId,
    isLocked,
    isSending,
    isStartingConversation,
    releaseLock,
    roleOptionsData,
    roleSelectionSource,
    selectedIndustry,
    selectedRoleName,
    setupSnapshot?.resolvedIndustry,
  ]);

  const handleGenerateDraftDirect = useCallback(async () => {
    if (isGeneratingDraft || isStartingConversation || isSending || isLocked) return;

    const trimmedRole = selectedRoleName.trim();
    const requiresIndustrySelection = Boolean(roleOptionsData?.requiresIndustrySelection);
    const resolvedIndustry =
      selectedIndustry || roleOptionsData?.industry || setupSnapshot?.resolvedIndustry || "";

    if (!trimmedRole || (requiresIndustrySelection && !resolvedIndustry)) {
      setError("先に業界と職種の設定を完了してください");
      return;
    }

    if (!acquireLock("志望動機を生成中")) {
      setError(`${activeOperationLabel || "別の操作"}が進行中です。完了までお待ちください。`);
      return;
    }

    setIsGeneratingDraft(true);
    setError(null);
    setConversationLoadError(null);

    try {
      const response = await generateMotivationDraftDirect(companyId, {
        charLimit,
        selectedIndustry: requiresIndustrySelection ? resolvedIndustry : null,
        selectedRole: trimmedRole,
        roleSelectionSource:
          roleSelectionSource === "custom" ? "user_free_text" : roleSelectionSource,
      });

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "MOTIVATION_DRAFT_DIRECT_FAILED",
            userMessage: "会話なし下書きの生成に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.handleGenerateDraftDirect",
        );
      }

      const data = await response.json().catch(() => null);
      setGeneratedDocumentId(null);

      if (data) {
        applyConversationPayload({
          messages: data.messages ?? [],
          nextQuestion: data.nextQuestion ?? null,
          questionCount: data.questionCount ?? 0,
          isDraftReady: true,
          generatedDraft: data.draft ?? null,
          ...(data.evidenceSummary != null && { evidenceSummary: data.evidenceSummary }),
          ...(data.evidenceCards != null && { evidenceCards: data.evidenceCards }),
          ...(data.questionStage != null && { questionStage: data.questionStage }),
          ...(data.stageStatus != null && { stageStatus: data.stageStatus }),
          ...(data.coachingFocus != null && { coachingFocus: data.coachingFocus }),
          ...(data.conversationMode != null && { conversationMode: data.conversationMode }),
          ...(data.currentSlot != null && { currentSlot: data.currentSlot }),
          ...(data.currentIntent != null && { currentIntent: data.currentIntent }),
          ...(data.nextAdvanceCondition != null && { nextAdvanceCondition: data.nextAdvanceCondition }),
          ...(data.progress != null && { progress: data.progress }),
          ...(data.causalGaps != null && { causalGaps: data.causalGaps }),
        }, roleOptionsData);
      } else {
        await fetchData();
      }
    } catch (err) {
      setError(
        reportUserFacingError(
          err,
          {
            code: "MOTIVATION_DRAFT_DIRECT_FAILED",
            userMessage: "会話なし下書きの生成に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.handleGenerateDraftDirect",
        ),
      );
    } finally {
      setIsGeneratingDraft(false);
      releaseLock();
    }
  }, [
    acquireLock,
    activeOperationLabel,
    applyConversationPayload,
    charLimit,
    companyId,
    fetchData,
    isGeneratingDraft,
    isLocked,
    isSending,
    isStartingConversation,
    releaseLock,
    roleOptionsData,
    roleSelectionSource,
    selectedIndustry,
    selectedRoleName,
    setupSnapshot?.resolvedIndustry,
  ]);

  const handleSend = useCallback(async () => {
    const textToSend = answer.trim();
    if (!textToSend || isSending) return;
    if (!acquireLock("AIに送信中")) {
      setError(`${activeOperationLabel || "別の操作"}が進行中です。完了までお待ちください。`);
      return;
    }

    const optimisticUpdate = appendOptimisticUserMessage(messages, "optimistic", (optimisticId) => ({
      id: optimisticId,
      role: "user" as const,
      content: textToSend,
      isOptimistic: true,
    }));
    const optimisticId = optimisticUpdate.optimisticId;

    setMessages(optimisticUpdate.messages);
    setAnswer("");
    setIsSending(true);
    setIsWaitingForResponse(true);
    setError(null);
    setPendingCompleteData(null);
    setStreamingTargetText("");
    setIsTextStreaming(false);
    setStreamingSessionId((prev) => prev + 1);
    setStreamingLabel(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90_000);
    let startedQuestionPlayback = false;

    try {
      const response = await streamMotivationConversation(
        companyId,
        { answer: textToSend },
        controller.signal,
      );

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "MOTIVATION_CONVERSATION_STREAM_FAILED",
            userMessage: "送信に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.handleSend",
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("ストリームが取得できませんでした");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;

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
          } else if (event.type === "complete") {
            completed = true;
            const data = event.data;
            const nextData: PendingCompleteData = {
              messages: withIds(data.messages || []),
              nextQuestion: data.nextQuestion,
              questionCount: data.questionCount || 0,
              isDraftReady: data.isDraftReady || false,
              draftReadyJustUnlocked: data.draftReadyJustUnlocked || false,
              evidenceSummary: data.evidenceSummary || null,
              evidenceCards: data.evidenceCards || [],
              questionStage: data.questionStage || null,
              stageStatus: data.stageStatus || null,
              coachingFocus: data.coachingFocus || null,
              conversationMode: data.conversationMode || "slot_fill",
              currentSlot: data.currentSlot || null,
              currentIntent: data.currentIntent || null,
              nextAdvanceCondition: data.nextAdvanceCondition || null,
              progress: data.progress || null,
              causalGaps: data.causalGaps || [],
            };
            const questionForPlayback =
              typeof nextData.nextQuestion === "string"
                ? nextData.nextQuestion.trim()
                : "";

            if (startedQuestionPlayback) {
              if (questionForPlayback) {
                setStreamingTargetText(questionForPlayback);
              }
              setPendingCompleteData(nextData);
            } else if (questionForPlayback) {
              setStreamingTargetText(questionForPlayback);
              setIsTextStreaming(true);
              setIsWaitingForResponse(false);
              setPendingCompleteData(nextData);
              startedQuestionPlayback = true;
            } else {
              setMessages(nextData.messages);
              setNextQuestion(nextData.nextQuestion);
              setQuestionCount(nextData.questionCount);
              setIsDraftReady(nextData.isDraftReady);
              setEvidenceSummary(nextData.evidenceSummary);
              setEvidenceCards(nextData.evidenceCards);
              setQuestionStage(nextData.questionStage);
              setStageStatus(nextData.stageStatus);
              setCoachingFocus(nextData.coachingFocus || null);
              setConversationMode(nextData.conversationMode || "slot_fill");
              setCurrentSlot(nextData.currentSlot || null);
              setCurrentIntent(nextData.currentIntent || null);
              setNextAdvanceCondition(nextData.nextAdvanceCondition || null);
              setProgress(nextData.progress || null);
              setCausalGaps(nextData.causalGaps || []);
              if (nextData.draftReadyJustUnlocked) {
                notifyMotivationDraftReady();
              }
            }
          } else if (event.type === "error") {
            throw new Error(event.message || "AIサービスでエラーが発生しました");
          }
        }
      }

      if (!completed) {
        throw new Error("ストリームが途中で切断されました");
      }
    } catch (err) {
      setMessages((prev) => rollbackOptimisticMessageById(prev, optimisticId));
      setPendingCompleteData(null);
      setStreamingTargetText("");
      setIsTextStreaming(false);
      if (err instanceof Error && err.name === "AbortError") {
        setError("AIの応答に時間がかかりすぎています。再度お試しください。");
      } else {
        setError(
          reportUserFacingError(
            err,
            {
              code: "MOTIVATION_CONVERSATION_STREAM_FAILED",
              userMessage: "送信に失敗しました。",
              action: "時間を置いて、もう一度お試しください。",
              retryable: true,
            },
            "MotivationPage.handleSend",
          ),
        );
      }
      await fetchData();
    } finally {
      clearTimeout(timeoutId);
      setIsSending(false);
      setIsWaitingForResponse(false);
      setStreamingLabel(null);
      if (!startedQuestionPlayback) {
        setStreamingTargetText("");
        setIsTextStreaming(false);
      }
      releaseLock();
    }
  }, [acquireLock, activeOperationLabel, answer, companyId, fetchData, isSending, releaseLock]);

  const handleGenerateDraft = useCallback(async () => {
    if (isGeneratingDraft || messages.length === 0 || !isDraftReady || isStartingConversation) return;
    if (!acquireLock("志望動機を生成中")) return;

    setIsGeneratingDraft(true);
    setError(null);

    try {
      const response = await generateMotivationDraft(companyId, { charLimit });

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "MOTIVATION_DRAFT_GENERATE_FAILED",
            userMessage: "ES生成に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.handleGenerateDraft",
        );
      }

      const data = await response.json();
      setGeneratedDocumentId(null);

      applyConversationPayload({
        messages: data.messages || messages,
        nextQuestion: data.nextQuestion ?? null,
        questionCount: questionCount,
        isDraftReady: true,
        generatedDraft: data.draft,
        ...(data.evidenceSummary != null && { evidenceSummary: data.evidenceSummary }),
        ...(data.evidenceCards != null && { evidenceCards: data.evidenceCards }),
        ...(data.questionStage != null && { questionStage: data.questionStage }),
        ...(data.stageStatus != null && { stageStatus: data.stageStatus }),
        ...(data.coachingFocus != null && { coachingFocus: data.coachingFocus }),
        ...(data.conversationMode != null && { conversationMode: data.conversationMode }),
        ...(data.currentSlot != null && { currentSlot: data.currentSlot }),
        ...(data.currentIntent != null && { currentIntent: data.currentIntent }),
        ...(data.nextAdvanceCondition != null && { nextAdvanceCondition: data.nextAdvanceCondition }),
        ...(data.progress != null && { progress: data.progress }),
        ...(data.causalGaps != null && { causalGaps: data.causalGaps }),
      }, roleOptionsData);

      notifyMotivationDraftGenerated();
      setIsDraftModalOpen(true);

      if (!data.nextQuestion && data.draft) {
        setError("深掘り質問の取得に失敗しました。モーダルを閉じた後「再試行」で再取得できます。");
      }
    } catch (err) {
      setError(
        reportUserFacingError(
          err,
          {
            code: "MOTIVATION_DRAFT_GENERATE_FAILED",
            userMessage: "ES生成に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.handleGenerateDraft",
        ),
      );
    } finally {
      setIsGeneratingDraft(false);
      releaseLock();
    }
  }, [acquireLock, applyConversationPayload, charLimit, companyId, isDraftReady, isGeneratingDraft, isStartingConversation, messages, questionCount, releaseLock, roleOptionsData]);

  const handleSaveGeneratedDraft = useCallback(async (): Promise<string | null> => {
    if (!generatedDraft || generatedDocumentId || isSavingDraft || isGeneratingDraft || isLocked) return null;

    if (!acquireLock("下書きを保存中")) {
      setError(`${activeOperationLabel || "別の操作"}が進行中です。完了までお待ちください。`);
      return null;
    }

    setIsSavingDraft(true);
    setError(null);

    try {
      const response = await saveMotivationDraft(companyId);
      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "MOTIVATION_DRAFT_SAVE_FAILED",
            userMessage: "下書きを保存できませんでした。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.handleSaveGeneratedDraft",
        );
      }

      const data = await response.json();
      const docId = typeof data.documentId === "string" ? data.documentId : null;
      setGeneratedDocumentId(docId);
      notifyMotivationDraftSaved();
      return docId;
    } catch (err) {
      setError(
        reportUserFacingError(
          err,
          {
            code: "MOTIVATION_DRAFT_SAVE_FAILED",
            userMessage: "下書きを保存できませんでした。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.handleSaveGeneratedDraft",
        ),
      );
      return null;
    } finally {
      setIsSavingDraft(false);
      releaseLock();
    }
  }, [
    acquireLock,
    activeOperationLabel,
    companyId,
    generatedDocumentId,
    generatedDraft,
    isGeneratingDraft,
    isLocked,
    isSavingDraft,
    releaseLock,
  ]);

  const handleResumeDeepDive = useCallback(async () => {
    if (!generatedDraft || isLocked) return;
    if (!acquireLock("深掘り質問を取得中")) return;
    setError(null);

    try {
      const response = await resumeMotivationDeepDive(companyId);
      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "MOTIVATION_RESUME_DEEPDIVE_FAILED",
            userMessage: "深掘り質問の取得に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.handleResumeDeepDive",
        );
      }

      const data = await response.json();
      setGeneratedDocumentId(null);
      applyConversationPayload(data, roleOptionsData);
    } catch (err) {
      setError(
        reportUserFacingError(
          err,
          {
            code: "MOTIVATION_RESUME_DEEPDIVE_FAILED",
            userMessage: "深掘り質問の取得に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.handleResumeDeepDive",
        ),
      );
    } finally {
      releaseLock();
    }
  }, [acquireLock, applyConversationPayload, companyId, generatedDraft, isLocked, releaseLock, roleOptionsData]);

  const handleCloseDraftModal = useCallback(() => {
    setIsDraftModalOpen(false);
  }, []);

  const handleResetConversation = useCallback(async () => {
    if (isSending || isGeneratingDraft || isResetting || isWaitingForResponse || isTextStreaming || isStartingConversation) {
      return;
    }

    if (!window.confirm("保存済みの志望動機会話を初期化して、会話をやり直します。よろしいですか？")) {
      return;
    }

    if (!acquireLock("会話を初期化中")) {
      setError(`${activeOperationLabel || "別の操作"}が進行中です。完了までお待ちください。`);
      return;
    }

    setIsResetting(true);
    setError(null);

    try {
      const response = await resetMotivationConversation(companyId);
      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "MOTIVATION_CONVERSATION_RESET_FAILED",
            userMessage: "会話の初期化に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.handleResetConversation",
        );
      }

      resetConversationState();
      await fetchData();
    } catch (err) {
      setError(
        reportUserFacingError(
          err,
          {
            code: "MOTIVATION_CONVERSATION_RESET_FAILED",
            userMessage: "会話の初期化に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.handleResetConversation",
        ),
      );
    } finally {
      setIsResetting(false);
      releaseLock();
    }
  }, [
    acquireLock,
    activeOperationLabel,
    companyId,
    fetchData,
    isGeneratingDraft,
    isResetting,
    isSending,
    isStartingConversation,
    isTextStreaming,
    isWaitingForResponse,
    releaseLock,
    resetConversationState,
  ]);

  return {
    activeOperationLabel,
    answer,
    causalGaps,
    charLimit,
    coachingFocus,
    company,
    conversationLoadError,
    conversationMode,
    currentIntent,
    currentSlot,
    customRoleInput,
    error,
    evidenceCards,
    evidenceSummary,
    fetchData,
    generatedDocumentId,
    generatedDraft,
    handleCloseDraftModal,
    handleGenerateDraft,
    handleGenerateDraftDirect,
    handleIndustryChange,
    handleResetConversation,
    handleResumeDeepDive,
    handleSaveGeneratedDraft,
    handleSend,
    handleStartConversation,
    isDraftModalOpen,
    isDraftReady,
    setIsDraftModalOpen,
    isGeneratingDraft,
    isLoading,
    isLocked,
    isResetting,
    isRoleOptionsLoading,
    isSavingDraft,
    isSending,
    isStartingConversation,
    isTextStreaming,
    isWaitingForResponse,
    messages,
    nextAdvanceCondition,
    nextQuestion,
    progress,
    questionCount,
    questionStage,
    releaseLock,
    roleOptionsData,
    roleOptionsError,
    roleSelectionSource,
    selectedIndustry,
    selectedRoleName,
    setAnswer,
    setCharLimit,
    setConversationLoadError,
    setCustomRoleInput,
    setError,
    setRoleSelectionSource,
    setSelectedRoleName,
    stageStatus,
    streamingLabel,
    streamingText,
    setupSnapshot,
  };
}
