"use client";

/**
 * InterviewMock — AI模擬面接チャット画面のマーケティング用モック
 * 参照: src/app/(product)/interview/, ConversationWorkspaceShell layout
 * 自然幅: 960px (ScaleFit 内で固定)
 *
 * 実プロダクトの Tailwind クラスを忠実に再現。
 * インラインスタイルは最外殻の width のみ許可。
 */

import { MOCK_COMPANIES } from "./mock-data";

const company = MOCK_COMPANIES[1]; // B自動車株式会社

const CONVERSATION = [
  {
    role: "ai" as const,
    text: "本日はよろしくお願いします。まず自己紹介と、今日アピールしたい強みを一つ教えてください。",
  },
  {
    role: "user" as const,
    text: "チームの課題を構造化して、関係者を巻き込みながら前進させる力が強みです。サークル幹事として…",
  },
  {
    role: "ai" as const,
    text: "「関係者を巻き込む」について、誰とどのような合意をどう取りに行ったか教えてください。",
  },
  {
    role: "user" as const,
    text: "当日の運営メンバー6名と担当分担を合意形成し、先輩幹部にも判断を仰ぎました。",
  },
  {
    role: "ai" as const,
    text: "反対意見があった場合、どのように扱ったか教えてください。",
  },
];

const PROGRESS = [
  { t: "自己紹介・強みの提示", s: "完了" },
  { t: "根拠となる経験", s: "完了" },
  { t: "合意形成の深掘り", s: "進行中" },
  { t: "困難への対処", s: "未着手" },
  { t: "入社後の挑戦", s: "未着手" },
  { t: "逆質問", s: "未着手" },
] as const;

function statusClasses(s: string) {
  if (s === "完了") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (s === "進行中") return "border-sky-300 bg-sky-50 text-slate-900";
  return "border-border/60 bg-muted/20 text-muted-foreground";
}

export function InterviewMock() {
  return (
    <div style={{ width: 960 }} className="bg-card font-sans">
      {/* Shell: bg-background flex flex-col */}
      <div className="flex h-[580px] flex-col overflow-hidden bg-background">
        {/* Main: mx-auto w-full max-w-7xl flex-1 flex-col px-3 py-4 */}
        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col overflow-hidden px-3 py-4">
          {/* Header row */}
          <div className="mb-4 flex shrink-0 flex-col gap-3">
            <div className="flex items-center justify-between">
              {/* Left: title + subtitle */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="text-xl font-bold">模擬面接を実施</h1>
                <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  {company.name} · 2次面接想定
                </p>
              </div>
            </div>

            {/* ConversationActionBar: rounded-[28px] */}
            <div className="rounded-[28px] border border-border/70 bg-background/90 px-3 py-2 shadow-sm">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3">
                <p className="text-sm leading-6 text-muted-foreground">
                  面接の質問に回答してください。終了すると評価が生成されます。
                </p>
                <div className="flex items-center gap-2">
                  {(["300", "500", "700"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={
                        t === "500"
                          ? "rounded-xl border border-primary bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                          : "rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-muted-foreground"
                      }
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="h-11 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-sm"
                >
                  面接終了
                </button>
              </div>
            </div>
          </div>

          {/* Main grid: chat + sidebar */}
          <div className="grid flex-1 grid-cols-[minmax(0,1.7fr)_minmax(300px,0.75fr)] gap-3.5 overflow-hidden">
            {/* Chat card */}
            <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card">
              {/* Messages area */}
              <div className="flex flex-1 flex-col gap-3 overflow-hidden px-3 pt-3 sm:px-4 sm:pt-4">
                {CONVERSATION.map((m, i) => (
                  <div
                    key={i}
                    className={
                      m.role === "user"
                        ? "flex justify-end"
                        : "flex justify-start"
                    }
                  >
                    <div
                      className={
                        m.role === "user"
                          ? "max-w-[80%] rounded-2xl bg-primary px-4 py-3 text-primary-foreground"
                          : "max-w-[80%] rounded-2xl bg-muted px-4 py-3"
                      }
                    >
                      <p className="whitespace-pre-wrap text-sm">{m.text}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* ChatInput (faithful to actual UI) */}
              <div className="shrink-0 border-t border-border bg-background">
                <div className="px-4 py-4">
                  <div className="flex min-h-[60px] flex-col gap-3 sm:flex-row sm:items-start">
                    <div className="min-h-[48px] flex-1 rounded-xl border border-input bg-background px-4 py-3 text-sm text-muted-foreground">
                      回答を入力...
                    </div>
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="white"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                        />
                      </svg>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Shift + Enter で改行、Enter で送信
                  </p>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-3 overflow-hidden">
              {/* Progress card (ConversationSidebarCard pattern) */}
              <div className="rounded-xl border border-border/50 bg-card">
                <div className="flex min-h-12 flex-row items-center justify-between gap-3 px-3.5 py-2.5">
                  <p className="text-sm font-medium text-foreground">進捗</p>
                  <span className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
                    やり直す
                  </span>
                </div>
                <div className="flex flex-col gap-2 px-3.5 pb-3.5 pt-0">
                  {PROGRESS.map((p, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between rounded-[18px] border px-3.5 py-2.5 text-xs shadow-sm ${statusClasses(p.s)}`}
                    >
                      <span className="font-medium">{p.t}</span>
                      <span className="font-bold">{p.s}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reference info card (ConversationSidebarCard pattern) */}
              <div className="rounded-xl border border-border/50 bg-card">
                <div className="flex min-h-12 flex-row items-center justify-between gap-3 px-3.5 py-2.5">
                  <p className="text-sm font-medium text-primary">
                    参考にした情報
                  </p>
                </div>
                <div className="px-3.5 pb-3.5 pt-0">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    職種:
                    総合職。「社会課題に長期視点で取り組む姿勢」や「関係者を巻き込む力を評価する文化」を踏まえた質問です。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
