"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics/client";
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
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <p className={cn("text-sm tabular-nums", over ? "text-destructive" : "text-muted-foreground")}>
          {current.toLocaleString()} / {target.toLocaleString()}
          {over ? `（+${(current - target).toLocaleString()}）` : ""}
        </p>
      </div>
      <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-primary")}
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">文章を貼り付け</h2>
            <p className="text-sm text-muted-foreground mt-1">
              文字数は「空白・改行を除く」カウントが一般的です。
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={excludeWhitespace}
              onChange={(e) => setExcludeWhitespace(e.target.checked)}
              className="accent-primary"
            />
            空白・改行を除く
          </label>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ここにES本文を貼り付けてください"
          className={cn(
            "mt-4 w-full min-h-[260px] rounded-xl border border-input bg-background px-4 py-3 text-sm leading-relaxed",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          )}
        />

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <p className="text-muted-foreground">
            現在: <span className="font-semibold text-foreground tabular-nums">{current.toLocaleString()}</span>
          </p>
          <p className="text-muted-foreground">
            （含む）: <span className="tabular-nums">{counts.raw.toLocaleString()}</span>
          </p>
          <p className="text-muted-foreground">
            （除く）: <span className="tabular-nums">{counts.noWs.toLocaleString()}</span>
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <ProgressRow label="300字" current={current} target={300} />
        <ProgressRow label="400字" current={current} target={400} />
        <ProgressRow label="500字" current={current} target={500} />

        <div className="rounded-2xl border bg-muted/20 p-6">
          <p className="font-medium">次にやること</p>
          <p className="mt-1 text-sm text-muted-foreground">
            企業登録や締切管理もまとめてやるなら、アプリに保存してAI添削まで進めるのが最短です。
          </p>
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm font-medium hover:bg-primary/90"
            >
              アプリで続ける
            </Link>
            <Link
              href="/templates/shiboudouki"
              className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted/30"
            >
              志望動機テンプレを見る
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            参考:
            <Link href="/pricing" className="underline hover:text-foreground ml-1">
              プラン・クレジット
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

