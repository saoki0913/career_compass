"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles, Target } from "lucide-react";
import { trackEvent } from "@/lib/analytics/client";
const primaryCtaClassName =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--lp-cta)] px-5 text-sm font-semibold text-white shadow-lg shadow-[rgba(10,15,92,0.12)] transition-all hover:bg-[var(--lp-cta)]/90 hover:shadow-xl hover:shadow-[rgba(10,15,92,0.18)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-navy)] focus-visible:ring-offset-2";

const secondaryCtaClassName =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-[var(--lp-navy)] shadow-sm transition-colors duration-200 hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-navy)]/20 focus-visible:ring-offset-2 focus-visible:ring-offset-white";
import { cn } from "@/lib/utils";

function countChars(text: string): number {
  return Array.from(text).length;
}

function stripWhitespace(text: string): string {
  return text.replace(/\s/g, "");
}

function ProgressRow({
  label,
  current,
  target,
}: {
  label: string;
  current: number;
  target: number;
}) {
  const pct = Math.min(100, Math.round((current / target) * 100));
  const over = current > target;

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Target className="size-4 shrink-0 text-[var(--lp-navy)]" aria-hidden />
          <p className="truncate text-sm font-medium text-slate-900">{label}</p>
        </div>
        <p
          className={cn(
            "shrink-0 text-sm tabular-nums",
            over ? "text-destructive" : "text-slate-600",
          )}
        >
          {current.toLocaleString()} / {target.toLocaleString()}
          {over ? `（+${(current - target).toLocaleString()}）` : ""}
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-[var(--lp-navy)]")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function EsCounterClient() {
  const [text, setText] = useState("");
  const [excludeWhitespace, setExcludeWhitespace] = useState(true);

  useEffect(() => {
    trackEvent("tool_es_counter_view");
  }, []);

  const counts = useMemo(() => {
    const raw = countChars(text);
    const noWs = countChars(stripWhitespace(text));
    return { raw, noWs };
  }, [text]);

  const current = excludeWhitespace ? counts.noWs : counts.raw;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-950">文章を貼り付け</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              文字数は「空白・改行を除く」カウントが一般的です。
            </p>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={excludeWhitespace}
              onChange={(e) => setExcludeWhitespace(e.target.checked)}
              className="size-4 accent-[var(--lp-navy)]"
            />
            空白・改行を除く
          </label>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ここにES本文を貼り付けてください"
          className={cn(
            "mt-4 min-h-[260px] w-full rounded-xl border border-slate-200 bg-slate-50/40 px-4 py-3 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400",
            "focus-visible:border-[var(--lp-border-tint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-navy)]/15",
          )}
        />

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">
          <p>
            現在:{" "}
            <span className="font-semibold text-slate-950 tabular-nums">{current.toLocaleString()}</span>
          </p>
          <p>
            （含む）: <span className="tabular-nums">{counts.raw.toLocaleString()}</span>
          </p>
          <p>
            （除く）: <span className="tabular-nums">{counts.noWs.toLocaleString()}</span>
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <ProgressRow label="300字" current={current} target={300} />
        <ProgressRow label="400字" current={current} target={400} />
        <ProgressRow label="500字" current={current} target={500} />

        <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-6">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-[var(--lp-navy)]" aria-hidden />
            <div>
              <p className="font-medium text-slate-950">次にやること</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                企業登録や締切管理もまとめてやるなら、アプリに保存してAI添削まで進めるのが最短です。
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/login"
              className={cn(primaryCtaClassName, "px-4 sm:px-5")}
            >
              アプリで続ける
              <ArrowRight className="size-4 shrink-0" aria-hidden />
            </Link>
            <Link
              href="/templates/shiboudouki"
              className={cn(secondaryCtaClassName, "px-4 sm:px-5")}
            >
              志望動機テンプレを見る
              <ArrowRight className="size-4 shrink-0" aria-hidden />
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            参考:
            <Link
              href="/pricing"
              className="ml-1 font-medium text-[var(--lp-navy)] underline-offset-2 hover:underline"
            >
              プラン・クレジット
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
