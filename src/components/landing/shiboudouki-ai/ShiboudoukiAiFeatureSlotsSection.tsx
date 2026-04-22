"use client";

import { LandingSectionMotion } from "../LandingSectionMotion";
import { LandingCheckList } from "../shared/LandingCheckList";

const checkItems = [
  "業界理由と企業理由を別スロットで管理し、混在を防止",
  "未確認の企業名・職種を前提にした質問は差し戻し・修正",
  "同じ観点の再質問を自動で抑制",
] as const;

const stages = [
  { label: "業界理由", description: "業界固有の関心を整理", status: "completed" as const },
  { label: "企業理由", description: "同業他社でなくなぜこの会社かを確認", status: "completed" as const },
  { label: "自分との接続", description: "経験・原体験との接続", status: "current" as const },
  { label: "やりたい仕事", description: "入社後の仕事を具体化", status: "pending" as const },
  { label: "価値貢献", description: "自分がどう価値を出すか", status: "pending" as const },
  { label: "差別化", description: "他の候補者との違い", status: "pending" as const },
] as const;

const completedCount = stages.filter((s) => s.status === "completed").length;
const progressPercent = Math.round(((completedCount + 0.5) / stages.length) * 100);

export function ShiboudoukiAiFeatureSlotsSection() {
  return (
    <section className="bg-[var(--lp-surface-page)] px-6 py-24 md:py-32">
      <div className="mx-auto max-w-[1200px]">
        <div className="flex flex-col items-start gap-12 lg:flex-row lg:gap-20">
          <LandingSectionMotion className="lg:w-1/2">
            <p
              className="mb-3 text-sm text-slate-400"
              style={{ fontWeight: 600 }}
            >
              Feature 01
            </p>
            <h3
              className="mb-4 text-2xl tracking-tight text-[var(--lp-navy)] md:text-[2rem]"
              style={{ fontWeight: 800, lineHeight: 1.3 }}
            >
              6 要素スロットで、志望動機の材料を段階的に整理
            </h3>
            <p className="mb-8 text-slate-500" style={{ lineHeight: 1.8 }}>
              志望動機を 6 要素に分解し、確認済み・要補強・整理中・未回答の 4 段階で管理。1 回の質問は 1 論点だけ、材料整理フェーズは 6〜7 問で ES 解放まで進みます。
            </p>
            <LandingCheckList items={checkItems} />
          </LandingSectionMotion>

          <LandingSectionMotion className="w-full lg:w-1/2">
            <div
              className="overflow-hidden rounded-2xl border border-slate-200/50 bg-white shadow-[0_8px_40px_rgba(10,15,92,0.06)]"
              aria-hidden
            >
              <div className="p-5 md:p-6">
                {/* Stage tracker list */}
                <div className="relative">
                  {stages.map((stage, i) => {
                    const isCompleted = stage.status === "completed";
                    const isCurrent = stage.status === "current";
                    const isPending = stage.status === "pending";
                    const isLast = i === stages.length - 1;

                    return (
                      <div key={stage.label} className="relative flex items-start gap-3.5 pb-5 last:pb-0">
                        {/* Vertical connector line */}
                        {!isLast && (
                          <div
                            className="absolute left-[9px] top-[22px] w-px"
                            style={{
                              height: "calc(100% - 10px)",
                              backgroundColor: isCompleted
                                ? "#34d399"
                                : isCurrent
                                  ? "#7dd3fc"
                                  : "#e2e8f0",
                            }}
                          />
                        )}

                        {/* Status indicator */}
                        <div className="relative z-10 mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center">
                          {isCompleted && (
                            <svg width="19" height="19" viewBox="0 0 19 19" fill="none" aria-hidden>
                              <circle cx="9.5" cy="9.5" r="9.5" fill="#34d399" />
                              <path
                                d="M5.5 9.5l2.5 2.5 5-5"
                                stroke="#fff"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                          {isCurrent && (
                            <span className="flex h-[19px] w-[19px] items-center justify-center rounded-full border-2 border-[#7dd3fc] bg-[#f0f9ff]">
                              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#38bdf8]" />
                            </span>
                          )}
                          {isPending && (
                            <span className="h-[19px] w-[19px] rounded-full border-2 border-slate-200 bg-white" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex flex-1 items-start justify-between gap-2 pt-px">
                          <div className="min-w-0">
                            <p
                              className="text-sm text-slate-700"
                              style={{
                                fontWeight: isCurrent ? 700 : 600,
                                color: isCurrent ? "var(--lp-navy)" : undefined,
                              }}
                            >
                              {stage.label}
                            </p>
                            <p
                              className="mt-0.5 text-xs text-slate-400"
                              style={{ lineHeight: 1.5 }}
                            >
                              {stage.description}
                            </p>
                          </div>

                          {/* Status badge */}
                          {isCompleted && (
                            <span
                              className="shrink-0 rounded-full bg-[#ecfdf5] px-2.5 py-0.5 text-[11px] text-[#047857]"
                              style={{ fontWeight: 600 }}
                            >
                              完了
                            </span>
                          )}
                          {isCurrent && (
                            <span
                              className="shrink-0 rounded-full bg-[#f0f9ff] px-2.5 py-0.5 text-[11px] text-[#0369a1]"
                              style={{ fontWeight: 600 }}
                            >
                              進行中
                            </span>
                          )}
                          {isPending && (
                            <span
                              className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] text-slate-400"
                              style={{ fontWeight: 600 }}
                            >
                              未着手
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Progress bar */}
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs text-slate-400" style={{ fontWeight: 500 }}>
                      進捗
                    </span>
                    <span className="text-xs text-slate-500" style={{ fontWeight: 600 }}>
                      3 / 6 項目
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[#34d399] transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </LandingSectionMotion>
        </div>
      </div>
    </section>
  );
}
