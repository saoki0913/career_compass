"use client";

import { ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { InterviewSheetData } from "@/lib/interview/sheet-builder";

function ScoreBar({ score, maxScore = 5 }: { score: number; maxScore?: number }) {
  const pct = Math.min(100, Math.max(0, (score / maxScore) * 100));
  const color =
    score >= 4 ? "bg-emerald-500" : score >= 3 ? "bg-sky-500" : "bg-amber-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-xs font-semibold tabular-nums">
        {score}/{maxScore}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function MarkdownFallback({ content }: { content: string }) {
  return (
    <div className="whitespace-pre-wrap rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm leading-6 text-foreground/90">
      {content}
    </div>
  );
}

export function SheetViewer({
  data,
  markdownFallback,
}: {
  data: InterviewSheetData | null;
  markdownFallback?: string | null;
}) {
  if (!data) {
    if (markdownFallback) return <MarkdownFallback content={markdownFallback} />;
    return (
      <p className="text-sm text-muted-foreground">
        シートデータがありません。
      </p>
    );
  }

  return (
    <div id="interview-sheet" className="space-y-5 print:space-y-3">
      {/* 1. Header */}
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-base font-semibold">{data.companyName}</h2>
        {data.selectedRole ? (
          <Badge variant="soft-primary" className="text-[11px]">
            {data.selectedRole}
          </Badge>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground">
          {data.generatedAt}
        </span>
      </div>

      {/* 2. Setup */}
      <Card className="border-border/50 print:border">
        <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 py-3 text-xs text-muted-foreground sm:grid-cols-3">
          <p>面接方式: {data.setup.interviewFormat}</p>
          <p>選考種別: {data.setup.selectionType}</p>
          <p>面接段階: {data.setup.interviewStage}</p>
          <p>面接官: {data.setup.interviewerType}</p>
          <p>厳しさ: {data.setup.strictnessMode}</p>
        </CardContent>
      </Card>

      {/* 3. Score table */}
      <Card className="border-border/50 print:border">
        <CardHeader className="py-3">
          <CardTitle className="text-sm">採点結果</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {data.scores.map((entry) => (
            <div key={entry.axisKey}>
              <div className="mb-1 flex items-center gap-2">
                <span className="text-xs font-medium">{entry.axis}</span>
                {entry.confidence ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    {entry.confidence}
                  </span>
                ) : null}
              </div>
              <ScoreBar score={entry.score} />
              {entry.rationale ? (
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {entry.rationale}
                </p>
              ) : null}
              {entry.evidence.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {entry.evidence.map((ev) => (
                    <span
                      key={ev}
                      className="inline-flex rounded-lg bg-muted px-2 py-0.5 text-[11px] leading-4 text-foreground/80"
                    >
                      {ev}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {typeof data.premiseConsistency === "number" ? (
            <p className="pt-1 text-xs text-muted-foreground">
              前提一致度: {data.premiseConsistency} / 100
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* 4. Overall comment */}
      <Section title="総合コメント">
        <p className="text-sm leading-6 text-foreground/90">
          {data.overallComment}
        </p>
      </Section>

      {/* 5. Strengths / Improvements / Consistency risks */}
      <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2">
        <Section title="良かった点">
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {data.strengths.map((s) => (
              <li key={s}>• {s}</li>
            ))}
          </ul>
        </Section>
        <Section title="改善点">
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {data.improvements.map((s) => (
              <li key={s}>• {s}</li>
            ))}
          </ul>
        </Section>
      </div>
      {data.consistencyRisks.length > 0 ? (
        <Section title="一貫性リスク">
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {data.consistencyRisks.map((s) => (
              <li key={s}>• {s}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* 6. Q&A (collapsible) */}
      {data.qaPairs.length > 0 ? (
        <Collapsible>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-border/60 px-4 py-2 text-sm font-medium hover:bg-muted/30">
            質疑応答 ({data.qaPairs.length}問)
            <ChevronDown className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-3">
            {data.qaPairs.map((qa) => (
              <div
                key={qa.questionNumber}
                className="rounded-xl border border-border/60 bg-background px-4 py-3"
              >
                <p className="text-xs font-medium text-muted-foreground">
                  Q{qa.questionNumber}
                </p>
                <p className="mt-1 text-sm leading-6">{qa.question}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {qa.answer}
                </p>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      {/* 7. Improved answer (side-by-side with weakest) */}
      {data.weakestQuestion ? (
        <div className="grid gap-3 md:grid-cols-2 print:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">最弱設問</p>
            <p className="mt-1 text-sm leading-6">{data.weakestQuestion.question}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {data.weakestQuestion.answer}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              設問タイプ: {data.weakestQuestion.questionType}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">言い換え例</p>
            <p className="mt-1 text-sm leading-6">{data.improvedAnswer}</p>
          </div>
        </div>
      ) : data.improvedAnswer ? (
        <Section title="言い換え例">
          <p className="rounded-xl bg-muted px-4 py-3 text-sm leading-6">
            {data.improvedAnswer}
          </p>
        </Section>
      ) : null}

      {/* 8. Next preparation */}
      {data.nextPreparation.length > 0 ? (
        <Section title="次に準備すべき論点">
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {data.nextPreparation.map((s) => (
              <li key={s}>• {s}</li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
