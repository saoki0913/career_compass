"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

interface ReviewEmptyStateProps {
  hasCompanyRag?: boolean;
  companyName?: string;
  companyId?: string;
  className?: string;
}

const SparkleIcon = () => (
  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
    />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
  </svg>
);

export function ReviewEmptyState({
  hasCompanyRag = false,
  companyName,
  companyId,
  className,
}: ReviewEmptyStateProps) {
  const title = hasCompanyRag && companyName
    ? `${companyName}向けに設問ごとで添削できます`
    : "設問を選ぶと、このパネルで添削できます";

  return (
    <div className={cn("flex flex-col items-center px-3 py-8 text-center", className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-primary">
        <SparkleIcon />
      </div>

      <div className="mt-4 space-y-2">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="mx-auto max-w-[300px] text-sm leading-6 text-muted-foreground">
          左の設問バーから対象の設問を選ぶと、企業情報と結びつけて、改善点とリライト案を返します。
        </p>
      </div>

      <div className="mt-5 w-full space-y-2 rounded-2xl border border-border/60 bg-muted/20 p-4 text-left">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckIcon />
          </span>
          <p className="text-sm text-foreground">設問ごとに評価と改善ポイントを整理</p>
        </div>
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckIcon />
          </span>
          <p className="text-sm text-foreground">文字数を意識したリライト案を返却</p>
        </div>
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckIcon />
          </span>
          <p className="text-sm text-foreground">
            {hasCompanyRag ? "企業情報を反映した企業接続の改善も確認可能" : "企業情報があると企業接続まで含めて添削可能"}
          </p>
        </div>
      </div>

      {!hasCompanyRag && companyId && (
        <div className="mt-4 w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-left">
          <p className="text-xs leading-5 text-amber-800">
            企業情報を取得すると、企業接続の評価と出典リンクも一緒に確認できます。
          </p>
          <Link
            href={`/companies/${companyId}`}
            className="mt-2 inline-flex text-xs font-medium text-amber-900 underline underline-offset-2"
          >
            企業情報を確認する
          </Link>
        </div>
      )}
    </div>
  );
}
