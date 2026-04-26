"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { STAR_EXPLANATIONS } from "@/components/gakuchika";

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

export function GakuchikaStartScreen({
  title,
  content,
  showStarInfo,
  error,
  isStarting,
  onShowStarInfoChange,
  onStartDeepDive,
}: {
  title: string;
  content: string | null;
  showStarInfo: boolean;
  error: string | null;
  isStarting: boolean;
  onShowStarInfoChange: (open: boolean) => void;
  onStartDeepDive: () => void;
}) {
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href="/gakuchika"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeftIcon />
        戻る
      </Link>

      <div className="space-y-6 max-w-3xl">
        <Card>
          <CardContent className="pt-6">
            <h1 className="text-xl font-bold mb-2">{title}</h1>
            {content ? (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {content}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                テーマのみ登録されています。短い会話で ES に使える材料を揃えていきます。
              </p>
            )}
          </CardContent>
        </Card>

        <details
          className="group"
          open={showStarInfo}
          onToggle={(event) => onShowStarInfoChange((event.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 py-2">
            <svg
              className={cn("w-4 h-4 transition-transform", showStarInfo && "rotate-90")}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            先に整理する4つの要素
          </summary>
          <div className="mt-2 space-y-2 pl-1">
            <p className="text-xs text-muted-foreground mb-3">
              最初は状況・課題・行動・結果を押さえ、ES が書ける状態まで短く整えます。
            </p>
            {Object.entries(STAR_EXPLANATIONS).map(([key, info]) => (
              <div
                key={key}
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border/50"
              >
                <span className="shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                  {info.title[0]}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{info.title}</p>
                  <p className="text-xs text-muted-foreground">{info.description}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">{info.example}</p>
                </div>
              </div>
            ))}
          </div>
        </details>

        {error ? (
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : null}

        <Button onClick={onStartDeepDive} disabled={isStarting} className="w-full h-12 text-base font-medium" size="lg">
          {isStarting ? (
            <span className="flex items-center gap-2">
              <LoadingSpinner />
              AIが最初の質問を準備中...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              作成を始める
            </span>
          )}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          最初は短い会話で ES を書ける材料を揃え、その後に必要なら同じ画面で深掘りできます
        </p>
      </div>
    </main>
  );
}
