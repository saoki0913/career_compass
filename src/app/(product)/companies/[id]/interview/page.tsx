"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

import { LoginRequiredForAi } from "@/components/auth/LoginRequiredForAi";
import { useAuth } from "@/components/auth/AuthProvider";
import { ConversationActionBar } from "@/components/chat/ConversationActionBar";
import {
  ConversationSidebarCard,
  ConversationWorkspaceShell,
} from "@/components/chat/ConversationWorkspaceShell";
import { ChatInput, ChatMessage, ThinkingIndicator } from "@/components/chat";
import { DashboardHeader } from "@/components/dashboard";
import { ReferenceSourceCard } from "@/components/shared/ReferenceSourceCard";
import { InterviewConversationSkeleton } from "@/components/skeletons/InterviewConversationSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";
import {
  INTERVIEW_STAGE_ORDER,
  getCurrentStageQuestionCount,
  getInterviewTrackerStatus,
  type InterviewStage,
  type InterviewStageStatus,
  type InterviewTurnState,
} from "@/lib/interview/session";
import { notifySuccess } from "@/lib/notifications";
import { cn } from "@/lib/utils";

const INDUSTRY_SELECT_UNSET = "__interview_industry_unset__";
const ROLE_SELECT_UNSET = "__interview_role_unset__";
const INTERVIEW_PERSISTENCE_UNAVAILABLE_CODE = "INTERVIEW_PERSISTENCE_UNAVAILABLE";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type MaterialCard = {
  label: string;
  text: string;
  kind?: "motivation" | "gakuchika" | "es" | "industry_seed" | "company_seed";
};

type Feedback = {
  overall_comment: string;
  scores: {
    company_fit?: number;
    specificity?: number;
    logic?: number;
    persuasiveness?: number;
  };
  strengths: string[];
  improvements: string[];
  improved_answer: string;
  preparation_points: string[];
  premise_consistency?: number;
};

type FeedbackHistoryItem = {
  id: string;
  overallComment: string;
  scores: Feedback["scores"];
  strengths: string[];
  improvements: string[];
  improvedAnswer: string;
  preparationPoints: string[];
  premiseConsistency: number;
  sourceQuestionCount: number;
  createdAt: string;
};

type RoleOptionSource =
  | "industry_default"
  | "company_override"
  | "application_job_type"
  | "document_job_type";

type RoleSelectionSource = RoleOptionSource | "custom";

type RoleOptionItem = {
  value: string;
  label: string;
  source: RoleOptionSource;
};

type RoleGroup = {
  id: string;
  label: string;
  options: RoleOptionItem[];
};

type RoleOptionsResponse = {
  companyId: string;
  companyName: string;
  industry: string | null;
  requiresIndustrySelection: boolean;
  industryOptions: string[];
  roleGroups: RoleGroup[];
};

type SetupState = {
  selectedIndustry: string | null;
  selectedRole: string | null;
  selectedRoleSource: string | null;
  resolvedIndustry: string | null;
  requiresIndustrySelection: boolean;
  industryOptions: string[];
};

type HydratedConversation = {
  id: string | null;
  status: "setup_pending" | "in_progress" | "question_flow_completed" | "feedback_completed";
  messages: Message[];
  turnState: InterviewTurnState;
  stageStatus: InterviewStageStatus;
  questionCount: number;
  questionStage: InterviewStage;
  questionFlowCompleted: boolean;
  feedback: Feedback | null;
  selectedIndustry: string | null;
  selectedRole: string | null;
  selectedRoleSource: string | null;
};

type PendingCompleteData = {
  messages: Message[];
  questionCount: number;
  stageStatus: InterviewStageStatus | null;
  questionStage: InterviewStage | null;
  focus: string | null;
  feedback: Feedback | null;
  questionFlowCompleted: boolean;
  creditCost: number;
  turnState: InterviewTurnState | null;
  feedbackHistories?: FeedbackHistoryItem[];
};

function createEmptyFeedback(): Feedback {
  return {
    overall_comment: "",
    scores: {},
    strengths: [],
    improvements: [],
    improved_answer: "",
    preparation_points: [],
    premise_consistency: undefined,
  };
}

const STAGE_LABELS: Record<InterviewStage, string> = {
  industry_reason: "業界志望理由",
  role_reason: "職種志望理由",
  opening: "導入・人物把握",
  experience: "経験・ガクチカ",
  company_understanding: "企業理解",
  motivation_fit: "志望動機・適合",
  feedback: "最終講評",
};

function scoreEntries(feedback: Feedback | null) {
  if (!feedback) return [];
  return [
    ["企業適合", feedback.scores.company_fit ?? 0],
    ["具体性", feedback.scores.specificity ?? 0],
    ["論理性", feedback.scores.logic ?? 0],
    ["説得力", feedback.scores.persuasiveness ?? 0],
  ] as const;
}

function InterviewStageTracker({
  stageStatus,
  trackerHeadline,
  trackerDetail,
}: {
  stageStatus: InterviewStageStatus | null;
  trackerHeadline: string;
  trackerDetail: string;
}) {
  if (!stageStatus) return null;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{trackerHeadline}</p>
        <p className="text-[11px] text-muted-foreground">{trackerDetail}</p>
      </div>
      <div className="space-y-2">
        {INTERVIEW_STAGE_ORDER.map((stage) => {
          const isCurrent = stageStatus.current === stage;
          const isCompleted = stageStatus.completed.includes(stage);
          return (
            <div
              key={stage}
              className={cn(
                "rounded-[18px] border px-3.5 py-2.5 text-xs shadow-sm transition-colors",
                isCurrent && "border-sky-300 bg-sky-50 text-slate-900",
                isCompleted && "border-emerald-200 bg-emerald-50 text-emerald-900",
                !isCurrent && !isCompleted && "border-border/60 bg-muted/20 text-muted-foreground",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{STAGE_LABELS[stage]}</span>
                <span>{isCompleted ? "完了" : isCurrent ? "進行中" : "未着手"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InterviewMaterialsCard({ materials }: { materials: MaterialCard[] }) {
  const visibleMaterials = materials.slice(0, 5);

  return (
    <div className="space-y-2">
      {materials.length === 0 ? (
        <p className="text-xs leading-5 text-muted-foreground">
          志望動機、ガクチカ、関連 ES がまだ少ないため、企業情報を軸に質問を組み立てます。
        </p>
      ) : (
        <>
          {visibleMaterials.map((material) => (
            <ReferenceSourceCard
              key={`${material.kind ?? material.label}-${material.label}`}
              title={material.label}
              meta={
                material.kind === "motivation"
                  ? "志望動機"
                  : material.kind === "gakuchika"
                    ? "ガクチカ"
                    : material.kind === "es"
                      ? "ES"
                      : material.kind === "industry_seed"
                        ? "業界"
                        : material.kind === "company_seed"
                          ? "企業"
                          : null
              }
              compact
              excerpt={
                <p className="text-[11px] leading-5 text-muted-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                  {material.text}
                </p>
              }
            />
          ))}
        </>
      )}
    </div>
  );
}

function FeedbackHistoryList({
  histories,
  onOpen,
}: {
  histories: FeedbackHistoryItem[];
  onOpen: (item: FeedbackHistoryItem) => void;
}) {
  if (histories.length === 0) {
    return <p className="text-xs text-muted-foreground">まだ最終講評の履歴はありません。</p>;
  }

  return (
    <div className="space-y-2">
      {histories.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onOpen(item)}
          className="w-full rounded-xl border border-border/60 bg-muted/15 px-3 py-2 text-left transition hover:bg-muted/30"
        >
          <p className="text-[11px] text-muted-foreground">
            {new Date(item.createdAt).toLocaleString("ja-JP", {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {" / "}
            {item.sourceQuestionCount}問
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-foreground/80">{item.overallComment}</p>
        </button>
      ))}
    </div>
  );
}

function InterviewFeedbackCard({
  feedback,
  isStreaming = false,
}: {
  feedback: Feedback;
  isStreaming?: boolean;
}) {
  const scoreRows = scoreEntries(feedback);

  return (
    <Card className="border-border/50">
      <CardHeader className="py-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium">最終講評</CardTitle>
          {isStreaming ? <span className="text-[11px] text-muted-foreground">生成中...</span> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-0">
        <p className="min-h-12 text-sm leading-6 text-foreground/90">
          {feedback.overall_comment || (isStreaming ? "講評を組み立てています..." : "講評を表示できませんでした。")}
        </p>

        <div className="grid grid-cols-2 gap-3">
          {scoreRows.map(([label, score]) => (
            <div key={label} className="rounded-xl border border-border/60 bg-background px-3 py-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-lg font-semibold">{score}</p>
            </div>
          ))}
        </div>

        <div>
          <p className="text-sm font-medium">良かった点</p>
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
            {feedback.strengths.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-sm font-medium">改善点</p>
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
            {feedback.improvements.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-sm font-medium">言い換え例</p>
          <p className="mt-2 rounded-xl bg-muted px-4 py-3 text-sm leading-6">
            {feedback.improved_answer || (isStreaming ? "回答例を生成中..." : "まだありません")}
          </p>
        </div>

        <div>
          <p className="text-sm font-medium">次に準備すべき論点</p>
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
            {feedback.preparation_points.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>

        {typeof feedback.premise_consistency === "number" ? (
          <p className="text-xs text-muted-foreground">前提一致度: {feedback.premise_consistency} / 100</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function CompanyInterviewPage() {
  const params = useParams();
  const companyId = params.id as string;
  const { isReady, isAuthenticated } = useAuth();

  const [companyName, setCompanyName] = useState("");
  const [materials, setMaterials] = useState<MaterialCard[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [streamingFeedback, setStreamingFeedback] = useState<Feedback | null>(null);
  const [feedbackHistories, setFeedbackHistories] = useState<FeedbackHistoryItem[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<FeedbackHistoryItem | null>(null);
  const [creditCost, setCreditCost] = useState(6);
  const [questionCount, setQuestionCount] = useState(0);
  const [questionStage, setQuestionStage] = useState<InterviewStage | null>(null);
  const [stageStatus, setStageStatus] = useState<InterviewStageStatus | null>(null);
  const [turnState, setTurnState] = useState<InterviewTurnState | null>(null);
  const [streamingLabel, setStreamingLabel] = useState<string | null>(null);
  const [pendingAssistantMessage, setPendingAssistantMessage] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [questionFlowCompleted, setQuestionFlowCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<string | null>(null);
  const [persistenceUnavailable, setPersistenceUnavailable] = useState(false);

  const [setupState, setSetupState] = useState<SetupState>({
    selectedIndustry: null,
    selectedRole: null,
    selectedRoleSource: null,
    resolvedIndustry: null,
    requiresIndustrySelection: false,
    industryOptions: [],
  });
  const [roleOptionsData, setRoleOptionsData] = useState<RoleOptionsResponse | null>(null);
  const [selectedRoleName, setSelectedRoleName] = useState("");
  const [customRoleName, setCustomRoleName] = useState("");
  const [roleSelectionSource, setRoleSelectionSource] = useState<RoleSelectionSource | null>(null);

  const conversationRef = useRef<HTMLDivElement | null>(null);
  const conversationEndRef = useRef<HTMLDivElement | null>(null);
  const feedbackCardRef = useRef<HTMLDivElement | null>(null);
  const autoScrollEnabledRef = useRef(true);
  const shouldAnnounceFeedbackSuccessRef = useRef(false);

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
  const hasStarted = messages.length > 0 || feedback !== null || questionFlowCompleted;
  const isBusy = isSending || isGeneratingFeedback || isContinuing;
  const isComplete = feedback !== null;
  const visibleFeedback = feedback ?? streamingFeedback;
  const currentStageQuestionCount = getCurrentStageQuestionCount(turnState);
  const trackerStatus = getInterviewTrackerStatus({
    totalQuestionCount: questionCount,
    currentStage: questionStage ?? "industry_reason",
    currentStageQuestionCount,
  });
  const canSend = answer.trim().length > 0 && !isBusy && !isComplete && !questionFlowCompleted && hasStarted;
  const canGenerateFeedback = questionFlowCompleted && !isComplete && !isBusy;
  const canContinue = Boolean(feedback) && !isBusy;
  const feedbackHelperText = questionFlowCompleted
    ? `${questionCount}問の回答をもとに最終講評を作成します。成功時のみ ${creditCost} credits 消費です。`
    : "面接完了後に最終講評を作成できます。";

  useEffect(() => {
    if (!isReady || !isAuthenticated) return;

    let isMounted = true;

    const hydrate = async () => {
      setIsLoading(true);
      setError(null);
      setErrorAction(null);
      setPersistenceUnavailable(false);
      try {
        const [interviewResponse, roleResponse] = await Promise.all([
          fetch(`/api/companies/${companyId}/interview`, { credentials: "include" }),
          fetch(`/api/companies/${companyId}/es-role-options`, { credentials: "include" }),
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
        setCompanyName(interviewData.company?.name || "");
        setMaterials(Array.isArray(interviewData.materials) ? interviewData.materials : []);
        setCreditCost(typeof interviewData.creditCost === "number" ? interviewData.creditCost : 6);
        setFeedbackHistories(Array.isArray(interviewData.feedbackHistories) ? interviewData.feedbackHistories : []);
        setRoleOptionsData(roleData);
        setSetupState(interviewData.setup);
        setPersistenceUnavailable(false);
        setMessages(Array.isArray(conversation?.messages) ? conversation.messages : []);
        setFeedback(conversation?.feedback ?? null);
        setQuestionCount(typeof conversation?.questionCount === "number" ? conversation.questionCount : 0);
        setQuestionStage(conversation?.questionStage ?? null);
        setStageStatus(conversation?.stageStatus ?? interviewData.stageStatus ?? null);
        setTurnState(conversation?.turnState ?? interviewData.turnState ?? null);
        setQuestionFlowCompleted(Boolean(conversation?.questionFlowCompleted));

        const resolvedRole = conversation?.selectedRole || interviewData.setup?.selectedRole || "";
        const matchedRole = roleData?.roleGroups
          ?.flatMap((group) => group.options)
          .find((option) => option.value === resolvedRole);

        setSelectedRoleName(matchedRole ? matchedRole.value : "");
        setCustomRoleName(matchedRole ? "" : resolvedRole);
        setRoleSelectionSource(
          matchedRole
            ? matchedRole.source
            : resolvedRole
              ? "custom"
              : (conversation?.selectedRoleSource as RoleSelectionSource | null) ?? null,
        );
      } catch (fetchError) {
        if (!isMounted) return;
        const uiError = toAppUiError(
          fetchError,
          {
            code: "INTERVIEW_HYDRATE_FAILED",
            userMessage: "面接対策の準備に失敗しました。",
            action: "時間をおいて、もう一度お試しください。",
          },
          "interview:hydrate",
        );
        setError(uiError.message);
        setErrorAction(uiError.action ?? null);
        setPersistenceUnavailable(uiError.code === INTERVIEW_PERSISTENCE_UNAVAILABLE_CODE);
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
  }, [companyId, isAuthenticated, isReady]);

  useEffect(() => {
    const viewport = conversationRef.current?.parentElement;
    if (!viewport) return;

    const handleScroll = () => {
      const distanceFromBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      autoScrollEnabledRef.current = distanceFromBottom < 96;
    };

    handleScroll();
    viewport.addEventListener("scroll", handleScroll);
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, [hasStarted]);

  useEffect(() => {
    if (!autoScrollEnabledRef.current) return;
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [
    messages.length,
    pendingAssistantMessage?.content,
    streamingFeedback?.overall_comment,
    streamingFeedback?.improved_answer,
    streamingFeedback?.strengths.length,
    streamingFeedback?.improvements.length,
    streamingFeedback?.preparation_points.length,
  ]);

  useEffect(() => {
    if (!feedback || !shouldAnnounceFeedbackSuccessRef.current) return;
    shouldAnnounceFeedbackSuccessRef.current = false;
    notifySuccess({
      title: "最終講評を生成しました",
      description: "講評カードを表示しました。内容を確認しながら振り返れます。",
      duration: 4200,
    });
    requestAnimationFrame(() => {
      feedbackCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [feedback]);

  async function runStream(
    path:
      | "/api/companies/[id]/interview/start"
      | "/api/companies/[id]/interview/stream"
      | "/api/companies/[id]/interview/feedback"
      | "/api/companies/[id]/interview/continue",
    body?: Record<string, unknown>,
  ) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90_000);
    let pendingCompleteData: PendingCompleteData | null = null;

    try {
      const resolvedPath =
        path === "/api/companies/[id]/interview/start"
          ? `/api/companies/${companyId}/interview/start`
          : path === "/api/companies/[id]/interview/feedback"
            ? `/api/companies/${companyId}/interview/feedback`
            : path === "/api/companies/[id]/interview/continue"
              ? `/api/companies/${companyId}/interview/continue`
              : `/api/companies/${companyId}/interview/stream`;
      const response = await fetch(resolvedPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body ?? {}),
        signal: controller.signal,
      });

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
            continue;
          }

          if (event.type === "array_item_complete") {
            if (typeof event.path !== "string") continue;
            const [field, indexText] = event.path.split(".");
            const index = Number(indexText);
            if (!Number.isFinite(index)) continue;
            if (!["strengths", "improvements", "preparation_points"].includes(field)) {
              continue;
            }
            setStreamingFeedback((prev) => {
              const next = prev ?? createEmptyFeedback();
              const key = field as "strengths" | "improvements" | "preparation_points";
              const currentItems = [...next[key]];
              currentItems[index] = typeof event.value === "string" ? event.value : String(event.value ?? "");
              return { ...next, [key]: currentItems };
            });
            continue;
          }

          if (event.type === "string_chunk") {
            if (event.path === "question") {
              setPendingAssistantMessage((prev) => ({
                role: "assistant",
                content: `${prev?.content ?? ""}${event.text || ""}`,
              }));
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
            const data = event.data || {};
            pendingCompleteData = {
              messages: Array.isArray(data.messages) ? data.messages : [],
              questionCount: typeof data.questionCount === "number" ? data.questionCount : 0,
              stageStatus: data.stageStatus || null,
              questionStage: data.questionStage || null,
              focus: data.focus || null,
              feedback: data.feedback || null,
              questionFlowCompleted:
                Boolean(data.questionFlowCompleted) || Boolean(data.feedback),
              creditCost: typeof data.creditCost === "number" ? data.creditCost : creditCost,
              turnState: data.turnState || null,
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
        setMessages(completeData.messages);
        setQuestionCount(completeData.questionCount);
        setStageStatus(completeData.stageStatus);
        setQuestionStage(completeData.questionStage);
        setFeedback(completeData.feedback);
        setTurnState(completeData.turnState);
        setQuestionFlowCompleted(completeData.questionFlowCompleted);
        setCreditCost(completeData.creditCost);
        if (completeData.feedbackHistories) {
          setFeedbackHistories(completeData.feedbackHistories);
        }
        setPendingAssistantMessage(null);
      });
    } finally {
      clearTimeout(timeoutId);
      setStreamingLabel(null);
      setPendingAssistantMessage(null);
      if (path !== "/api/companies/[id]/interview/feedback") {
        setStreamingFeedback(null);
      }
    }
  }

  const handleStart = async () => {
    if (!setupComplete || isBusy || hasStarted || persistenceUnavailable) return;
    setIsSending(true);
    setError(null);
    setErrorAction(null);
    try {
      await runStream("/api/companies/[id]/interview/start", {
        selectedIndustry: effectiveIndustry || null,
        selectedRole: resolvedSelectedRole,
        selectedRoleSource:
          roleSelectionSource === "custom" ? "custom" : roleSelectionSource,
      });
    } catch (streamError) {
      const uiError = toAppUiError(
        streamError,
        {
          code: "INTERVIEW_START_FAILED",
          userMessage: "面接対策の開始に失敗しました。",
          action: "少し時間をおいて、もう一度お試しください。",
        },
        "interview:start",
      );
      setError(uiError.message);
      setErrorAction(uiError.action ?? null);
      setPersistenceUnavailable(uiError.code === INTERVIEW_PERSISTENCE_UNAVAILABLE_CODE);
    } finally {
      setIsSending(false);
    }
  };

  const handleSend = async () => {
    if (!canSend) return;
    const optimisticMessages = [...messages, { role: "user" as const, content: answer.trim() }];
    setMessages(optimisticMessages);
    setAnswer("");
    setIsSending(true);
    setError(null);
    setErrorAction(null);

    try {
      await runStream("/api/companies/[id]/interview/stream", { answer: optimisticMessages.at(-1)?.content });
    } catch (streamError) {
      setMessages(messages);
      const uiError = toAppUiError(
        streamError,
        {
          code: "INTERVIEW_SEND_FAILED",
          userMessage: "面接対策の送信に失敗しました。",
          action: "少し時間をおいて、もう一度お試しください。",
        },
        "interview:send",
      );
      setError(uiError.message);
      setErrorAction(uiError.action ?? null);
      setPersistenceUnavailable(uiError.code === INTERVIEW_PERSISTENCE_UNAVAILABLE_CODE);
    } finally {
      setIsSending(false);
    }
  };

  const handleGenerateFeedback = async () => {
    if (!canGenerateFeedback) return;
    setIsGeneratingFeedback(true);
    setStreamingFeedback(createEmptyFeedback());
    setError(null);
    setErrorAction(null);
    shouldAnnounceFeedbackSuccessRef.current = true;
    try {
      await runStream("/api/companies/[id]/interview/feedback");
    } catch (streamError) {
      shouldAnnounceFeedbackSuccessRef.current = false;
      setStreamingFeedback(null);
      const uiError = toAppUiError(
        streamError,
        {
          code: "INTERVIEW_FEEDBACK_FAILED",
          userMessage: "最終講評の作成に失敗しました。",
          action: "少し時間をおいて、もう一度お試しください。",
        },
        "interview:feedback",
      );
      setError(uiError.message);
      setErrorAction(uiError.action ?? null);
      setPersistenceUnavailable(uiError.code === INTERVIEW_PERSISTENCE_UNAVAILABLE_CODE);
    } finally {
      setIsGeneratingFeedback(false);
    }
  };

  const handleContinue = async () => {
    if (!canContinue || persistenceUnavailable) return;
    const previousFeedback = feedback;
    setIsContinuing(true);
    setError(null);
    setErrorAction(null);
    setFeedback(null);
    setStreamingFeedback(null);
    setQuestionFlowCompleted(false);
    try {
      await runStream("/api/companies/[id]/interview/continue");
    } catch (streamError) {
      setFeedback(previousFeedback);
      const uiError = toAppUiError(
        streamError,
        {
          code: "INTERVIEW_CONTINUE_FAILED",
          userMessage: "続きの面接対策を開始できませんでした。",
          action: "少し時間をおいて、もう一度お試しください。",
        },
        "interview:continue",
      );
      setError(uiError.message);
      setErrorAction(uiError.action ?? null);
      setPersistenceUnavailable(uiError.code === INTERVIEW_PERSISTENCE_UNAVAILABLE_CODE);
    } finally {
      setIsContinuing(false);
    }
  };

  const handleReset = async () => {
    if (isBusy || persistenceUnavailable) return;
    setError(null);
    setErrorAction(null);
    try {
      const response = await fetch(`/api/companies/${companyId}/interview/reset`, {
        method: "POST",
        credentials: "include",
      });
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
      setQuestionFlowCompleted(false);
      setFeedbackHistories(Array.isArray(data.feedbackHistories) ? data.feedbackHistories : []);
    } catch (resetError) {
      const uiError = toAppUiError(
        resetError,
        {
          code: "INTERVIEW_RESET_FAILED",
          userMessage: "会話のリセットに失敗しました。",
          action: "少し時間をおいて、もう一度お試しください。",
        },
        "interview:reset",
      );
      setError(uiError.message);
      setErrorAction(uiError.action ?? null);
      setPersistenceUnavailable(uiError.code === INTERVIEW_PERSISTENCE_UNAVAILABLE_CODE);
    }
  };

  if (!isReady || isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader />
        <main>
          <InterviewConversationSkeleton accent="面接の準備を進めています" />
        </main>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginRequiredForAi title="面接対策はログイン後に利用できます" />;
  }

  return (
    <>
      <ConversationWorkspaceShell
        backHref={`/companies/${companyId}`}
        title="面接対策"
        subtitle={companyName || "企業特化模擬面接"}
        actionBar={
          <ConversationActionBar
            helperText={feedbackHelperText}
            actionLabel="最終講評を作成"
            pendingLabel="講評を作成中..."
            onAction={handleGenerateFeedback}
            disabled={!canGenerateFeedback || persistenceUnavailable}
            isPending={isGeneratingFeedback}
          />
        }
        mobileStatus={
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{questionStage ? STAGE_LABELS[questionStage] : "開始前"}</span>
            <span>{questionCount > 0 ? trackerStatus.headline : "開始前"}</span>
          </div>
        }
        conversation={
          !hasStarted ? (
            <div className="space-y-6 px-3 py-2 sm:px-4">
              <div className="rounded-2xl border border-border/60 bg-muted/30 px-5 py-4">
                <p className="text-sm leading-7 text-foreground/90">
                  最初に業界と職種を確定し、その後に「業界を志望する理由」「その職種を志望する理由」を短く確認します。そこから人物・経験・企業理解・適合を 10〜15 問の範囲で深掘りします。
                </p>
              </div>

              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="text-base">面接の前提を決める</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {setupState.requiresIndustrySelection ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">業界</p>
                      <Select
                        value={effectiveIndustry || INDUSTRY_SELECT_UNSET}
                        onValueChange={(value) =>
                          setSetupState((prev) => ({
                            ...prev,
                            selectedIndustry: value === INDUSTRY_SELECT_UNSET ? null : value,
                          }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="業界を選択" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={INDUSTRY_SELECT_UNSET}>業界を選択</SelectItem>
                          {setupState.industryOptions.map((industry) => (
                            <SelectItem key={industry} value={industry}>
                              {industry}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                      業界: {effectiveIndustry || "未設定"}
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-sm font-medium">職種</p>
                    <Select
                      value={
                        roleSelectionSource === "custom"
                          ? ROLE_SELECT_UNSET
                          : (selectedRoleName || ROLE_SELECT_UNSET)
                      }
                      onValueChange={(value) => {
                        if (value === ROLE_SELECT_UNSET) {
                          setSelectedRoleName("");
                          setRoleSelectionSource(null);
                          return;
                        }
                        const option = flattenedRoleOptions.find((item) => item.value === value);
                        setSelectedRoleName(value);
                        setCustomRoleName("");
                        setRoleSelectionSource(option?.source ?? null);
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="候補から選択" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ROLE_SELECT_UNSET}>候補から選択</SelectItem>
                        {roleOptionsData?.roleGroups.map((group) => (
                          <SelectGroup key={group.id}>
                            <SelectLabel>{group.label}</SelectLabel>
                            {group.options.map((option) => (
                              <SelectItem key={`${group.id}-${option.value}`} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={customRoleName}
                      onChange={(event) => {
                        setCustomRoleName(event.target.value);
                        if (event.target.value.trim()) {
                          setSelectedRoleName("");
                          setRoleSelectionSource("custom");
                        }
                      }}
                      placeholder="候補にない場合は自由入力"
                    />
                  </div>

                  {(effectiveIndustry || resolvedSelectedRole) && (
                    <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                      <p>業界: {effectiveIndustry || "未設定"}</p>
                      <p>職種: {resolvedSelectedRole || "未設定"}</p>
                    </div>
                  )}

                  <div className="space-y-3">
                    <Button onClick={handleStart} disabled={!setupComplete || isBusy || persistenceUnavailable} className="w-full sm:w-auto">
                      面接対策を始める
                    </Button>
                    {error ? <p className="text-sm text-destructive">{error}</p> : null}
                    {errorAction ? <p className="text-xs text-muted-foreground">{errorAction}</p> : null}
                    {persistenceUnavailable ? (
                      <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                        現在、面接対策の保存機能を一時的に利用できません。しばらくしてから再度お試しください。
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div ref={conversationRef} className="space-y-4">
              {messages.map((message, index) => (
                <ChatMessage
                  key={`${message.role}-${index}-${message.content.slice(0, 20)}`}
                  role={message.role}
                  content={message.content}
                />
              ))}

              {isBusy && !pendingAssistantMessage && !streamingFeedback?.overall_comment && !streamingFeedback?.improved_answer ? (
                <ThinkingIndicator
                  text={
                    streamingLabel ||
                    (isGeneratingFeedback ? "最終講評をまとめています" : "次の質問を考え中")
                  }
                />
              ) : null}

              {pendingAssistantMessage ? (
                <ChatMessage role="assistant" content={pendingAssistantMessage.content} isStreaming />
              ) : null}

              {questionFlowCompleted && !feedback ? (
                <div className="rounded-2xl border border-border/60 bg-muted/20 px-5 py-4 text-sm text-muted-foreground">
                  {questionCount}問の回答が完了しました。内容を振り返ったうえで、上部の「最終講評を作成」から講評を生成できます。
                </div>
              ) : null}

              {visibleFeedback ? (
                <div ref={feedbackCardRef} className="space-y-3">
                  <InterviewFeedbackCard feedback={visibleFeedback} isStreaming={!feedback} />
                  {feedback ? (
                    <div className="flex flex-wrap gap-3">
                      <Button onClick={handleContinue} disabled={!canContinue || persistenceUnavailable}>
                        面接対策を続ける
                      </Button>
                      <Button variant="outline" onClick={handleReset} disabled={isBusy || persistenceUnavailable}>
                        会話をやり直す
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              {errorAction ? <p className="text-xs text-muted-foreground">{errorAction}</p> : null}
              <div ref={conversationEndRef} />
            </div>
          )
        }
        composer={
          hasStarted && !isComplete ? (
            questionFlowCompleted ? (
              <p className="text-sm text-muted-foreground">
                模擬面接は完了です。必要になったら上部のボタンから最終講評を作成してください。
              </p>
            ) : (
              <ChatInput
                value={answer}
                onChange={setAnswer}
                onSend={handleSend}
                isSending={isBusy}
                disableSend={!canSend || persistenceUnavailable}
                placeholder="回答を入力..."
                className="border-t-0 [&>div]:max-w-none [&>div]:px-0 [&>div]:py-0"
              />
            )
          ) : undefined
        }
        sidebar={
          <>
            <ConversationSidebarCard
              title="進捗"
              actions={
                hasStarted ? (
                  <Button variant="outline" size="sm" onClick={handleReset} disabled={isBusy || persistenceUnavailable} className="h-9 rounded-xl px-3 text-xs shadow-sm">
                    会話をやり直す
                  </Button>
                ) : null
              }
            >
              <InterviewStageTracker
                stageStatus={stageStatus}
                trackerHeadline={trackerStatus.headline}
                trackerDetail={trackerStatus.detail}
              />
            </ConversationSidebarCard>
            <ConversationSidebarCard title="参考にする材料">
              <InterviewMaterialsCard materials={materials} />
            </ConversationSidebarCard>
            <ConversationSidebarCard title="過去の最終講評">
              <FeedbackHistoryList histories={feedbackHistories} onOpen={setSelectedHistory} />
            </ConversationSidebarCard>
          </>
        }
      />

      <Dialog open={Boolean(selectedHistory)} onOpenChange={(open) => !open && setSelectedHistory(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>過去の最終講評</DialogTitle>
            <DialogDescription>
              直近の講評を全文表示しています。面接対策を続ける前の振り返りに使えます。
            </DialogDescription>
          </DialogHeader>
          {selectedHistory ? (
            <div className="space-y-5 text-sm">
              <p className="leading-7 text-foreground/90">{selectedHistory.overallComment}</p>
              <div>
                <p className="font-medium">良かった点</p>
                <ul className="mt-2 space-y-2 text-muted-foreground">
                  {selectedHistory.strengths.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-medium">改善点</p>
                <ul className="mt-2 space-y-2 text-muted-foreground">
                  {selectedHistory.improvements.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-medium">言い換え例</p>
                <p className="mt-2 rounded-xl bg-muted px-4 py-3 leading-7">{selectedHistory.improvedAnswer}</p>
              </div>
              <div>
                <p className="font-medium">次に準備すべき論点</p>
                <ul className="mt-2 space-y-2 text-muted-foreground">
                  {selectedHistory.preparationPoints.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-muted-foreground">前提一致度: {selectedHistory.premiseConsistency} / 100</p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
