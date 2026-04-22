"use client";

/**
 * ESReviewMock -- ES review screen marketing mock
 * Faithfully reproduces the completed review-result state of the actual product.
 * References: StreamingReviewResponse.tsx, ReviewPanel.tsx, ESEditorPageClient.tsx
 * Natural width: 1040px
 *
 * Tailwind design-system tokens only -- no hex colors, no inline styles
 * except the outermost width.
 */

import { MOCK_COMPANIES } from "./mock-data";

const company = MOCK_COMPANIES[1]; // B自動車株式会社

/* ------------------------------------------------------------------ */
/*  Inline SVG icons (no lucide-react in marketing mocks)             */
/* ------------------------------------------------------------------ */

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  );
}

function WandIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 4V2" />
      <path d="M15 16v-2" />
      <path d="M8 9h2" />
      <path d="M20 9h2" />
      <path d="M17.8 11.8L19 13" />
      <path d="M15 9h.01" />
      <path d="M17.8 6.2L19 5" />
      <path d="m3 21 9-9" />
      <path d="M12.2 6.2L11 5" />
    </svg>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function SparklesFilled({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function ESReviewMock() {
  return (
    <div style={{ width: 1040 }} className="bg-card font-sans">
      {/* ---- Header Bar ---- */}
      <div className="bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Left: breadcrumb + title */}
          <div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span>ES</span>
              <span className="text-muted-foreground/40">{"\u203A"}</span>
              <span>{company.name}</span>
            </div>
            <div className="text-lg font-bold text-foreground tracking-tight">
              学生時代に頑張ったこと
            </div>
          </div>
          {/* Right: char count + buttons */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">378/400字</span>
            <span className="text-xs px-3 py-1.5 border border-border rounded-md text-muted-foreground bg-background font-medium">
              保存
            </span>
            <span className="text-xs px-3.5 py-1.5 rounded-md bg-primary text-primary-foreground font-bold flex items-center gap-1.5 shadow-md shadow-primary/30">
              <SparklesFilled className="text-primary-foreground" />
              AI添削
            </span>
          </div>
        </div>
      </div>

      {/* ---- Two-column Split Layout ---- */}
      <div className="flex h-[520px]">
        {/* ---- Left: Editor Panel ---- */}
        <div className="w-[55%] bg-background overflow-hidden">
          <div className="p-5">
            {/* Section badges row */}
            <div className="flex items-center gap-2 mb-3.5">
              <span className="text-xs px-2.5 py-1 rounded-full bg-muted border border-border text-muted-foreground font-semibold">
                エントリーシート
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 border border-border text-primary font-bold flex items-center gap-1">
                <SparklesFilled className="text-primary" />
                この段落をAI添削
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                最終更新 2分前
              </span>
            </div>

            {/* Body text with highlights */}
            <div className="text-sm leading-[1.9] text-foreground">
              学生時代に力を入れたのは、テニスサークルの
              <span className="bg-amber-100/80 px-0.5">幹部活動</span>
              である。入会希望者にサークルの魅力が伝わりにくく、参加意欲を高めにくいことが課題だった。そこで私は体験会の内容と雰囲気に注力し、
              <span className="bg-red-100 px-0.5 underline decoration-wavy decoration-red-500">
                練習前の体験会の実施時間を延長した
              </span>
              。加えて、当日の案内役とメンバーの声かけ役を分担する運営体制をつくり、初回から安心して参加してもらう流れを整えた。その結果、参加者からは「雰囲気が伝わり、安心して参加できた」と言われ、参加満足度も上がった。この経験を通じて、状況に応じて伝え方を工夫し、周囲が参加しやすい環境をつくる力を磨いた。
            </div>

            {/* Annotation tags */}
            <div className="mt-4 flex gap-2 flex-wrap">
              <span className="text-xs px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                {"\u25CF"} 強み部分を強調
              </span>
              <span className="text-xs px-2.5 py-1 rounded-md bg-red-50 text-red-700 border border-red-200">
                {"\u25CF"} 具体数値が不足
              </span>
            </div>
          </div>
        </div>

        {/* ---- Right: Review Panel (completed state) ---- */}
        <div className="w-[45%] border-l border-border bg-muted/20 overflow-hidden">
          <div className="p-5 overflow-y-auto h-full">
            {/* Outer review section -- rounded-[30px] from StreamingReviewResponse */}
            <section className="rounded-[30px] border border-border/70 bg-background p-4 shadow-sm">
              <div className="space-y-4">
                {/* Quality score header */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <SparklesFilled className="text-primary" />
                      </div>
                      <div>
                        <p className="text-base font-semibold text-foreground">
                          改善案
                        </p>
                        <p className="text-xs text-muted-foreground">
                          改善した回答と出典リンクを表示しています。
                        </p>
                      </div>
                    </div>
                    {/* Quality badge */}
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-emerald-100 text-emerald-800">
                        <span>論理性</span>
                        <span className="font-bold">A</span>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-emerald-100 text-emerald-800">
                        <span>具体性</span>
                        <span className="font-bold">A</span>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-sky-100 text-sky-800">
                        <span>企業適合</span>
                        <span className="font-bold">B</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Improvement point card -- rounded-[26px] */}
                <div className="rounded-[26px] border border-border/70 bg-muted/20 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <WandIcon className="text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        改善案
                      </p>
                      <p className="text-xs text-muted-foreground">
                        反映前に内容を確認できます。
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 rounded-[22px] border border-border/60 bg-muted/30 px-4 py-3">
                    <p className="text-xs font-bold text-primary mb-1.5">
                      改善ポイント
                    </p>
                    <p className="text-sm text-foreground leading-relaxed">
                      体験会参加者数や満足度の
                      <span className="text-primary font-bold">
                        具体的な数値
                      </span>
                      を加えると、取り組みのインパクトが伝わりやすくなります。
                    </p>
                  </div>

                  {/* Rewrite suggestion box -- rounded-[22px] */}
                  <div className="mt-3 rounded-[22px] border border-border/70 bg-background px-4 py-4">
                    <div className="flex items-center gap-2 mb-2">
                      <SparkleIcon className="text-primary" />
                      <span className="text-sm font-bold text-foreground">
                        書き換え案
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">
                      学生時代に力を入れたのは、テニスサークルの新歓活動である。例年15名の入会者を30名に倍増させた取り組みで、体験会当日の内容と雰囲気に注力し、初心者の不安を減らす設計を整えた。案内役と声かけ役を分担する運営体制を敷き、初回から安心して参加してもらう流れを構築。その結果、参加満足度アンケートで92%が「雰囲気が伝わり、安心して参加できた」と回答した。
                    </p>
                  </div>
                </div>

                {/* Sources section -- rounded-[26px] */}
                <div className="rounded-[26px] border border-border/60 bg-background/88 p-4">
                  <h4 className="text-xs font-bold text-foreground">
                    出典リンク
                  </h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    就活Passに保存したユーザー情報の参照元です。
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      {
                        t: "プロフィール",
                        s: "就活Pass に登録",
                      },
                      {
                        t: "ガクチカ",
                        s: "サークル活動 1件",
                      },
                    ].map((r, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-border/50 bg-card p-2.5"
                      >
                        <div className="text-xs font-bold text-foreground">
                          {r.t}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {r.s}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action footer -- rounded-[24px] */}
                <div className="rounded-[24px] border border-border/70 bg-muted/20 p-4">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-foreground">
                      反映準備
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      添削が完了しました。内容を確認してから反映できます。
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="flex-1 h-11 rounded-full border border-border bg-background text-xs text-muted-foreground font-semibold text-center flex items-center justify-center gap-1.5 cursor-default"
                    >
                      <ClipboardIcon className="text-muted-foreground" />
                      コピー
                    </button>
                    <button
                      type="button"
                      className="flex-[2] h-11 rounded-full bg-primary text-primary-foreground text-xs font-bold text-center flex items-center justify-center gap-1.5 cursor-default"
                    >
                      <CheckIcon className="text-primary-foreground" />
                      この改善案を反映する
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
