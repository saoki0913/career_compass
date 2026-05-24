"use client";

import type { ReactNode } from "react";

import type { Feedback } from "@/lib/interview/ui";

/**
 * 面接フィードバック (まとめシート) の SSE 生成中表示 (GenerationModal の generatingSlot)。
 * streamingFeedback の埋まったフィールドから順に表示する。
 */
export function InterviewFeedbackStreamingView({
  feedback,
  label,
}: {
  feedback: Feedback | null;
  label?: ReactNode;
}) {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <p className="text-sm font-medium text-foreground">
        {label || "まとめシートを作成しています"}
      </p>

      {feedback?.overall_comment ? (
        <section className="rounded-xl border border-border/60 bg-muted/15 px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">総評</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground/90">
            {feedback.overall_comment}
          </p>
        </section>
      ) : null}

      {feedback && feedback.strengths.length > 0 ? (
        <section className="rounded-xl border border-border/60 bg-background px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">強み</h3>
          <ul className="mt-1 space-y-1">
            {feedback.strengths.map((item, index) => (
              <li key={`${item}-${index}`} className="text-sm leading-6 text-foreground/90">
                {item}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {feedback && feedback.improvements.length > 0 ? (
        <section className="rounded-xl border border-border/60 bg-background px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">改善ポイント</h3>
          <ul className="mt-1 space-y-1">
            {feedback.improvements.map((item, index) => (
              <li key={`${item}-${index}`} className="text-sm leading-6 text-foreground/90">
                {item}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {feedback && feedback.next_preparation.length > 0 ? (
        <section className="rounded-xl border border-border/60 bg-background px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">次の準備</h3>
          <ul className="mt-1 space-y-1">
            {feedback.next_preparation.map((item, index) => (
              <li key={`${item}-${index}`} className="text-sm leading-6 text-foreground/90">
                {item}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
