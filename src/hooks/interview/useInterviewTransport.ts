"use client";

import { startTransition, useCallback, useState } from "react";

import { parseApiErrorResponse } from "@/lib/api-errors";
import {
  continueInterviewStream,
  generateInterviewFeedbackStream,
  resetInterviewConversation,
  saveInterviewFeedbackSatisfaction,
  sendInterviewAnswerStream,
  startInterviewStream,
} from "@/lib/interview/client-api";

type StreamKind = "start" | "send" | "feedback" | "continue";

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

export function useInterviewTransport({
  companyId,
  domain,
  playback,
  answer,
  setAnswer,
}: {
  companyId: string | null;
  domain: any;
  playback: any;
  answer: string;
  setAnswer: (value: string) => void;
}) {
  const [streamingLabel, setStreamingLabel] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [isSavingSatisfaction, setIsSavingSatisfaction] = useState(false);

  const isBusy = isSending || isGeneratingFeedback || isContinuing;
  const canSend =
    answer.trim().length > 0 && !isBusy && !domain.isComplete && !domain.questionFlowCompleted && domain.hasStarted;
  const canGenerateFeedback = domain.questionFlowCompleted && !domain.isComplete && !isBusy;
  const canContinue = Boolean(domain.feedback) && !isBusy;

  const runStream = useCallback(
    async (kind: StreamKind, body?: Record<string, string | number | boolean | null | undefined>) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90_000);
      let pendingCompleteData: any = null;

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
                domain.setQuestionStage(event.value || null);
              }
              if (event.path === "stage_status") {
                domain.setStageStatus(event.value || null);
              }
              if (event.path === "scores") {
                domain.setStreamingFeedback((prev: any) => ({
                  ...(prev ?? domain.createEmptyFeedback()),
                  scores: typeof event.value === "object" && event.value ? event.value : {},
                }));
              }
              if (event.path === "premise_consistency") {
                domain.setStreamingFeedback((prev: any) => ({
                  ...(prev ?? domain.createEmptyFeedback()),
                  premise_consistency: typeof event.value === "number" ? event.value : undefined,
                }));
              }
              if (event.path === "weakest_question_type") {
                domain.setStreamingFeedback((prev: any) => ({
                  ...(prev ?? domain.createEmptyFeedback()),
                  weakest_question_type: typeof event.value === "string" ? event.value : null,
                }));
              }
              continue;
            }

            if (event.type === "array_item_complete") {
              if (typeof event.path !== "string") continue;
              const [field, indexText] = event.path.split(".");
              const index = Number(indexText);
              if (!Number.isFinite(index) || !isFeedbackArrayField(field)) continue;
              domain.setStreamingFeedback((prev: any) => {
                const next = prev ?? domain.createEmptyFeedback();
                const key = field === "preparation_points" ? "next_preparation" : field;
                const currentItems = [...next[key]];
                currentItems[index] = typeof event.value === "string" ? event.value : String(event.value ?? "");
                return { ...next, [key]: currentItems };
              });
              continue;
            }

            if (event.type === "string_chunk") {
              if (event.path === "question") {
                playback.setPendingAssistantMessage((prev: any) => ({
                  role: "assistant",
                  content: `${prev?.content ?? ""}${event.text || ""}`,
                }));
              }
              if (event.path === "overall_comment" || event.path === "improved_answer") {
                domain.setStreamingFeedback((prev: any) => {
                  const next = prev ?? domain.createEmptyFeedback();
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
              const data = event.data || {};
              pendingCompleteData = {
                messages: Array.isArray(data.messages) ? data.messages : [],
                questionCount: typeof data.questionCount === "number" ? data.questionCount : 0,
                stageStatus: data.stageStatus || null,
                questionStage: data.questionStage || null,
                focus: data.focus || null,
                feedback: data.feedback || null,
                questionFlowCompleted: Boolean(data.questionFlowCompleted) || Boolean(data.feedback),
                creditCost: typeof data.creditCost === "number" ? data.creditCost : domain.creditCost,
                turnState: data.turnState || null,
                turnMeta: data.turnMeta || null,
                plan: data.plan || null,
                feedbackHistories: Array.isArray(data.feedbackHistories) ? data.feedbackHistories : undefined,
              };
            }
          }
        }

        if (!completed || !pendingCompleteData) {
          throw new Error("ストリームが途中で切断されました。");
        }

        const completeData = pendingCompleteData;
        startTransition(() => {
          domain.setMessages(completeData.messages);
          domain.setQuestionCount(completeData.questionCount);
          domain.setStageStatus(completeData.stageStatus);
          domain.setQuestionStage(completeData.questionStage);
          domain.setFeedback(completeData.feedback);
          domain.setTurnState(completeData.turnState);
          domain.setTurnMeta(completeData.turnMeta ?? null);
          domain.setInterviewPlan(completeData.plan ?? null);
          domain.setQuestionFlowCompleted(completeData.questionFlowCompleted);
          domain.setCreditCost(completeData.creditCost);
          if (completeData.feedbackHistories) {
            domain.setFeedbackHistories(completeData.feedbackHistories);
          }
          if (kind === "feedback" && completeData.feedback && domain.shouldAnnounceFeedbackSuccessRef.current) {
            domain.setFeedbackCompletionCount((value: number) => value + 1);
          }
          playback.setPendingAssistantMessage(null);
        });
      } finally {
        clearTimeout(timeoutId);
        setStreamingLabel(null);
        playback.setPendingAssistantMessage(null);
        if (kind !== "feedback") {
          domain.setStreamingFeedback(null);
        }
      }
    },
    [companyId, domain, playback],
  );

  const handleStart = useCallback(async () => {
    if (!domain.setupComplete || isBusy || domain.hasStarted || domain.persistenceUnavailable) return;
    setIsSending(true);
    domain.setError(null);
    domain.setErrorAction(null);
    try {
      await runStream("start", {
        selectedIndustry: domain.effectiveIndustry || null,
        selectedRole: domain.resolvedSelectedRole,
        selectedRoleSource: domain.roleSelectionSource === "custom" ? "custom" : domain.roleSelectionSource,
        roleTrack: domain.setupState.roleTrack,
        interviewFormat: domain.setupState.interviewFormat,
        selectionType: domain.setupState.selectionType,
        interviewStage: domain.setupState.interviewStage,
        interviewerType: domain.setupState.interviewerType,
        strictnessMode: domain.setupState.strictnessMode,
      });
    } catch (streamError) {
      const context = getStreamErrorContext("start");
      domain.reportError(streamError, context, context.source);
    } finally {
      setIsSending(false);
    }
  }, [domain, isBusy, runStream]);

  const handleSend = useCallback(async () => {
    if (!canSend) return;
    const optimisticMessages = [...domain.messages, { role: "user" as const, content: answer.trim() }];
    domain.setMessages(optimisticMessages);
    setAnswer("");
    setIsSending(true);
    domain.setError(null);
    domain.setErrorAction(null);

    try {
      await runStream("send", { answer: optimisticMessages.at(-1)?.content });
    } catch (streamError) {
      domain.setMessages(domain.messages);
      const context = getStreamErrorContext("send");
      domain.reportError(streamError, context, context.source);
    } finally {
      setIsSending(false);
    }
  }, [answer, canSend, domain, runStream, setAnswer]);

  const handleGenerateFeedback = useCallback(async () => {
    if (!canGenerateFeedback) return;
    setIsGeneratingFeedback(true);
    domain.setStreamingFeedback(domain.createEmptyFeedback());
    domain.setError(null);
    domain.setErrorAction(null);
    domain.shouldAnnounceFeedbackSuccessRef.current = true;
    try {
      await runStream("feedback");
    } catch (streamError) {
      domain.shouldAnnounceFeedbackSuccessRef.current = false;
      domain.setStreamingFeedback(null);
      const context = getStreamErrorContext("feedback");
      domain.reportError(streamError, context, context.source);
    } finally {
      setIsGeneratingFeedback(false);
    }
  }, [canGenerateFeedback, domain, runStream]);

  const handleContinue = useCallback(async () => {
    if (!canContinue || domain.persistenceUnavailable) return;
    const previousFeedback = domain.feedback;
    setIsContinuing(true);
    domain.setError(null);
    domain.setErrorAction(null);
    domain.setFeedback(null);
    domain.setStreamingFeedback(null);
    domain.setQuestionFlowCompleted(false);
    try {
      await runStream("continue");
    } catch (streamError) {
      domain.setFeedback(previousFeedback);
      const context = getStreamErrorContext("continue");
      domain.reportError(streamError, context, context.source);
    } finally {
      setIsContinuing(false);
    }
  }, [canContinue, domain, runStream]);

  const handleReset = useCallback(async () => {
    if (!companyId || isBusy || domain.persistenceUnavailable) return;
    domain.setError(null);
    domain.setErrorAction(null);
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
      domain.setMessages([]);
      domain.setFeedback(null);
      domain.setStreamingFeedback(null);
      setAnswer("");
      domain.setQuestionCount(0);
      domain.setQuestionStage(data.conversation?.questionStage ?? null);
      domain.setStageStatus(data.conversation?.stageStatus ?? null);
      domain.setTurnState(data.conversation?.turnState ?? null);
      domain.setTurnMeta(data.conversation?.turnMeta ?? null);
      domain.setInterviewPlan(data.conversation?.plan ?? null);
      domain.setQuestionFlowCompleted(false);
      domain.setLegacySessionDetected(false);
      domain.setFeedbackHistories(Array.isArray(data.feedbackHistories) ? data.feedbackHistories : []);
    } catch (resetError) {
      domain.reportError(
        resetError,
        {
          code: "INTERVIEW_RESET_FAILED",
          userMessage: "会話のリセットに失敗しました。",
          action: "少し時間をおいて、もう一度お試しください。",
        },
        "interview:reset",
      );
    }
  }, [companyId, domain, isBusy, setAnswer]);

  const handleSaveSatisfaction = useCallback(async (score: number) => {
    if (!companyId || !domain.latestFeedbackHistory || isSavingSatisfaction) return;
    setIsSavingSatisfaction(true);
    domain.setError(null);
    domain.setErrorAction(null);
    try {
      const response = await saveInterviewFeedbackSatisfaction(companyId, {
        historyId: domain.latestFeedbackHistory.id,
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

      domain.setFeedbackHistories((prev: any[]) =>
        prev.map((item) =>
          item.id === domain.latestFeedbackHistory.id ? { ...item, satisfactionScore: score } : item,
        ),
      );
      domain.setFeedback((prev: any) => (prev ? { ...prev, satisfaction_score: score } : prev));
    } catch (saveError) {
      domain.reportError(
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
  }, [companyId, domain, isSavingSatisfaction]);

  return {
    streamingLabel,
    isLoading,
    isSending,
    isGeneratingFeedback,
    isContinuing,
    isSavingSatisfaction,
    isBusy,
    canSend,
    canGenerateFeedback,
    canContinue,
    setIsLoading,
    handleStart,
    handleSend,
    handleGenerateFeedback,
    handleContinue,
    handleReset,
    handleSaveSatisfaction,
  };
}
