"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  isStructuredSummary,
  legacySummaryHasVisibleContent,
  structuredSummaryHasVisibleContent,
  type GakuchikaSummary,
} from "@/lib/gakuchika/summary";

interface CompletionSummaryProps {
  summary: GakuchikaSummary | null;
  isLoading: boolean;
  gakuchikaId: string;
  onResumeSession?: () => void;
  /** Label for the outline button when resuming deep dive after interview-ready (default: 更に深掘りする). */
  resumeFromInterviewLabel?: string;
  /** Refetch summary from API (e.g. when structured JSON was empty or parse failed). */
  onRetrySummary?: () => void | Promise<void>;
  hideGenerateAction?: boolean;
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
  summary,
  isLoading,
  gakuchikaId,
  onResumeSession,
  resumeFromInterviewLabel = "更に深掘りする",
  onRetrySummary,
  hideGenerateAction = false,
}: CompletionSummaryProps) {
  const structured = summary && isStructuredSummary(summary) ? summary : null;
  const legacy = summary && !isStructuredSummary(summary) ? summary : null;
  const structuredVisible = Boolean(structured && structuredSummaryHasVisibleContent(structured));
  const legacyVisible = Boolean(legacy && legacySummaryHasVisibleContent(legacy));
  const hasVisibleBody = isLoading || structuredVisible || legacyVisible;
  const leadText = isLoading
    ? "ここまでで面接で話せる材料はかなり揃いました。要点を整理しています。"
    : "ここまでで面接で話せる材料はかなり揃いました。まずはそのまま話せる核と2分骨子を前に出して整理します。";
  const starSections: Array<{
    key: "situation_text" | "task_text" | "action_text" | "result_text";
    shortLabel: "S" | "T" | "A" | "R";
    label: string;
  }> = [
    { key: "situation_text", shortLabel: "S", label: "状況" },
    { key: "task_text", shortLabel: "T", label: "課題" },
    { key: "action_text", shortLabel: "A", label: "行動" },
    { key: "result_text", shortLabel: "R", label: "結果" },
  ];

  return (
    <div className="space-y-4">
      <div className="w-full rounded-xl border border-success/20 bg-success/5 px-4 py-3 text-sm leading-6 text-foreground/90">
        {leadText}
      </div>

      <Card className="overflow-hidden border-border/60 bg-background shadow-sm">
        <CardContent className="space-y-6 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-success/20 bg-success/10 px-3 py-1 text-xs font-medium text-success">
                <CheckCircleIcon />
                作成完了
              </div>
              <div className="space-y-1">
                <h2
                  className={
                    hasVisibleBody
                      ? "text-xl font-semibold text-foreground"
                      : "text-lg font-semibold text-muted-foreground"
                  }
                >
                  {hasVisibleBody ? "面接用の補足まで整理できました" : "面接準備の要点"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {hasVisibleBody
                    ? "ES の本文に加えて、面接でそのまま話す核と次に備える論点まで見やすく整理しています。"
                    : "要点の表示に必要な情報がまだ取り込めていない可能性があります。再取得するか、会話を続けてから再度お試しください。"}
                </p>
              </div>
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
          ) : structuredVisible && structured ? (
            <>
              {(structured.one_line_core_answer ||
                structured.two_minute_version_outline?.length ||
                structured.likely_followup_questions?.length ||
                structured.weak_points_to_prepare?.length) && (
                <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <section className="min-w-0 space-y-4 rounded-xl border border-border bg-background p-4 sm:p-5">
                    <div className="space-y-2">
                      <SectionTitle>まず話す核</SectionTitle>
                      {structured.one_line_core_answer ? (
                        <p className="break-words rounded-xl border border-primary/15 bg-primary/5 px-4 py-4 text-sm font-medium leading-7 text-foreground">
                          {structured.one_line_core_answer}
                        </p>
                      ) : null}
                    </div>

                    {structured.two_minute_version_outline && structured.two_minute_version_outline.length > 0 ? (
                      <div className="space-y-3">
                        <SectionTitle>2分で話す骨子</SectionTitle>
                        <ol className="space-y-2">
                          {structured.two_minute_version_outline.map((item, index) => (
                            <li
                              key={`${item}-${index}`}
                              className="flex min-w-0 gap-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-3 text-sm leading-6 text-foreground/90"
                            >
                              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
                                {index + 1}
                              </span>
                              <span className="min-w-0 break-words">{item}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                  </section>

                  <div className="grid gap-4">
                    {structured.likely_followup_questions && structured.likely_followup_questions.length > 0 ? (
                      <section className="space-y-3 rounded-2xl border border-border bg-background p-4">
                        <SectionTitle>次に聞かれやすい質問</SectionTitle>
                        <ul className="space-y-2">
                          {structured.likely_followup_questions.map((item, index) => (
                            <li key={`${item}-${index}`} className="text-sm leading-6 text-foreground/90">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}

                    {structured.weak_points_to_prepare && structured.weak_points_to_prepare.length > 0 ? (
                      <section className="space-y-3 rounded-2xl border border-border bg-background p-4">
                        <SectionTitle>詰まりやすいポイント</SectionTitle>
                        <ul className="space-y-2">
                          {structured.weak_points_to_prepare.map((item, index) => (
                            <li key={`${item}-${index}`} className="text-sm leading-6 text-foreground/90">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {starSections.map((element) => {
                  const text = structured[element.key];
                  if (!text) return null;

                  return (
                      <section key={element.key} className="min-w-0 rounded-xl border border-border bg-muted/20 p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
                          {element.shortLabel}
                        </span>
                        <SectionTitle>{element.label}</SectionTitle>
                      </div>
                      <p className="break-words text-sm leading-6 text-foreground/90">{text}</p>
                    </section>
                  );
                })}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {structured.strengths.length > 0 && (
                  <section className="min-w-0 space-y-3 rounded-xl border border-border bg-background p-4">
                    <SectionTitle>強み</SectionTitle>
                    <div className="space-y-2">
                      {structured.strengths.map((item, index) => (
                        <div
                          key={`${item.title}-${index}`}
                          className="rounded-xl border border-success/15 bg-success/5 p-3"
                        >
                          <p className="break-words text-sm font-medium text-foreground">{item.title}</p>
                          {item.description && (
                            <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{item.description}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {structured.learnings.length > 0 && (
                  <section className="min-w-0 space-y-3 rounded-xl border border-border bg-background p-4">
                    <SectionTitle>学び</SectionTitle>
                    <div className="space-y-2">
                      {structured.learnings.map((item, index) => (
                        <div
                          key={`${item.title}-${index}`}
                          className="rounded-xl border border-info/15 bg-info/5 p-3"
                        >
                          <p className="break-words text-sm font-medium text-foreground">{item.title}</p>
                          {item.description && (
                            <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{item.description}</p>
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

              {(structured.interview_supporting_details?.length ||
                structured.future_outlook_notes?.length ||
                structured.backstory_notes?.length) && (
                <div className="grid gap-4 lg:grid-cols-3">
                  {structured.interview_supporting_details && structured.interview_supporting_details.length > 0 && (
                    <section className="space-y-3 rounded-2xl border border-border bg-background p-4">
                      <SectionTitle>面接で補足しやすい事実</SectionTitle>
                      <ul className="space-y-2">
                        {structured.interview_supporting_details.map((item, index) => (
                          <li key={`${item}-${index}`} className="text-sm leading-6 text-foreground/90">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {structured.future_outlook_notes && structured.future_outlook_notes.length > 0 && (
                    <section className="space-y-3 rounded-2xl border border-border bg-background p-4">
                      <SectionTitle>将来展望の補足</SectionTitle>
                      <ul className="space-y-2">
                        {structured.future_outlook_notes.map((item, index) => (
                          <li key={`${item}-${index}`} className="text-sm leading-6 text-foreground/90">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {structured.backstory_notes && structured.backstory_notes.length > 0 && (
                    <section className="space-y-3 rounded-2xl border border-border bg-background p-4">
                      <SectionTitle>背景・原体験の補足</SectionTitle>
                      <ul className="space-y-2">
                        {structured.backstory_notes.map((item, index) => (
                          <li key={`${item}-${index}`} className="text-sm leading-6 text-foreground/90">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              )}
            </>
          ) : legacyVisible && legacy ? (
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
          ) : !isLoading ? (
            <div className="rounded-2xl border border-dashed border-border/80 bg-muted/15 px-4 py-6 text-center text-sm text-muted-foreground">
              <p>要点の本文を表示できませんでした。保存済みの要約が空か、まだ反映されていない可能性があります。</p>
              {onRetrySummary ? (
                <Button variant="outline" className="mt-4 h-10" type="button" onClick={() => void onRetrySummary()}>
                  要約を再取得
                </Button>
              ) : null}
            </div>
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
                {resumeFromInterviewLabel}
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
