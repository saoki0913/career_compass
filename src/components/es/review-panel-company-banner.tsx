"use client";

import Link from "next/link";
import { ArrowUpRight, Building2, CheckCircle2, FileText, Loader2 } from "lucide-react";

export type CompanyReviewStatus =
  | "no_company_selected"
  | "company_selected_not_fetched"
  | "company_status_checking"
  | "company_fetched_but_not_ready"
  | "ready_for_es_review";

export function CompanyStatusBanner({
  status,
  companyName,
  companyId,
  density = "full",
}: {
  status: CompanyReviewStatus;
  companyName?: string;
  companyId?: string;
  density?: "full" | "compact";
}) {
  if (status === "no_company_selected") {
    return density === "compact" ? (
      <div className="rounded-[18px] border border-border/60 bg-background/85 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FileText className="size-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              企業未選択でも、プロフィールやガクチカを使って添削できます。
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              企業連携が必要な設問は非表示にし、使える設問だけを自動判定と一緒に案内します。
            </p>
          </div>
        </div>
      </div>
    ) : (
      <div className="rounded-[22px] border border-border/60 bg-background/90 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FileText className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              企業未選択でも、プロフィールやガクチカを使ってAI添削できます。
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              企業との連携が必要な設問は選べませんが、汎用ES・ガクチカ・自己PR・価値観は同じ画面でそのまま添削できます。
            </p>
          </div>
        </div>
      </div>
    );
  }

  const sharedLink = companyId ? (
    <Link
      href={`/companies/${companyId}`}
      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-foreground underline underline-offset-2"
    >
      企業情報を見る
      <ArrowUpRight className="size-3.5" />
    </Link>
  ) : null;
  const compactLink = companyId ? (
    <Link
      href={`/companies/${companyId}`}
      className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-foreground underline underline-offset-2"
    >
      {status === "company_selected_not_fetched" ? "企業情報を取得する" : "企業情報を見る"}
      <ArrowUpRight className="size-3.5" />
    </Link>
  ) : null;

  if (density === "compact") {
    if (status === "ready_for_es_review") {
      return (
        <div className="rounded-[18px] border border-success/20 bg-success/8 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-success/12 text-success">
                <CheckCircle2 className="size-4" />
              </div>
              <p className="text-sm font-medium text-foreground">
                {companyName ? `${companyName}の企業情報と連携済みです。` : "企業情報連携済みです。"}
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (status === "company_status_checking") {
      return (
        <div className="rounded-[18px] border border-border/60 bg-background/80 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
            <p className="text-sm font-medium text-foreground">企業情報の連携状況を確認中です。</p>
          </div>
        </div>
      );
    }

    if (status === "company_fetched_but_not_ready") {
      return (
        <div className="rounded-[18px] border border-info/20 bg-info/8 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-info/14 text-info">
                <Building2 className="size-4" />
              </div>
              <p className="text-sm font-medium text-foreground">
                企業情報は取得済みですが、ES添削に使える情報がまだ不足しています。
              </p>
            </div>
            {compactLink}
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-[18px] border border-warning/20 bg-warning/10 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-warning/20 text-warning-foreground">
              <Building2 className="size-4" />
            </div>
            <p className="text-sm font-medium text-foreground">
              企業情報を取得すると、企業に合わせた添削ができます。
            </p>
          </div>
          {compactLink}
        </div>
      </div>
    );
  }

  if (status === "ready_for_es_review") {
    return (
      <div className="rounded-[22px] border border-success/20 bg-success/8 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-success/12 text-success">
            <CheckCircle2 className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {companyName ? `${companyName}の企業情報と連携してAI添削できます。` : "企業情報連携済みです。"}
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              改善案と出典リンクを順に返します。
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "company_status_checking") {
    return (
      <div className="rounded-[22px] border border-border/60 bg-background/80 p-4">
        <p className="text-sm font-semibold text-foreground">企業情報の連携状況を確認中です。</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          判定が完了すると、出典表示の有無もこのパネルへ自動反映します。
        </p>
      </div>
    );
  }

  if (status === "company_fetched_but_not_ready") {
    return (
      <div className="rounded-[22px] border border-info/20 bg-info/8 p-4">
        <p className="text-sm font-semibold text-foreground">
          企業情報は取得済みですが、ES添削に使える情報がまだ不足しています。
        </p>
        {sharedLink}
      </div>
    );
  }

  return (
    <div className="rounded-[22px] border border-warning/20 bg-warning/10 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-warning/20 text-warning-foreground">
          <Building2 className="size-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            企業情報を取得すると、企業に合わせた添削ができます。
          </p>
          {companyId ? (
            <Link
              href={`/companies/${companyId}`}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-foreground underline underline-offset-2"
            >
              企業情報を取得する
              <ArrowUpRight className="size-3.5" />
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
