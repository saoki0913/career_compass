"use client";

import { LandingSectionMotion } from "../LandingSectionMotion";
import { LandingCheckList } from "../shared/LandingCheckList";

const checkItems = [
  "材料整理: 6 要素を 1 回ずつ回収し、6〜7 問で ES 作成可へ",
  "深掘り補強: ES 解放後、未整理明示や矛盾があるスロットに絞って最大 10 問",
  "会話なし: プロフィール・ガクチカ・企業 RAG から直接生成（ログイン必須、材料が薄いと停止）",
] as const;

const conversationSteps = [
  { label: "材料整理" },
  { label: "ES 作成可" },
  { label: "下書き生成" },
  { label: "深掘り補強" },
] as const;

const fallbackSteps = [
  { label: "プロフィール + ガクチカ + 企業 RAG" },
  { label: "直接生成" },
] as const;

export function ShiboudoukiAiFeatureModeSection() {
  return (
    <section className="bg-white px-6 py-24 md:py-32">
      <div className="mx-auto max-w-[1200px]">
        <div className="flex flex-col items-start gap-12 lg:flex-row lg:gap-20">
          <LandingSectionMotion className="lg:w-1/2">
            <p
              className="mb-3 text-sm text-slate-400"
              style={{ fontWeight: 600 }}
            >
              Feature 02
            </p>
            <h3
              className="mb-4 text-2xl tracking-tight text-[var(--lp-navy)] md:text-[2rem]"
              style={{ fontWeight: 800, lineHeight: 1.3 }}
            >
              会話あり（材料整理 → 深掘り補強）と、会話なしの 2 ルート
            </h3>
            <p className="mb-8 text-slate-500" style={{ lineHeight: 1.8 }}>
              素材があるなら会話なしで即座に下書き。まだ整理できていないなら会話で材料を揃える。深掘り補強では ES 解放後にさらに最大 10 問まで弱点補強ができます。
            </p>
            <LandingCheckList items={checkItems} />
          </LandingSectionMotion>

          <LandingSectionMotion className="w-full lg:w-1/2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Card A: conversation route */}
              <div className="rounded-xl border-2 border-[var(--lp-navy)]/20 bg-[var(--lp-surface-muted)] p-5">
                <div className="mb-5 flex items-center gap-2">
                  <span
                    className="text-sm text-[var(--lp-navy)]"
                    style={{ fontWeight: 700 }}
                  >
                    会話あり
                  </span>
                  <span
                    className="rounded-full bg-[var(--lp-tint-navy-soft)] px-2 py-0.5 text-[10px] text-[var(--lp-navy)]"
                    style={{ fontWeight: 600 }}
                  >
                    推奨
                  </span>
                </div>
                <div className="space-y-0">
                  {conversationSteps.map((step, i) => (
                    <div key={step.label} className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--lp-navy)]">
                          <span className="h-1.5 w-1.5 rounded-full bg-white" />
                        </span>
                        {i < conversationSteps.length - 1 && (
                          <span className="h-6 w-px bg-[var(--lp-navy)]/20" />
                        )}
                      </div>
                      <span
                        className="pb-3 text-xs text-[var(--lp-navy)]"
                        style={{ fontWeight: 600, lineHeight: 1.6 }}
                      >
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Card B: fallback route */}
              <div className="rounded-xl border border-slate-100 bg-white p-5">
                <div className="mb-5">
                  <span
                    className="text-sm text-[var(--lp-navy)]"
                    style={{ fontWeight: 700 }}
                  >
                    会話なし（fallback）
                  </span>
                </div>
                <div className="space-y-0">
                  {fallbackSteps.map((step, i) => (
                    <div key={step.label} className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                        </span>
                        {i < fallbackSteps.length - 1 && (
                          <span className="h-6 w-px bg-slate-200" />
                        )}
                      </div>
                      <span
                        className="pb-3 text-xs text-slate-500"
                        style={{ fontWeight: 600, lineHeight: 1.6 }}
                      >
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>
                <p
                  className="mt-3 text-xs italic text-slate-400"
                  style={{ lineHeight: 1.6 }}
                >
                  材料が薄い場合は自動で会話モードへ案内
                </p>
              </div>
            </div>
          </LandingSectionMotion>
        </div>
      </div>
    </section>
  );
}
