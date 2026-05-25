"use client";

import type { ReactNode } from "react";

import {
  motivationFeedbackHasVisibleContent,
  type MotivationFeedbackPoint,
  type MotivationFeedbackSummary as MotivationFeedbackSummaryData,
} from "@/lib/motivation/feedback-summary";

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold text-foreground">{children}</h3>;
}

function PointList({
  items,
  tone,
}: {
  items: MotivationFeedbackPoint[];
  tone: "success" | "warning";
}) {
  const cardClass =
    tone === "success"
      ? "rounded-xl border border-success/15 bg-success/5 p-3"
      : "rounded-xl border border-warning/15 bg-warning/5 p-3";
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={`${item.title}-${index}`} className={cardClass}>
          <p className="break-words text-sm font-medium text-foreground">{item.title}</p>
          {item.description ? (
            <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
              {item.description}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function BulletSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-background p-4">
      <SectionTitle>{title}</SectionTitle>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={`${item}-${index}`} className="break-words text-sm leading-6 text-foreground/90">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MotivationFeedbackSummary({
  summary,
}: {
  summary: MotivationFeedbackSummaryData;
}) {
  if (!motivationFeedbackHasVisibleContent(summary)) {
    return (
      <div className="rounded-2xl border border-dashed border-border/80 bg-muted/15 px-4 py-6 text-center text-sm text-muted-foreground">
        フィードバックの内容を取得できませんでした。もう一度お試しください。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {summary.one_line_core_answer ? (
        <section className="space-y-2 rounded-xl border border-border bg-background p-4 sm:p-5">
          <SectionTitle>面接でまず話す核</SectionTitle>
          <p className="break-words rounded-xl border border-primary/15 bg-primary/5 px-4 py-4 text-sm font-medium leading-7 text-foreground">
            {summary.one_line_core_answer}
          </p>
        </section>
      ) : null}

      {(summary.strengths.length > 0 || summary.improvements.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {summary.strengths.length > 0 && (
            <section className="min-w-0 space-y-3 rounded-xl border border-border bg-background p-4">
              <SectionTitle>強み</SectionTitle>
              <PointList items={summary.strengths} tone="success" />
            </section>
          )}
          {summary.improvements.length > 0 && (
            <section className="min-w-0 space-y-3 rounded-xl border border-border bg-background p-4">
              <SectionTitle>改善ポイント</SectionTitle>
              <PointList items={summary.improvements} tone="warning" />
            </section>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <BulletSection title="次に向けて準備すること" items={summary.next_preparation} />
        <BulletSection title="想定される深掘り質問" items={summary.likely_followup_questions} />
      </div>
    </div>
  );
}
