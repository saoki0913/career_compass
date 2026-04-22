"use client";

import { LandingSectionMotion } from "../LandingSectionMotion";

const steps = [
  {
    number: "01",
    title: "材料を整理",
    description:
      "材料整理で 6 要素を 1 問ずつ確認。6〜7 問で ES 作成可へ到達。",
  },
  {
    number: "02",
    title: "ES 下書きを生成",
    description:
      "300 / 400 / 500 字から選択。企業 RAG と整理済みの材料をもとに生成。",
  },
  {
    number: "03",
    title: "深掘り補強",
    description:
      "ES 解放後に最大 10 問まで弱点補強。未整理や矛盾のあるスロットに絞って再訪。",
  },
] as const;

export function ShiboudoukiAiFeatureDraftSection() {
  return (
    <section className="bg-[var(--lp-surface-page)] px-6 py-24 md:py-32">
      <div className="mx-auto max-w-[1200px]">
        <LandingSectionMotion className="mb-14 text-center md:mb-16">
          <p
            className="mb-3 text-sm text-slate-400"
            style={{ fontWeight: 600 }}
          >
            Feature 03
          </p>
          <h2
            className="text-3xl tracking-tight text-[var(--lp-navy)] md:text-[2.5rem]"
            style={{ fontWeight: 800, lineHeight: 1.3 }}
          >
            材料が揃ったら、300 / 400 / 500 字の ES 下書きを生成
          </h2>
          <p
            className="mx-auto mt-4 max-w-xl text-slate-500"
            style={{ lineHeight: 1.7 }}
          >
            ES 作成可に到達すると「志望動機 ES を作成」CTA が有効化。下書き生成は 6 クレジット、成功時のみ消費。
          </p>
        </LandingSectionMotion>

        <div className="relative">
          {/* Horizontal connector line (desktop only) */}
          <div
            className="absolute left-0 right-0 top-5 hidden h-px bg-slate-200 md:block"
            aria-hidden
          />

          <div className="grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
            {steps.map((step) => (
              <LandingSectionMotion key={step.number}>
                <div className="relative flex h-full flex-col">
                  <div className="relative mb-5 flex items-center">
                    <span
                      className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--lp-navy)] text-sm text-white"
                      style={{ fontWeight: 700 }}
                    >
                      {step.number}
                    </span>
                  </div>
                  <h3
                    className="mb-3 text-lg text-[var(--lp-navy)]"
                    style={{ fontWeight: 700, lineHeight: 1.4 }}
                  >
                    {step.title}
                  </h3>
                  <p
                    className="text-sm text-slate-500"
                    style={{ lineHeight: 1.7 }}
                  >
                    {step.description}
                  </p>
                </div>
              </LandingSectionMotion>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
