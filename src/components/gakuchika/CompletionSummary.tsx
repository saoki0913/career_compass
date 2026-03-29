"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { isStructuredSummary, type GakuchikaSummary } from "@/lib/gakuchika/summary";
import { type STARScores } from "./STARProgressBar";

interface CompletionSummaryProps {
  starScores: STARScores;
  summary: GakuchikaSummary | null;
  isLoading: boolean;
  gakuchikaId: string;
  onResumeSession?: () => void;
  hideGenerateAction?: boolean;
}

const STAR_ELEMENTS = [
  { key: "situation" as const, shortLabel: "S", label: "状況" },
  { key: "task" as const, shortLabel: "T", label: "課題" },
  { key: "action" as const, shortLabel: "A", label: "行動" },
  { key: "result" as const, shortLabel: "R", label: "結果" },
];

function getScoreColor(score: number): string {
  if (score >= 70) return "text-success";
  if (score >= 40) return "text-info";
  return "text-muted-foreground";
}

function getScoreSurface(score: number): string {
  if (score >= 70) return "border-success/20 bg-success/5";
  if (score >= 40) return "border-info/20 bg-info/5";
  return "border-border bg-muted/40";
}

function SkeletonText({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

const CheckCircleIcon = () => (
  <svg className="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
  </svg>
);

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold text-foreground">{children}</h3>;
}

export function CompletionSummary({
  starScores,
  summary,
  isLoading,
  gakuchikaId,
  onResumeSession,
  hideGenerateAction = false,
}: CompletionSummaryProps) {
  const structured = summary && isStructuredSummary(summary) ? summary : null;
  const legacy = summary && !isStructuredSummary(summary) ? summary : null;
  const leadText = isLoading
    ? "ここまでで面接で話せる材料はかなり揃いました。要点を整理しています。"
    : "ここまでで面接で話せる材料はかなり揃いました。要点をこのままESや面接で使える形にまとめます。";

  return (
    <div className="space-y-4">
      <div className="max-w-[85%] rounded-2xl bg-muted px-4 py-3 text-sm text-foreground/90">
        {leadText}
      </div>

      <Card className="border-border/60 bg-background shadow-sm">
        <CardContent className="space-y-6 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-success/20 bg-success/10 px-3 py-1 text-xs font-medium text-success">
                <CheckCircleIcon />
                作成完了
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-foreground">ガクチカの材料が揃いました</h2>
                <p className="text-sm text-muted-foreground">
                  そのままESや面接準備に使えるよう、要点だけを見やすく整理しています。
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {STAR_ELEMENTS.map((element) => {
                const score = starScores[element.key];
                return (
                  <div
                    key={element.key}
                    className={cn(
                      "flex min-w-[74px] items-center gap-2 rounded-full border px-3 py-1.5",
                      getScoreSurface(score)
                    )}
                  >
                    <span className="text-xs font-semibold text-foreground">{element.shortLabel}</span>
                    <span className={cn("text-sm font-semibold tabular-nums", getScoreColor(score))}>
                      {score}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2">
                {[1, 2, 3, 4].map((item) => (
                  <div key={item} className="space-y-2 rounded-2xl border border-border bg-muted/20 p-4">
                    <SkeletonText className="h-4 w-20" />
                    <SkeletonText className="h-3 w-full" />
                    <SkeletonText className="h-3 w-4/5" />
                  </div>
                ))}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {[1, 2].map((item) => (
                  <div key={item} className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
                    <SkeletonText className="h-4 w-24" />
                    <SkeletonText className="h-10 w-full" />
                    <SkeletonText className="h-10 w-full" />
                  </div>
                ))}
              </div>
            </div>
          ) : structured ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {STAR_ELEMENTS.map((element) => {
                  const text = structured[`${element.key}_text`];
                  if (!text) return null;

                  return (
                    <section key={element.key} className="rounded-2xl border border-border bg-muted/20 p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
                          {element.shortLabel}
                        </span>
                        <SectionTitle>{element.label}</SectionTitle>
                      </div>
                      <p className="text-sm leading-6 text-foreground/90">{text}</p>
                    </section>
                  );
                })}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {structured.strengths.length > 0 && (
                  <section className="space-y-3 rounded-2xl border border-border bg-background p-4">
                    <SectionTitle>強み</SectionTitle>
                    <div className="space-y-2">
                      {structured.strengths.map((item, index) => (
                        <div
                          key={`${item.title}-${index}`}
                          className="rounded-xl border border-success/15 bg-success/5 p-3"
                        >
                          <p className="text-sm font-medium text-foreground">{item.title}</p>
                          {item.description && (
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {structured.learnings.length > 0 && (
                  <section className="space-y-3 rounded-2xl border border-border bg-background p-4">
                    <SectionTitle>学び</SectionTitle>
                    <div className="space-y-2">
                      {structured.learnings.map((item, index) => (
                        <div
                          key={`${item.title}-${index}`}
                          className="rounded-xl border border-info/15 bg-info/5 p-3"
                        >
                          <p className="text-sm font-medium text-foreground">{item.title}</p>
                          {item.description && (
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                {structured.numbers.length > 0 && (
                  <section className="space-y-3 rounded-2xl border border-border bg-background p-4">
                    <SectionTitle>数字・成果</SectionTitle>
                    <div className="flex flex-wrap gap-2">
                      {structured.numbers.map((numberText, index) => (
                        <Badge key={`${numberText}-${index}`} variant="soft-info" className="text-xs">
                          {numberText}
                        </Badge>
                      ))}
                    </div>
                  </section>
                )}

                {structured.interviewer_hooks && structured.interviewer_hooks.length > 0 && (
                  <section className="space-y-3 rounded-2xl border border-border bg-background p-4">
                    <SectionTitle>面接で広げやすい論点</SectionTitle>
                    <div className="flex flex-wrap gap-2">
                      {structured.interviewer_hooks.slice(0, 3).map((hook, index) => (
                        <Badge key={`${hook}-${index}`} variant="soft-info" className="text-xs">
                          {hook}
                        </Badge>
                      ))}
                    </div>
                  </section>
                )}

                {structured.reusable_principles && structured.reusable_principles.length > 0 && (
                  <section className="space-y-3 rounded-2xl border border-border bg-background p-4">
                    <SectionTitle>再現できる行動原則</SectionTitle>
                    <ul className="space-y-2">
                      {structured.reusable_principles.slice(0, 3).map((principle, index) => (
                        <li key={`${principle}-${index}`} className="text-sm leading-6 text-foreground/90">
                          {principle}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            </>
          ) : legacy ? (
            <section className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4">
              <SectionTitle>要約</SectionTitle>
              <p className="text-sm leading-6 text-foreground/90">{legacy.summary}</p>

              {legacy.strengths.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {legacy.strengths.map((item, index) => (
                    <Badge key={`${typeof item === "string" ? item : item.title}-${index}`} variant="soft-success">
                      {typeof item === "string" ? item : item.title}
                    </Badge>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-border/70 pt-5 sm:flex-row">
            {!hideGenerateAction ? (
              <Link href={`/es?gakuchikaId=${gakuchikaId}`} className="block flex-1">
                <Button className="h-11 w-full text-sm font-medium">
                  <span className="flex items-center justify-center gap-2">
                    この経験を使ってESを作成する
                    <ArrowRightIcon />
                  </span>
                </Button>
              </Link>
            ) : null}

            {onResumeSession && (
              <Button variant="outline" className="h-11 sm:min-w-[140px]" onClick={onResumeSession}>
                作成を続ける
              </Button>
            )}

            <Link href="/gakuchika" className="block sm:min-w-[120px]">
              <Button variant="ghost" className="h-11 w-full">
                一覧に戻る
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
