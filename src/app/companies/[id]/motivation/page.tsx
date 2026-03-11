"use client";

import { startTransition, useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import { getDeviceToken } from "@/lib/auth/device-token";
import { ThinkingIndicator, ChatMessage, ChatInput } from "@/components/chat";
import { StreamingChatMessage } from "@/components/chat/StreamingChatMessage";
import { OperationLockProvider, useOperationLock } from "@/hooks/useOperationLock";
import { NavigationGuard } from "@/components/ui/NavigationGuard";
import { useStreamingTextPlayback } from "@/hooks/useStreamingTextPlayback";
import { ReferenceSourceCard, getSourceHostnameLabel } from "@/components/shared/ReferenceSourceCard";

// Icons
const ArrowLeftIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const LoadingSpinner = () => (
  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isOptimistic?: boolean;
}

interface MotivationScores {
  company_understanding: number;
  self_analysis: number;
  career_vision: number;
  differentiation: number;
}

interface Company {
  id: string;
  name: string;
  industry: string | null;
}

type RoleOptionSource =
  | "industry_default"
  | "company_override"
  | "application_job_type"
  | "document_job_type";

type RoleSelectionSource = RoleOptionSource | "custom";

interface RoleOptionItem {
  value: string;
  label: string;
  source: RoleOptionSource;
}

interface RoleGroup {
  id: string;
  label: string;
  options: RoleOptionItem[];
}

interface RoleOptionsResponse {
  companyId: string;
  companyName: string;
  industry: string | null;
  requiresIndustrySelection: boolean;
  industryOptions: string[];
  roleGroups: RoleGroup[];
}

interface MotivationSetupSnapshot {
  selectedIndustry: string | null;
  selectedRole: string | null;
  selectedRoleSource: string | null;
  requiresIndustrySelection: boolean;
  resolvedIndustry: string | null;
  isComplete: boolean;
  requiresRestart: boolean;
  hasSavedConversation: boolean;
}

interface SuggestionOption {
  id: string;
  label: string;
  sourceType: "company" | "gakuchika" | "profile" | "application_job_type" | "hybrid";
  intent:
    | "company_reason"
    | "desired_work"
    | "fit_connection"
    | "differentiation"
    | "closing";
  evidenceSourceIds?: string[];
  rationale?: string | null;
  isTentative?: boolean;
}

interface EvidenceCard {
  sourceId: string;
  title: string;
  contentType: string;
  excerpt: string;
  sourceUrl: string;
  relevanceLabel: string;
}

interface StageStatus {
  current: SuggestionOption["intent"];
  completed: SuggestionOption["intent"][];
  pending: SuggestionOption["intent"][];
}

const STAGE_LABELS: Record<SuggestionOption["intent"], string> = {
  company_reason: "企業志望理由を整理中",
  desired_work: "やりたい仕事を確認中",
  fit_connection: "経験との接続を深掘り中",
  differentiation: "他社との差を整理中",
  closing: "仕上げを整理中",
};

const STAGE_ORDER: SuggestionOption["intent"][] = [
  "company_reason",
  "desired_work",
  "fit_connection",
  "differentiation",
  "closing",
];

function sourceTypeLabel(sourceType: SuggestionOption["sourceType"]) {
  switch (sourceType) {
    case "company":
      return "企業資料ベース";
    case "gakuchika":
      return "ガクチカベース";
    case "profile":
      return "プロフィールベース";
    case "application_job_type":
      return "応募職種ベース";
    case "hybrid":
      return "複合根拠";
    default:
      return "補助候補";
  }
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (typeof window !== "undefined") {
    try {
      const deviceToken = getDeviceToken();
      if (deviceToken) {
        headers["x-device-token"] = deviceToken;
      }
    } catch {
      // Ignore errors
    }
  }
  return headers;
}

function findRoleOption(roleGroups: RoleGroup[], value: string | null | undefined) {
  if (!value) return null;
  return roleGroups.flatMap((group) => group.options).find((option) => option.value === value) || null;
}

function SuggestionChips({
  suggestionOptions,
  stage,
  onSelect,
  disabled = false,
}: {
  suggestionOptions: SuggestionOption[];
  stage?: SuggestionOption["intent"] | null;
  onSelect: (text: string) => void;
  disabled?: boolean;
}) {
  if (suggestionOptions.length === 0) return null;

  const isWorkStage = stage === "desired_work";
  const isReasonStage = stage === "company_reason";

  return (
    <div className="mt-3">
      <p className="mb-2 text-xs text-muted-foreground">
        候補を選んで回答 / 合わない場合はそのまま入力
      </p>
      <div className={cn("gap-2", isWorkStage || isReasonStage ? "grid grid-cols-1" : "flex flex-wrap")}>
        {suggestionOptions.map((option, index) => (
          <button
            key={`${option.id}-${index}`}
            type="button"
            onClick={() => !disabled && onSelect(option.label)}
            disabled={disabled}
            className={cn(
              "rounded-xl border text-left transition-all duration-200 cursor-pointer",
              isWorkStage || isReasonStage ? "w-full px-4 py-3" : "inline-flex items-center px-3 py-2 text-sm",
              "border-amber-200 bg-amber-50 text-amber-900",
              "hover:bg-amber-100 hover:border-amber-300",
              "dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-900/40 dark:hover:border-amber-600",
              "active:scale-[0.97]",
              "opacity-0 animate-fade-up",
              index === 0 && "delay-100",
              index === 1 && "delay-200",
              index === 2 && "delay-300",
              index === 3 && "delay-400",
              disabled && "opacity-50 cursor-not-allowed pointer-events-none"
            )}
          >
            <span className="block text-sm font-medium leading-6 [display:-webkit-box] [-webkit-line-clamp:3] [-webkit-box-orient:vertical] overflow-hidden">
              {option.label}
            </span>
            {(isReasonStage || isWorkStage || option.rationale) && (
              <span className="mt-1 block text-xs text-amber-800/80 dark:text-amber-200/80">
                {sourceTypeLabel(option.sourceType)}
                {option.isTentative ? " / 仮置き候補" : ""}
                {option.rationale ? ` - ${option.rationale}` : ""}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function MotivationEvidenceCards({
  evidenceCards,
  compact = false,
}: {
  evidenceCards: EvidenceCard[];
  compact?: boolean;
}) {
  if (evidenceCards.length === 0) return null;

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {evidenceCards.slice(0, compact ? 2 : 4).map((card) => (
        <ReferenceSourceCard
          key={`${card.sourceId}-${card.sourceUrl}`}
          title={card.title}
          meta={[card.sourceId, card.relevanceLabel, getSourceHostnameLabel(card.sourceUrl)].filter(Boolean).join(" / ")}
          sourceUrl={card.sourceUrl}
          compact={compact}
          excerpt={
            <p
              className={cn(
                "text-muted-foreground",
                compact
                  ? "text-[11px] leading-5 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden"
                  : "text-sm leading-6"
              )}
            >
              {card.excerpt}
            </p>
          }
        />
      ))}
    </div>
  );
}

function MotivationEvidenceSection({
  evidenceCards,
  evidenceSummary,
  compact = false,
  showHeader = true,
}: {
  evidenceCards: EvidenceCard[];
  evidenceSummary: string | null;
  compact?: boolean;
  showHeader?: boolean;
}) {
  if (evidenceCards.length === 0 && !evidenceSummary) return null;

  return (
    <div className={cn("space-y-3", compact ? "rounded-xl border border-border/60 bg-muted/30 px-3 py-3" : undefined)}>
      {showHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={cn("font-semibold text-foreground", compact ? "text-[11px]" : "text-sm")}>
            参考にした企業情報
          </p>
          {evidenceCards.length > 0 ? (
            <Badge variant="outline" className="px-3 py-1 text-[11px]">
              {evidenceCards.length}件
            </Badge>
          ) : null}
        </div>
      ) : null}

      {evidenceCards.length > 0 ? (
        <MotivationEvidenceCards evidenceCards={evidenceCards} compact={compact} />
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">{evidenceSummary}</p>
      )}
    </div>
  );
}

function MotivationStageTracker({ stageStatus }: { stageStatus: StageStatus | null }) {
  if (!stageStatus) return null;

  return (
    <div className="space-y-2">
      {STAGE_ORDER.map((stage) => {
        const isCurrent = stageStatus.current === stage;
        const isCompleted = stageStatus.completed.includes(stage);
        return (
          <div
            key={stage}
            className={cn(
              "rounded-lg border px-3 py-2 text-xs",
              isCurrent && "border-primary/50 bg-primary/5",
              isCompleted && "border-emerald-200 bg-emerald-50 text-emerald-800",
              !isCurrent && !isCompleted && "border-border/60 bg-background text-muted-foreground"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{STAGE_LABELS[stage]}</span>
              <span>
                {isCompleted ? "完了" : isCurrent ? "進行中" : "未着手"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MotivationDraftActionBar({
  charLimit,
  onCharLimitChange,
  onGenerate,
  isGenerating,
  disabled,
  helperText,
  compact = false,
}: {
  charLimit: 300 | 400 | 500;
  onCharLimitChange: (limit: 300 | 400 | 500) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  disabled: boolean;
  helperText: string;
  compact?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className={cn("flex gap-3", compact ? "flex-col" : "items-start justify-between")}>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">志望動機ESを作成</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{helperText}</p>
        </div>
        <Button
          onClick={onGenerate}
          disabled={disabled || isGenerating}
          className={cn("rounded-full", compact ? "h-11 w-full" : "h-11 min-w-[180px]")}
        >
          {isGenerating ? (
            <>
              <LoadingSpinner />
              <span className="ml-2">作成中...</span>
            </>
          ) : (
            "志望動機ESを作成"
          )}
        </Button>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">文字数</p>
        <div className="flex gap-2">
          {([300, 400, 500] as const).map((limit) => (
            <button
              key={limit}
              type="button"
              onClick={() => onCharLimitChange(limit)}
              className={cn(
                "flex-1 rounded-lg border py-2 text-sm transition-colors cursor-pointer",
                charLimit === limit
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-secondary"
              )}
            >
              {limit}字
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Progress bar component for motivation elements
function MotivationProgressBar({ scores }: { scores: MotivationScores | null }) {
  if (!scores) return null;

  const elements = [
    { key: "company_understanding", label: "企業理解", score: scores.company_understanding },
    { key: "self_analysis", label: "自己分析", score: scores.self_analysis },
    { key: "career_vision", label: "キャリアビジョン", score: scores.career_vision },
    { key: "differentiation", label: "差別化", score: scores.differentiation },
  ];

  return (
    <div className="space-y-2">
      {elements.map(({ key, label, score }) => (
        <div key={key} className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium">{score}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-red-400"
              )}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MotivationConversationContent() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as string;
  const { isLocked, activeOperationLabel, acquireLock, releaseLock } = useOperationLock();

  const [company, setCompany] = useState<Company | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [nextQuestion, setNextQuestion] = useState<string | null>(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [conversationLoadError, setConversationLoadError] = useState<string | null>(null);
  const [scores, setScores] = useState<MotivationScores | null>(null);
  const [suggestionOptions, setSuggestionOptions] = useState<SuggestionOption[]>([]);
  const [evidenceSummary, setEvidenceSummary] = useState<string | null>(null);
  const [evidenceCards, setEvidenceCards] = useState<EvidenceCard[]>([]);
  const [, setGeneratedDraft] = useState<string | null>(null);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isStartingConversation, setIsStartingConversation] = useState(false);
  const [charLimit, setCharLimit] = useState<300 | 400 | 500>(400);
  const [streamingLabel, setStreamingLabel] = useState<string | null>(null);
  const [streamingTargetText, setStreamingTargetText] = useState("");
  const [isTextStreaming, setIsTextStreaming] = useState(false);
  const [streamingSessionId, setStreamingSessionId] = useState(0);
  const [questionStage, setQuestionStage] = useState<SuggestionOption["intent"] | null>(null);
  const [stageStatus, setStageStatus] = useState<StageStatus | null>(null);
  const [coachingFocus, setCoachingFocus] = useState<string | null>(null);
  const [roleOptionsData, setRoleOptionsData] = useState<RoleOptionsResponse | null>(null);
  const [isRoleOptionsLoading, setIsRoleOptionsLoading] = useState(false);
  const [roleOptionsError, setRoleOptionsError] = useState<string | null>(null);
  const [setupSnapshot, setSetupSnapshot] = useState<MotivationSetupSnapshot | null>(null);
  const [selectedIndustry, setSelectedIndustry] = useState("");
  const [selectedRoleName, setSelectedRoleName] = useState("");
  const [roleSelectionSource, setRoleSelectionSource] = useState<RoleSelectionSource | null>(null);
  const [customRoleInput, setCustomRoleInput] = useState("");
  const [pendingCompleteData, setPendingCompleteData] = useState<{
    messages: Message[];
    nextQuestion: string | null;
    questionCount: number;
    isCompleted: boolean;
    scores: MotivationScores | null;
    suggestionOptions: SuggestionOption[];
    evidenceSummary: string | null;
    evidenceCards: EvidenceCard[];
    questionStage: SuggestionOption["intent"] | null;
    stageStatus: StageStatus | null;
    coachingFocus: string | null;
  } | null>(null);

  const { displayedText: streamingText, isPlaybackComplete } = useStreamingTextPlayback(
    streamingTargetText,
    { isActive: isTextStreaming, resetKey: streamingSessionId }
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, nextQuestion]);

  useEffect(() => {
    if (!pendingCompleteData || !isTextStreaming) return;
    if (!isPlaybackComplete) return;

    const timer = window.setTimeout(() => {
      startTransition(() => {
        setMessages(pendingCompleteData.messages);
        setNextQuestion(pendingCompleteData.nextQuestion);
        setQuestionCount(pendingCompleteData.questionCount || 0);
        setIsCompleted(pendingCompleteData.isCompleted || false);
        setScores(pendingCompleteData.scores || null);
        setSuggestionOptions(pendingCompleteData.suggestionOptions || []);
        setEvidenceSummary(pendingCompleteData.evidenceSummary || null);
        setEvidenceCards(pendingCompleteData.evidenceCards || []);
        setQuestionStage(pendingCompleteData.questionStage || null);
        setStageStatus(pendingCompleteData.stageStatus || null);
        setCoachingFocus(pendingCompleteData.coachingFocus || null);
        setPendingCompleteData(null);
        setIsTextStreaming(false);
        setStreamingTargetText("");
      });
    }, 180);

    return () => window.clearTimeout(timer);
  }, [isPlaybackComplete, isTextStreaming, pendingCompleteData]);

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
    const selectedOption = roleOptions ? findRoleOption(roleOptions.roleGroups, resolvedRole) : null;
    const resolvedSource = setup?.selectedRoleSource || conversationContext?.selectedRoleSource || selectedOption?.source || null;

    setSetupSnapshot(setup || null);
    setSelectedIndustry(resolvedIndustry);
    setSelectedRoleName(resolvedRole);

    if (resolvedSource === "user_free_text") {
      setRoleSelectionSource("custom");
      setCustomRoleInput(resolvedRole);
      return;
    }

    setRoleSelectionSource((selectedOption?.source || resolvedSource) as RoleSelectionSource | null);
    setCustomRoleInput("");
  }, []);

  const applyConversationPayload = useCallback((convData: {
    messages?: Array<{ role: "user" | "assistant"; content: string; id?: string }>;
    nextQuestion?: string | null;
    questionCount?: number;
    isCompleted?: boolean;
    scores?: MotivationScores | null;
    suggestionOptions?: SuggestionOption[];
    evidenceSummary?: string | null;
    evidenceCards?: EvidenceCard[];
    generatedDraft?: string | null;
    questionStage?: SuggestionOption["intent"] | null;
    stageStatus?: StageStatus | null;
    coachingFocus?: string | null;
    conversationContext?: {
      selectedIndustry?: string | null;
      selectedRole?: string | null;
      selectedRoleSource?: string | null;
    } | null;
    setup?: MotivationSetupSnapshot | null;
    error?: string | null;
  }, roleOptions: RoleOptionsResponse | null) => {
    const messagesWithIds = (convData.messages || []).map(
      (msg, idx) => ({
        ...msg,
        id: msg.id || `msg-${idx}`,
      }),
    );

    setMessages(messagesWithIds);
    setNextQuestion(convData.nextQuestion ?? null);
    setQuestionCount(convData.questionCount || 0);
    setIsCompleted(convData.isCompleted || false);
    setScores(convData.scores || null);
    setSuggestionOptions(convData.suggestionOptions || []);
    setEvidenceSummary(convData.evidenceSummary || null);
    setEvidenceCards(convData.evidenceCards || []);
    setGeneratedDraft(convData.generatedDraft || null);
    setQuestionStage(convData.questionStage || null);
    setStageStatus(convData.stageStatus || null);
    setCoachingFocus(convData.coachingFocus || null);
    applySetupSelection(convData.setup, roleOptions, convData.conversationContext);
    setConversationLoadError(convData.error || null);
  }, [applySetupSelection]);

  const fetchRoleOptions = useCallback(async (
    industryOverride?: string | null,
  ): Promise<RoleOptionsResponse | null> => {
    setIsRoleOptionsLoading(true);
    setRoleOptionsError(null);

    try {
      const params = new URLSearchParams();
      if (industryOverride) {
        params.set("industry", industryOverride);
      }

      const response = await fetch(
        `/api/companies/${companyId}/es-role-options${params.toString() ? `?${params.toString()}` : ""}`,
        {
          headers: buildHeaders(),
          credentials: "include",
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || "職種候補の取得に失敗しました");
      }

      const data = await response.json();
      setRoleOptionsData(data);
      return data;
    } catch (err) {
      setRoleOptionsData(null);
      setRoleOptionsError(err instanceof Error ? err.message : "職種候補の取得に失敗しました");
      return null;
    } finally {
      setIsRoleOptionsLoading(false);
    }
  }, [companyId]);

  const fetchData = useCallback(async () => {
    setError(null);
    setConversationLoadError(null);

    try {
      const headers = buildHeaders();
      const [companyRes, convRes] = await Promise.all([
        fetch(`/api/companies/${companyId}`, {
          headers,
          credentials: "include",
        }),
        fetch(`/api/motivation/${companyId}/conversation`, {
          headers,
          credentials: "include",
        }),
      ]);

      if (!companyRes.ok) throw new Error("企業情報の取得に失敗しました");
      const companyData = await companyRes.json();
      setCompany(companyData.company);

      const convData = convRes.ok ? await convRes.json() : null;
      const setupIndustry =
        convData?.setup?.selectedIndustry ||
        convData?.setup?.resolvedIndustry ||
        convData?.conversationContext?.selectedIndustry ||
        companyData.company.industry ||
        null;
      const roleData = await fetchRoleOptions(setupIndustry);
      if (convData) {
        applyConversationPayload(convData, roleData);
        return;
      }

      const errorData = await convRes.json().catch(() => null);
      const message =
        typeof errorData?.error === "string"
          ? errorData.error
          : "保存済みの会話は復元できませんでした。業界と職種を選び直して再開できます。";

      applyConversationPayload({
        messages: [],
        nextQuestion: null,
        questionCount: 0,
        isCompleted: false,
        scores: null,
        suggestionOptions: [],
        evidenceSummary: null,
        evidenceCards: [],
        generatedDraft: null,
        questionStage: null,
        stageStatus: null,
        coachingFocus: null,
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
      setError(err instanceof Error ? err.message : "データの取得に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, [applyConversationPayload, companyId, fetchRoleOptions]);

  const resetConversationState = useCallback(() => {
    startTransition(() => {
      setMessages([]);
      setNextQuestion(null);
      setQuestionCount(0);
      setIsCompleted(false);
      setAnswer("");
      setScores(null);
      setSuggestionOptions([]);
      setEvidenceSummary(null);
      setEvidenceCards([]);
      setGeneratedDraft(null);
      setQuestionStage(null);
      setStageStatus(null);
      setCoachingFocus(null);
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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleIndustryChange = useCallback(async (value: string) => {
    setSelectedIndustry(value);
    setSelectedRoleName("");
    setRoleSelectionSource(null);
    setCustomRoleInput("");

    const nextRoleOptions = await fetchRoleOptions(value);
    if (!nextRoleOptions) return;

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
      const response = await fetch(`/api/motivation/${companyId}/conversation/start`, {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify({
          selectedIndustry: requiresIndustrySelection ? resolvedIndustry : null,
          selectedRole: trimmedRole,
          roleSelectionSource:
            roleSelectionSource === "custom"
              ? "user_free_text"
              : roleSelectionSource,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "会話の開始に失敗しました");
      }

      const data = await response.json();
      applyConversationPayload(data, roleOptionsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "会話の開始に失敗しました");
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

  // Send answer (from chip click or free-text input)
  const handleSend = async (chipText?: string) => {
    const textToSend = chipText || answer.trim();
    if (!textToSend || isSending) return;
    if (!acquireLock("AIに送信中")) {
      setError(`${activeOperationLabel || "別の操作"}が進行中です。完了までお待ちください。`);
      return;
    }

    const optimisticId = `optimistic-${Date.now()}`;
    const previousSuggestionOptions = suggestionOptions;

    const optimisticMessage: Message = {
      id: optimisticId,
      role: "user",
      content: textToSend,
      isOptimistic: true,
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setAnswer("");
    setSuggestionOptions([]);
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
      const response = await fetch(`/api/motivation/${companyId}/conversation/stream`, {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify({ answer: textToSend }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "送信に失敗しました");
      }

      // Process SSE stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error("ストリームが取得できませんでした");

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

          if (event.type === "string_chunk" && event.path === "question") {
            setStreamingTargetText((prev) => prev + event.text);
            setIsTextStreaming(true);
            setIsWaitingForResponse(false);
            startedQuestionPlayback = true;
          } else if (event.type === "progress") {
            setStreamingLabel(event.label || null);
          } else if (event.type === "complete") {
            completed = true;
            const data = event.data;
            const messagesWithIds = (data.messages || []).map(
              (msg: { role: "user" | "assistant"; content: string; id?: string }, idx: number) => ({
                ...msg,
                id: msg.id || `msg-${idx}`,
              })
            );
            const nextData = {
              messages: messagesWithIds,
              nextQuestion: data.nextQuestion,
              questionCount: data.questionCount || 0,
              isCompleted: data.isCompleted || false,
              scores: data.scores || null,
              suggestionOptions: data.suggestionOptions || [],
              evidenceSummary: data.evidenceSummary || null,
              evidenceCards: data.evidenceCards || [],
              questionStage: data.questionStage || null,
              stageStatus: data.stageStatus || null,
              coachingFocus: data.coachingFocus || null,
            };
            const questionForPlayback =
              !nextData.isCompleted && typeof nextData.nextQuestion === "string"
                ? nextData.nextQuestion.trim()
                : "";

            if (startedQuestionPlayback) {
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
              setIsCompleted(nextData.isCompleted);
              setScores(nextData.scores);
              setSuggestionOptions(nextData.suggestionOptions);
              setEvidenceSummary(nextData.evidenceSummary);
              setEvidenceCards(nextData.evidenceCards);
              setQuestionStage(nextData.questionStage);
              setStageStatus(nextData.stageStatus);
              setCoachingFocus(nextData.coachingFocus || null);
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
      // Remove optimistic message on error and restore previous state
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setAnswer(textToSend);
      setSuggestionOptions(previousSuggestionOptions);
      setPendingCompleteData(null);
      setStreamingTargetText("");
      setIsTextStreaming(false);
      if (err instanceof Error && err.name === "AbortError") {
        setError("AIの応答に時間がかかりすぎています。再度お試しください。");
      } else {
        setError(err instanceof Error ? err.message : "送信に失敗しました");
      }
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
  };

  // Generate ES draft and redirect to ES editor
  const handleGenerateDraft = async () => {
    if (isGeneratingDraft || messages.length === 0 || !isCompleted || isStartingConversation) return;
    if (!acquireLock("志望動機を生成中")) return;

    setIsGeneratingDraft(true);
    setError(null);

    try {
      const response = await fetch(`/api/motivation/${companyId}/generate-draft`, {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify({ charLimit }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "ES生成に失敗しました");
      }

      const data = await response.json();
      setGeneratedDraft(data.draft);

      // Redirect to ES editor if document was created
      if (data.documentId) {
        router.push(`/es/${data.documentId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "ES生成に失敗しました");
    } finally {
      setIsGeneratingDraft(false);
      releaseLock();
    }
  };

  const handleResetConversation = useCallback(async () => {
    if (isSending || isGeneratingDraft || isResetting || isWaitingForResponse || isTextStreaming || isStartingConversation) {
      return;
    }

    if (!window.confirm("保存済みの志望動機会話を初期化して、最初からやり直します。よろしいですか？")) {
      return;
    }

    if (!acquireLock("会話を初期化中")) {
      setError(`${activeOperationLabel || "別の操作"}が進行中です。完了までお待ちください。`);
      return;
    }

    setIsResetting(true);
    setError(null);

    try {
      const response = await fetch(`/api/motivation/${companyId}/conversation`, {
        method: "DELETE",
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "会話の初期化に失敗しました");
      }

      resetConversationState();
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "会話の初期化に失敗しました");
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

  if (isLoading) {
    return (
      <div className="h-screen bg-background flex flex-col overflow-hidden">
        <DashboardHeader />
        <main className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <LoadingSpinner />
            <p className="text-sm text-muted-foreground animate-pulse">
              AIが企業の情報を読み込んでいます...
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="h-screen bg-background flex flex-col overflow-hidden">
        <DashboardHeader />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground">企業が見つかりません</p>
            <Button asChild className="mt-4">
              <Link href="/companies">企業一覧に戻る</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const showStandaloneQuestion =
    !isTextStreaming &&
    !!nextQuestion &&
    !(messages.length > 0 &&
      messages[messages.length - 1].role === "assistant" &&
      messages[messages.length - 1].content === nextQuestion);
  const hasSavedConversation =
    setupSnapshot?.hasSavedConversation ||
    questionCount > 0 ||
    messages.length > 0 ||
    isCompleted;
  const hasStartedConversation = messages.length > 0;
  const requiresIndustrySelection = Boolean(roleOptionsData?.requiresIndustrySelection);
  const effectiveIndustry =
    selectedIndustry ||
    roleOptionsData?.industry ||
    setupSnapshot?.resolvedIndustry ||
    company.industry ||
    "";
  const isSetupComplete = Boolean(selectedRoleName.trim()) && (!requiresIndustrySelection || Boolean(effectiveIndustry));
  const showRestartBlock = Boolean(setupSnapshot?.requiresRestart);
  const showSetupScreen = !showRestartBlock && !hasStartedConversation && !isCompleted;
  const disableSetupEditing = hasStartedConversation || isCompleted;
  const isCustomRoleActive = roleSelectionSource === "custom" && customRoleInput.trim().length > 0;
  const canGenerateDraft =
    isCompleted &&
    messages.length >= 2 &&
    !showSetupScreen &&
    !showRestartBlock;

  const draftHelperText = (() => {
    if (isGeneratingDraft) return "会話内容をもとに志望動機ESを生成しています。";
    if (showRestartBlock) return "会話を初期化すると、再度この企業向けのESを作成できます。";
    if (showSetupScreen) return "質問開始後に、会話内容をもとに志望動機ESを作成できます。";
    if (!isCompleted) return "深掘り完了後に、会話内容から志望動機ESを作成できます。";
    if (isLocked) return "進行中の処理が終わると、志望動機ESを作成できます。";
    return "会話内容から志望動機ESを自動生成して、編集画面へ移動します。";
  })();

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <DashboardHeader />
      <main className="flex-1 overflow-hidden max-w-6xl w-full mx-auto px-4 py-3 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3 shrink-0">
          <Link
            href={`/companies/${companyId}`}
            className="p-2 rounded-lg hover:bg-secondary transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="戻る"
          >
            <ArrowLeftIcon />
          </Link>
          <div>
            <h1 className="text-xl font-bold">志望動機を作成</h1>
            <p className="text-sm text-muted-foreground">{company.name}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 overflow-hidden">
          {/* Chat area */}
          <div className="lg:col-span-2 flex flex-col overflow-hidden border border-border/50 rounded-xl bg-card">
            {/* Mobile progress indicator - shown only below lg */}
            <div className="border-b border-border/50 px-4 py-3 lg:hidden">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground">進捗</span>
                <div className="min-w-[140px] flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${Math.min((questionCount / 8) * 100, 100)}%` }}
                  />
                </div>
                <span className="text-sm font-semibold tabular-nums">{questionCount}/8</span>
                {questionStage ? (
                  <span className="text-xs text-muted-foreground">{STAGE_LABELS[questionStage]}</span>
                ) : null}
                {hasSavedConversation ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetConversation}
                    disabled={isLocked || isSending || isGeneratingDraft || isResetting || isStartingConversation}
                    className="ml-auto h-9 rounded-full px-4 text-xs"
                  >
                    {isResetting ? "初期化中..." : "最初からやり直す"}
                  </Button>
                ) : null}
              </div>
            </div>

            {/* Messages - scrollable */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {showRestartBlock ? (
                <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
                  <p className="text-sm font-semibold text-amber-900">保存済み会話を一度やり直してください</p>
                  <p className="mt-2 text-sm leading-6 text-amber-900/80">
                    この会話は初期設定 UI 追加前の状態です。新しい志望動機フローで続けるには、右上の
                    「最初からやり直す」から会話を初期化してください。
                  </p>
                </div>
              ) : showSetupScreen ? (
                <div className="mx-auto max-w-2xl space-y-4">
                  <div className="rounded-[26px] border border-border/70 bg-background/95 p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">最初に業界と職種を確定します</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          企業情報、ガクチカ、プロフィール、志望職種を踏まえた質問にするため、チャット前に前提を揃えます。
                        </p>
                      </div>
                      {isSetupComplete ? (
                        <Badge variant="soft-success" className="px-3 py-1 text-[11px]">
                          準備完了
                        </Badge>
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                      <div className="space-y-3 rounded-[22px] border border-border/60 bg-background/85 p-4">
                        <div>
                          <p className="text-sm font-semibold text-foreground">企業</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            この企業向けの志望動機を作成します。
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
                          <p className="text-sm font-medium text-foreground">{company.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {effectiveIndustry ? `業界: ${effectiveIndustry}` : "業界は次で指定します"}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3 rounded-[22px] border border-border/60 bg-background/85 p-4">
                        <div>
                          <p className="text-sm font-semibold text-foreground">業界</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {requiresIndustrySelection
                              ? "企業情報だけでは広いため、ここで必須選択します。"
                              : "企業情報から解決できているため確認のみです。"}
                          </p>
                        </div>

                        {requiresIndustrySelection ? (
                          <Select
                            value={selectedIndustry}
                            disabled={disableSetupEditing}
                            onValueChange={(value) => {
                              void handleIndustryChange(value);
                            }}
                          >
                            <SelectTrigger className="h-11 rounded-2xl">
                              <SelectValue placeholder="業界を選択してください" />
                            </SelectTrigger>
                            <SelectContent>
                              {(roleOptionsData?.industryOptions || []).map((industry) => (
                                <SelectItem key={industry} value={industry}>
                                  {industry}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
                            <p className="text-sm font-medium text-foreground">{effectiveIndustry || "業界未取得"}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 rounded-[22px] border border-border/60 bg-background/85 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">志望職種</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            候補から選び、見つからない場合だけ自由入力を使ってください。
                          </p>
                        </div>
                        {isRoleOptionsLoading ? (
                          <span className="text-xs text-muted-foreground">候補を読み込み中...</span>
                        ) : null}
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                        <div>
                          <Select
                            disabled={disableSetupEditing || !effectiveIndustry || (roleOptionsData?.roleGroups.length ?? 0) === 0}
                            value={roleSelectionSource === "custom" ? "" : selectedRoleName}
                            onValueChange={(value) => {
                              const matched = roleOptionsData ? findRoleOption(roleOptionsData.roleGroups, value) : null;
                              setSelectedRoleName(value);
                              setRoleSelectionSource(matched?.source || null);
                              setCustomRoleInput("");
                            }}
                          >
                            <SelectTrigger className="h-11 rounded-2xl">
                              <SelectValue placeholder={effectiveIndustry ? "職種を選択してください" : "先に業界を選択してください"} />
                            </SelectTrigger>
                            <SelectContent>
                              {(roleOptionsData?.roleGroups || []).map((group) => (
                                <SelectGroup key={group.id}>
                                  <SelectLabel className="text-xs font-normal text-muted-foreground">
                                    {group.label}
                                  </SelectLabel>
                                  {group.options.map((option) => (
                                    <SelectItem key={`${group.id}-${option.value}`} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <label className="text-xs font-medium text-muted-foreground">
                            候補にない場合のみ入力
                          </label>
                          <Input
                            className="mt-2"
                            disabled={disableSetupEditing || !effectiveIndustry}
                            placeholder="例: デジタル企画、プロダクトマネージャー"
                            value={customRoleInput}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setCustomRoleInput(nextValue);
                              setSelectedRoleName(nextValue);
                              setRoleSelectionSource(nextValue.trim() ? "custom" : null);
                            }}
                          />
                          {isCustomRoleActive ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              現在は自由入力の職種を優先して質問を組み立てます。
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {roleOptionsError ? (
                        <div className="mt-3 rounded-2xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-muted-foreground">
                          {roleOptionsError}
                        </div>
                      ) : null}

                      {!roleOptionsError && effectiveIndustry && (roleOptionsData?.roleGroups.length ?? 0) === 0 ? (
                        <p className="mt-3 text-xs text-muted-foreground">
                          候補がないため、右側の自由入力で職種を指定してください。
                        </p>
                      ) : null}

                      {(effectiveIndustry || selectedRoleName) && (
                        <div className="mt-4 rounded-2xl border border-border/60 bg-muted/30 px-4 py-3">
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                            現在の設定
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {effectiveIndustry ? (
                              <Badge variant="soft-info" className="px-3 py-1 text-[11px]">
                                業界: {effectiveIndustry}
                              </Badge>
                            ) : null}
                            {selectedRoleName ? (
                              <Badge variant="soft-primary" className="px-3 py-1 text-[11px]">
                                職種: {selectedRoleName}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
                    <p className="text-sm font-medium text-foreground">開始後の流れ</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      最初の質問はこの企業を志望する理由から始め、その後に入社後にやりたい仕事や、経験との接続を深掘りします。
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((msg) => (
                    <ChatMessage
                      key={msg.id}
                      role={msg.role}
                      content={msg.content}
                      isOptimistic={msg.isOptimistic}
                    />
                  ))}

                  {isTextStreaming && (
                    <StreamingChatMessage streamingText={streamingText} isStreaming={true} />
                  )}

                  {isWaitingForResponse && !isTextStreaming ? (
                    <ThinkingIndicator text={streamingLabel || "次の質問を考え中"} />
                  ) : showStandaloneQuestion ? (
                    <div className="space-y-3">
                      {coachingFocus && (
                        <div className="inline-flex items-center rounded-full border border-border/60 bg-background px-3 py-1 text-[11px] text-muted-foreground">
                          今回の狙い: <span className="ml-1 font-medium text-foreground/80">{coachingFocus}</span>
                        </div>
                      )}
                      <ChatMessage role="assistant" content={nextQuestion} />
                      {!isWaitingForResponse && suggestionOptions.length > 0 && (
                        <div className="-mt-1 pl-2">
                          <SuggestionChips
                            suggestionOptions={suggestionOptions}
                            stage={questionStage}
                            onSelect={(text) => handleSend(text)}
                            disabled={isSending || isLocked}
                          />
                        </div>
                      )}
                      {(evidenceCards.length > 0 || evidenceSummary) && (
                        <div className="lg:hidden">
                          <MotivationEvidenceSection
                            evidenceCards={evidenceCards}
                            evidenceSummary={evidenceSummary}
                            compact
                            showHeader
                          />
                        </div>
                      )}
                    </div>
                  ) : null}

                  {!isWaitingForResponse && !isTextStreaming && !showStandaloneQuestion && suggestionOptions.length > 0 && (
                    <div className="pl-2">
                      <SuggestionChips
                        suggestionOptions={suggestionOptions}
                        stage={questionStage}
                        onSelect={(text) => handleSend(text)}
                        disabled={isSending || isLocked}
                      />
                    </div>
                  )}

                  {!isWaitingForResponse && !isTextStreaming && !showStandaloneQuestion && (evidenceCards.length > 0 || evidenceSummary) && (
                    <div className="lg:hidden">
                      <MotivationEvidenceSection
                        evidenceCards={evidenceCards}
                        evidenceSummary={evidenceSummary}
                        compact
                        showHeader
                      />
                    </div>
                  )}
                </>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Error message */}
            {conversationLoadError && (
              <div className="shrink-0 mx-4 mb-2 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-900">
                <span>{conversationLoadError}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-amber-900 hover:text-amber-900"
                  onClick={() => {
                    setConversationLoadError(null);
                    releaseLock();
                    fetchData();
                  }}
                >
                  再試行
                </Button>
              </div>
            )}

            {error && (
              <div className="shrink-0 mx-4 mb-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center justify-between gap-2">
                <span>{error}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-destructive hover:text-destructive"
                  onClick={() => { setError(null); releaseLock(); fetchData(); }}
                >
                  再試行
                </Button>
              </div>
            )}

            {/* Bottom fixed area: input */}
            <div className="shrink-0 border-t border-border/50 p-4 space-y-4">
              <div className="lg:hidden">
                <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
                  <MotivationDraftActionBar
                    charLimit={charLimit}
                    onCharLimitChange={setCharLimit}
                    onGenerate={handleGenerateDraft}
                    isGenerating={isGeneratingDraft}
                    disabled={!canGenerateDraft || isLocked}
                    helperText={draftHelperText}
                    compact
                  />
                </div>
              </div>

              {showSetupScreen ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    設定を確定すると、企業志望理由から質問を始めます。
                  </p>
                  <Button
                    onClick={handleStartConversation}
                    disabled={!isSetupComplete || isRoleOptionsLoading || isStartingConversation || isLocked}
                    className="sm:min-w-40"
                  >
                    {isStartingConversation ? (
                      <>
                        <LoadingSpinner />
                        <span className="ml-2">開始中...</span>
                      </>
                    ) : (
                      "質問を始める"
                    )}
                  </Button>
                </div>
              ) : showRestartBlock ? (
                <p className="text-sm text-muted-foreground">
                  右上の「最初からやり直す」から初期化すると、新しいフローで最初から始められます。
                </p>
              ) : isCompleted ? (
                <div className="flex items-center gap-2 p-4 rounded-lg bg-emerald-500/10 text-emerald-700">
                  <CheckIcon />
                  <span>深掘りが完了しました。志望動機ESを作成できます。</span>
                </div>
              ) : (
                <ChatInput
                  value={answer}
                  onChange={setAnswer}
                  onSend={() => handleSend()}
                  disabled={isSending || !nextQuestion || isLocked || showSetupScreen || showRestartBlock}
                  placeholder="回答を入力..."
                  className="border-t-0 [&>div]:max-w-none [&>div]:px-0 [&>div]:py-0"
                />
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4 lg:flex lg:min-h-0 lg:flex-col lg:space-y-0">
            <div className="space-y-4 lg:flex-1 lg:overflow-y-auto lg:pr-1">
              <Card className="border-border/50">
                <CardHeader className="py-3 flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm font-medium">進捗</CardTitle>
                  {hasSavedConversation ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleResetConversation}
                      disabled={isLocked || isSending || isGeneratingDraft || isResetting || isStartingConversation}
                      className="h-9 rounded-full px-4 text-xs"
                    >
                      {isResetting ? "初期化中..." : "最初からやり直す"}
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="mb-4 flex flex-wrap gap-2">
                    {effectiveIndustry ? (
                      <Badge variant="soft-info" className="px-3 py-1 text-[11px]">
                        業界: {effectiveIndustry}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="px-3 py-1 text-[11px]">
                        業界未確定
                      </Badge>
                    )}
                    {selectedRoleName ? (
                      <Badge variant="soft-primary" className="px-3 py-1 text-[11px]">
                        職種: {selectedRoleName}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="px-3 py-1 text-[11px]">
                        職種未選択
                      </Badge>
                    )}
                  </div>

                  {showSetupScreen ? (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                        <p className="text-sm font-medium text-foreground">開始前の設定</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          業界と職種を確定すると、この企業向けに質問が始まります。
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        最初の質問は企業志望理由、その後にやりたい仕事や経験との接続を深掘りします。
                      </p>
                    </div>
                  ) : showRestartBlock ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
                      <p className="text-sm font-medium text-amber-900">旧会話を再設定します</p>
                      <p className="mt-1 text-xs leading-5 text-amber-900/80">
                        今の保存済み会話は新しい初期設定フローに対応していません。やり直し後に、業界と職種を先に設定してください。
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="text-center mb-4">
                        <span className="text-3xl font-bold">{questionCount}</span>
                        <span className="text-muted-foreground"> / 8問</span>
                      </div>
                      {questionStage && (
                        <p className="mb-3 text-xs text-center text-muted-foreground">{STAGE_LABELS[questionStage]}</p>
                      )}
                      {coachingFocus && (
                        <p className="mb-3 text-xs text-center text-muted-foreground">
                          今回の狙い: <span className="font-medium text-foreground/80">{coachingFocus}</span>
                        </p>
                      )}
                      <MotivationProgressBar scores={scores} />
                      <div className="mt-4">
                        <MotivationStageTracker stageStatus={stageStatus} />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/50">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-medium">参考にした企業情報</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {evidenceCards.length > 0 || evidenceSummary ? (
                    <MotivationEvidenceSection
                      evidenceCards={evidenceCards}
                      evidenceSummary={evidenceSummary}
                      showHeader={false}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      次の質問生成時に、参考にした企業情報がここに表示されます。
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="hidden border-t border-border/50 bg-card/95 px-4 py-4 lg:block lg:shrink-0">
              <MotivationDraftActionBar
                charLimit={charLimit}
                onCharLimitChange={setCharLimit}
                onGenerate={handleGenerateDraft}
                isGenerating={isGeneratingDraft}
                disabled={!canGenerateDraft || isLocked}
                helperText={draftHelperText}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function MotivationConversationPage() {
  return (
    <OperationLockProvider>
      <NavigationGuard />
      <MotivationConversationContent />
    </OperationLockProvider>
  );
}
