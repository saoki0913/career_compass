"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type STARScores } from "./STARProgressBar";
import { cn } from "@/lib/utils";
import { getDeviceToken } from "@/lib/auth/device-token";

// ── Types ──

interface StrengthItem {
  title: string;
  description: string;
}

interface LearningItem {
  title: string;
  description: string;
}

/** New structured format from /structured-summary */
interface StructuredSummary {
  situation_text: string;
  task_text: string;
  action_text: string;
  result_text: string;
  strengths: StrengthItem[];
  learnings: LearningItem[];
  numbers: string[];
}

/** Legacy format from /summary */
interface LegacySummary {
  summary: string;
  key_points: string[];
  numbers: string[];
  strengths: string[];
}

export type GakuchikaSummary = StructuredSummary | LegacySummary;

function isStructuredSummary(s: GakuchikaSummary): s is StructuredSummary {
  return "situation_text" in s;
}

interface CompletionSummaryProps {
  starScores: STARScores;
  summary: GakuchikaSummary | null;
  isLoading: boolean;
  gakuchikaId: string;
  gakuchikaTitle?: string;
  onNewSession?: () => void;
}

// ── Helpers ──

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
      // Ignore
    }
  }
  return headers;
}

const STAR_ELEMENTS = [
  { key: "situation" as const, label: "S", fullLabel: "状況 (S)", icon: "\u{1F4CD}" },
  { key: "task" as const, label: "T", fullLabel: "課題 (T)", icon: "\u{1F3AF}" },
  { key: "action" as const, label: "A", fullLabel: "行動 (A)", icon: "\u26A1" },
  { key: "result" as const, label: "R", fullLabel: "結果 (R)", icon: "\u{1F31F}" },
];

function getScoreColor(score: number): string {
  if (score >= 70) return "text-success";
  if (score >= 40) return "text-amber-500";
  return "text-muted-foreground";
}

function getScoreBg(score: number): string {
  if (score >= 70) return "bg-success/10";
  if (score >= 40) return "bg-amber-500/10";
  return "bg-muted";
}

// ── Skeleton Components ──

function SkeletonText({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse bg-muted rounded-md", className)} />
  );
}

// ── Icons ──

const CheckCircleIcon = () => (
  <svg className="w-10 h-10 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const CopyIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const SpinnerIcon = () => (
  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
  </svg>
);

const PenIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
  </svg>
);

// ── Main Component ──

export function CompletionSummary({
  starScores,
  summary,
  isLoading,
  gakuchikaId,
  gakuchikaTitle,
  onNewSession,
}: CompletionSummaryProps) {
  // ES draft generation state
  const [charLimit, setCharLimit] = useState<300 | 400 | 500>(400);
  const [isDraftGenerating, setIsDraftGenerating] = useState(false);
  const [generatedDraft, setGeneratedDraft] = useState<string | null>(null);
  const [draftDocumentId, setDraftDocumentId] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerateDraft = async () => {
    setIsDraftGenerating(true);
    setDraftError(null);
    setGeneratedDraft(null);
    setDraftDocumentId(null);

    try {
      const res = await fetch(
        `/api/gakuchika/${gakuchikaId}/generate-es-draft`,
        {
          method: "POST",
          headers: buildHeaders(),
          credentials: "include",
          body: JSON.stringify({ charLimit }),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "ES生成に失敗しました");
      }

      const data = await res.json();
      setGeneratedDraft(data.draft);
      setDraftDocumentId(data.documentId);
    } catch (err) {
      setDraftError(
        err instanceof Error ? err.message : "ES生成に失敗しました"
      );
    } finally {
      setIsDraftGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedDraft) return;
    try {
      await navigator.clipboard.writeText(generatedDraft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const structured = summary && isStructuredSummary(summary) ? summary : null;
  const legacy = summary && !isStructuredSummary(summary) ? summary : null;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="text-center space-y-3">
        <div className="flex items-center justify-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-success/10">
            <CheckCircleIcon />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-foreground">
          深掘り完了!
        </h2>
        <p className="text-sm text-muted-foreground">
          ガクチカの要素が十分に集まりました
        </p>
      </div>

      {/* ── Compact STAR Scores ── */}
      <div className="flex items-center justify-center gap-2 sm:gap-3">
        {STAR_ELEMENTS.map((el) => {
          const score = starScores[el.key];
          return (
            <div
              key={el.key}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm",
                getScoreBg(score)
              )}
            >
              <span className="font-semibold text-foreground">{el.label}</span>
              <span className={cn("font-bold tabular-nums", getScoreColor(score))}>
                {score}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── STAR Structured Text (new format only) ── */}
      {isLoading ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">STAR構造化テキスト</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-1">
                <SkeletonText className="h-4 w-24" />
                <SkeletonText className="h-3 w-full" />
                <SkeletonText className="h-3 w-4/5" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : structured ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">STAR構造化テキスト</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {STAR_ELEMENTS.map((el) => {
              const textKey = `${el.key}_text` as keyof StructuredSummary;
              const text = structured[textKey] as string;
              if (!text) return null;
              return (
                <div key={el.key}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-sm">{el.icon}</span>
                    <span className="text-sm font-medium text-foreground">
                      {el.fullLabel}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed pl-6">
                    {text}
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : legacy ? (
        /* Legacy format: show summary as paragraph */
        <Card>
          <CardHeader>
            <CardTitle className="text-base">サマリー</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground/90 leading-relaxed">
              {legacy.summary}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Strengths & Learnings ── */}
      {isLoading ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">強み・学び</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-1">
                <SkeletonText className="h-4 w-28" />
                <SkeletonText className="h-3 w-3/4" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (structured || legacy) ? (
        <Card>
          <CardContent className="pt-6 space-y-5">
            {/* Strengths */}
            {structured && structured.strengths.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
                  <span className="text-base leading-none">
                    {"\u{1F4AA}"}
                  </span>
                  強み
                </h3>
                <div className="space-y-2">
                  {structured.strengths.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 p-2.5 rounded-lg bg-success/5 border border-success/10"
                    >
                      <span className="shrink-0 w-5 h-5 rounded-full bg-success/10 text-success flex items-center justify-center text-[10px] font-bold mt-0.5">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {item.title}
                        </p>
                        {item.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Legacy strengths (string array) */}
            {legacy && legacy.strengths.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
                  <span className="text-base leading-none">
                    {"\u{1F4AA}"}
                  </span>
                  あなたの強み
                </h3>
                <div className="flex flex-wrap gap-2">
                  {legacy.strengths.map((strength, idx) => (
                    <Badge key={idx} variant="soft-success" className="text-xs">
                      {strength}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Learnings (new format only) */}
            {structured && structured.learnings.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
                  <span className="text-base leading-none">
                    {"\u{1F393}"}
                  </span>
                  学び
                </h3>
                <div className="space-y-2">
                  {structured.learnings.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/10"
                    >
                      <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold mt-0.5">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {item.title}
                        </p>
                        {item.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Legacy key points */}
            {legacy && legacy.key_points.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-foreground mb-2">
                  キーポイント
                </h3>
                <ul className="space-y-1.5">
                  {legacy.key_points.map((point, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-sm text-foreground/90"
                    >
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Numbers */}
            {((structured && structured.numbers.length > 0) ||
              (legacy && legacy.numbers.length > 0)) && (
              <div>
                <h3 className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
                  <span className="text-base leading-none">
                    {"\u{1F4CA}"}
                  </span>
                  数字・成果
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(structured?.numbers || legacy?.numbers || []).map(
                    (num, idx) => (
                      <Badge key={idx} variant="soft-info" className="text-xs">
                        {num}
                      </Badge>
                    )
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* ── ES Draft Generation ── */}
      {!isLoading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PenIcon />
              ES下書き生成
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Char limit selector */}
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">
                文字数を選択
              </label>
              <div className="flex gap-2">
                {([300, 400, 500] as const).map((limit) => (
                  <button
                    key={limit}
                    onClick={() => {
                      setCharLimit(limit);
                      setGeneratedDraft(null);
                      setDraftDocumentId(null);
                      setDraftError(null);
                    }}
                    className={cn(
                      "flex-1 py-2 text-sm font-medium rounded-lg border transition-colors",
                      charLimit === limit
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-border hover:bg-muted"
                    )}
                  >
                    {limit}字
                  </button>
                ))}
              </div>
            </div>

            {/* Generate button */}
            {!generatedDraft && (
              <div className="space-y-2">
                <Button
                  onClick={handleGenerateDraft}
                  disabled={isDraftGenerating}
                  className="w-full"
                  size="lg"
                >
                  {isDraftGenerating ? (
                    <span className="flex items-center gap-2">
                      <SpinnerIcon />
                      ES下書きを生成中...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <PenIcon />
                      ES下書きを生成する
                    </span>
                  )}
                </Button>
                <p className="text-[11px] text-center text-muted-foreground">
                  1クレジット消費
                </p>
              </div>
            )}

            {/* Error */}
            {draftError && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive">{draftError}</p>
              </div>
            )}

            {/* Generated draft */}
            {generatedDraft && (
              <div className="space-y-3">
                <div className="relative">
                  <div className="p-4 rounded-lg border bg-muted/30 max-h-60 overflow-y-auto">
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                      {generatedDraft}
                    </p>
                  </div>
                  <div className="absolute top-2 right-2">
                    <span className="text-[10px] text-muted-foreground bg-background/80 px-1.5 py-0.5 rounded">
                      {generatedDraft.length}字
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    className="flex-1"
                  >
                    {copied ? (
                      <span className="flex items-center gap-1.5">
                        <CheckIcon />
                        コピーしました
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <CopyIcon />
                        コピー
                      </span>
                    )}
                  </Button>
                  {draftDocumentId && (
                    <Link
                      href={`/es/${draftDocumentId}`}
                      className="flex-1"
                    >
                      <Button size="sm" className="w-full">
                        <span className="flex items-center gap-1.5">
                          ESエディタで開く
                          <ArrowRightIcon />
                        </span>
                      </Button>
                    </Link>
                  )}
                </div>

                {/* Regenerate */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerateDraft}
                  disabled={isDraftGenerating}
                  className="w-full text-muted-foreground"
                >
                  {isDraftGenerating ? (
                    <span className="flex items-center gap-1.5">
                      <SpinnerIcon />
                      再生成中...
                    </span>
                  ) : (
                    "別のパターンで再生成する"
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── CTAs ── */}
      <div className="space-y-3 pt-2">
        {!generatedDraft && (
          <Link
            href={`/es?gakuchikaId=${gakuchikaId}`}
            className="block"
          >
            <Button
              variant="default"
              className="w-full h-11 text-sm font-medium"
            >
              ESを手動で作成する
            </Button>
          </Link>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {onNewSession && (
            <Button
              variant="outline"
              className="h-10"
              onClick={onNewSession}
            >
              もう一度深掘りする
            </Button>
          )}
          <Link href="/gakuchika" className="block">
            <Button variant="ghost" className="w-full h-10">
              一覧に戻る
            </Button>
          </Link>
        </div>

        {/* Cross-Navigation CTA */}
        <Link
          href="/es?new=1"
          className="block"
        >
          <Button
            variant="default"
            className="w-full h-11 text-sm font-medium flex items-center justify-center gap-2"
          >
            この経験を使ってESを作成する
            <ArrowRightIcon />
          </Button>
        </Link>
      </div>
    </div>
  );
}
