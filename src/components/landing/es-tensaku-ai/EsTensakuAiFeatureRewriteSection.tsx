"use client";

import { LandingSectionMotion } from "../LandingSectionMotion";
import { LandingCheckList } from "../shared/LandingCheckList";

const checkItems = [
  "AI が使いがちな定番フレーズを自動検出",
  "検出されたフレーズごとに、あなたの言葉への書き直し案を提示",
  "指定文字数に合わせた構成・改善ポイントも提案",
] as const;

export function EsTensakuAiFeatureRewriteSection() {
  return (
    <section className="bg-[var(--lp-surface-page)] px-6 py-24 md:py-32">
      <div className="mx-auto max-w-[1200px]">
        <div className="flex flex-col items-start gap-12 lg:flex-row lg:gap-20">
          <LandingSectionMotion className="lg:w-1/2">
            <p
              className="mb-3 text-sm text-slate-400"
              style={{ fontWeight: 600 }}
            >
              Feature 03
            </p>
            <h3
              className="mb-4 text-2xl tracking-tight text-[var(--lp-navy)] md:text-[2rem]"
              style={{ fontWeight: 800, lineHeight: 1.3 }}
            >
              AIっぽい定番フレーズを検出し、あなたの言葉に書き直す
            </h3>
            <p className="mb-8 text-slate-500" style={{ lineHeight: 1.8 }}>
              「幅広い視野」「新たな価値」「成長できる環境」など、AI が生成しがちな定型的な表現を自動検出。あなたの原体験に基づいた具体的な書き直し案を提示します。
            </p>
            <LandingCheckList items={checkItems} />
          </LandingSectionMotion>

          <LandingSectionMotion className="w-full lg:w-1/2">
            <div
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
              aria-hidden
            >
              {/* Detected expression */}
              <div className="mb-5">
                <p
                  className="mb-3 text-[11px] text-slate-400"
                  style={{ fontWeight: 600 }}
                >
                  検出された表現
                </p>
                <div className="rounded-xl border border-[#fde68a] bg-[rgba(255,251,235,0.5)] p-4">
                  <p
                    className="text-sm text-[#78350f]"
                    style={{ lineHeight: 1.7 }}
                  >
                    「成長できる環境だと感じていて、幅広く貢献したいと思っています。」
                  </p>
                  <div className="mt-3">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[11px] bg-[#fef3c7] text-[#b45309]"
                      style={{ fontWeight: 600 }}
                    >
                      定番フレーズ検出
                    </span>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="mb-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-100" />
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <div className="h-px flex-1 bg-slate-100" />
              </div>

              {/* Rewrite suggestion */}
              <div>
                <p
                  className="mb-3 text-[11px] text-slate-400"
                  style={{ fontWeight: 600 }}
                >
                  書き直し案
                </p>
                <div className="rounded-xl border border-[#a7f3d0] bg-[rgba(236,253,245,0.5)] p-4">
                  <p
                    className="text-sm text-[#064e3b]"
                    style={{ lineHeight: 1.7 }}
                  >
                    「御社の〇〇事業の中で、XX 領域で顧客課題の解像度を上げる仕事に価値を出したいです。大学で△△の課題を定量化した経験から...」
                  </p>
                  <div className="mt-3">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[11px] bg-[#d1fae5] text-[#047857]"
                      style={{ fontWeight: 600 }}
                    >
                      具体化済み
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <p
              className="mt-4 text-xs italic text-slate-400"
              style={{ lineHeight: 1.6 }}
            >
              スクリーンショット内は見え方のサンプルです。実際の検出結果と書き直し案はあなたの ES に応じて生成されます。
            </p>
          </LandingSectionMotion>
        </div>
      </div>
    </section>
  );
}
