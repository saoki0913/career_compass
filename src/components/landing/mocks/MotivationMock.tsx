"use client";

/**
 * MotivationMock -- Marketing mock for the motivation conversation UI.
 * Faithfully reproduces the actual product layout using ConversationWorkspaceShell,
 * ConversationActionBar, ChatInput, ChatMessage, and ConversationSidebarCard patterns.
 *
 * Natural width: 960px (rendered inside ScaleFit).
 * Inline styles: only the outermost width.
 * Hex colors: only inside SVG path attributes.
 */

import { MOCK_COMPANIES } from "./mock-data";

const company = MOCK_COMPANIES[2]; // C電機株式会社

const CONVERSATION = [
  {
    role: "ai" as const,
    text: "なぜサービス・インフラ業界に関心を持ったのですか？",
  },
  {
    role: "user" as const,
    text: "人々の生活や経済活動を根底から支える影響力があり、技術や仕組みの力で社会全体に長期的な価値を生み出せる点に魅力を感じたからです。",
  },
  {
    role: "ai" as const,
    text: `${company.name}のようなサービス・インフラ企業で特に惹かれる点は何ですか？`,
  },
  {
    role: "user" as const,
    text: "単なる機能提供ではなく、多くの人の意思決定や行動を支える基盤として継続的に価値を届けられる点に、強く惹かれています。",
  },
  {
    role: "ai" as const,
    text: "総合職として、入社後に特に挑戦したい仕事は何ですか？",
  },
];

const PROGRESS = [
  { t: "業界志望理由", s: "完了" },
  { t: "企業志望理由", s: "完了" },
  { t: "やりたい仕事", s: "進行中" },
  { t: "自分の価値観", s: "未着手" },
  { t: "原体験の接続", s: "未着手" },
  { t: "仕上げ", s: "未着手" },
] as const;

function stageClasses(s: string) {
  if (s === "完了") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (s === "進行中") return "border-sky-300 bg-sky-50 text-slate-900";
  return "border-border/60 bg-muted/20 text-muted-foreground";
}

export function MotivationMock() {
  return (
    <div style={{ width: 960 }} className="bg-card font-sans">
      {/* Shell: bg-background flex flex-col */}
      <div className="flex h-[580px] flex-col overflow-hidden bg-background">
        {/* Main: mx-auto w-full max-w-7xl flex-1 flex-col px-3 py-4 */}
        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col overflow-hidden px-3 py-4">
          {/* Header */}
          <div className="mb-4 flex shrink-0 flex-col gap-3">
            {/* Title row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h1 className="text-xl font-bold">志望動機を作成</h1>
                    <div className="hidden h-1.5 w-1.5 rounded-full bg-muted-foreground/30 lg:block" />
                    <p className="text-sm text-muted-foreground">
                      {company.name} &middot; 総合職
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* ConversationActionBar: rounded-[28px] container */}
            <div className="rounded-[28px] border border-border/70 bg-background/90 px-3 py-2 shadow-sm">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3">
                {/* Helper text left */}
                <p className="text-sm leading-6 text-muted-foreground">
                  候補から選ぶか、自由に入力してください
                </p>

                {/* Character limit buttons */}
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    文字数
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {([300, 400, 500] as const).map((limit) => (
                      <span
                        key={limit}
                        className={
                          limit === 400
                            ? "rounded-xl border border-primary bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                            : "rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-muted-foreground"
                        }
                      >
                        {limit}字
                      </span>
                    ))}
                  </div>
                </div>

                {/* CTA button */}
                <button
                  type="button"
                  className="h-11 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-sm"
                >
                  志望動機ESを作成
                </button>
              </div>
            </div>
          </div>

          {/* Main grid: Chat Card | Sidebar */}
          <div className="grid flex-1 grid-cols-[minmax(0,1.7fr)_minmax(300px,0.75fr)] gap-3.5 overflow-hidden">
            {/* Chat Card */}
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
                    {/* Textarea mock */}
                    <div className="min-h-[48px] flex-1 rounded-xl border border-input bg-background px-4 py-3 text-sm text-muted-foreground">
                      回答を入力...
                    </div>
                    {/* Send button */}
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary">
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="#ffffff"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
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
              {/* Progress Card (ConversationSidebarCard pattern) */}
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
                      className={`flex items-center justify-between rounded-[18px] border px-3.5 py-2.5 text-xs shadow-sm ${stageClasses(p.s)}`}
                    >
                      <span className="font-medium">{p.t}</span>
                      <span className="font-bold">{p.s}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reference Info Card (ConversationSidebarCard pattern) */}
              <div className="rounded-xl border border-border/50 bg-card">
                <div className="flex min-h-12 flex-row items-center justify-between gap-3 px-3.5 py-2.5">
                  <p className="text-sm font-medium text-primary">
                    参考にした情報
                  </p>
                </div>
                <div className="px-3.5 pb-3.5 pt-0">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    「人々の生活や経済活動を支える」「意思決定を支える基盤」という志望理由を踏まえた質問です。
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
