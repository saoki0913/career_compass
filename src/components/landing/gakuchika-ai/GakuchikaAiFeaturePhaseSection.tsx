"use client";

import { LandingSectionMotion } from "../LandingSectionMotion";
import { LandingCheckList } from "../shared/LandingCheckList";

const checkItems = [
  "ES 材料フェーズ: 状況・課題・行動・結果を最短で揃える",
  "面接向け深掘り: 判断理由・役割範囲・成果根拠・再現性を補強",
  "面接準備完了: STAR 本文 + 一言要約 + 想定深掘り + 弱点メモ + 2 分版アウトライン",
] as const;

const phases = [
  {
    key: "ES 材料フェーズ",
    description: "4〜6 問で STAR 4 要素を最短回収",
  },
  {
    key: "ES 作成可",
    description: "300/400/500 字の ES 下書きを生成",
  },
  {
    key: "面接向け深掘り",
    description: "判断理由・役割範囲・成果根拠を補強",
  },
  {
    key: "面接準備完了",
    description: "面接準備パックを提示",
  },
] as const;

export function GakuchikaAiFeaturePhaseSection() {
  return (
    <section className="bg-[var(--lp-surface-page)] px-6 py-24 md:py-32">
      <div className="mx-auto max-w-[1200px]">
        <div className="flex flex-col items-start gap-12 lg:flex-row lg:gap-20">
          {/* Left column: text */}
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
              4 フェーズで段階的に、ES から面接準備まで
            </h3>
            <p className="mb-8 text-slate-500" style={{ lineHeight: 1.8 }}>
              ES 材料フェーズで STAR 4 要素を 4〜6 問で揃え、ES 作成可で下書きを生成。面接向け深掘りで判断理由や成果根拠を補強し、面接準備完了で面接準備パックまで一貫して進みます。
            </p>
            <LandingCheckList items={checkItems} />
          </LandingSectionMotion>

          {/* Right column: phase cards */}
          <LandingSectionMotion className="w-full lg:w-1/2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {phases.map((phase) => (
                <div
                  key={phase.key}
                  className="rounded-xl border border-slate-100 bg-white p-4 transition-all duration-300 hover:border-slate-200 hover:shadow-md hover:shadow-slate-100/60"
                >
                  <p
                    className="text-sm text-[var(--lp-navy)]"
                    style={{ fontWeight: 700 }}
                  >
                    {phase.key}
                  </p>
                  <p
                    className="mt-1.5 text-xs text-slate-500"
                    style={{ lineHeight: 1.6 }}
                  >
                    {phase.description}
                  </p>
                </div>
              ))}
            </div>
          </LandingSectionMotion>
        </div>
      </div>
    </section>
  );
}
