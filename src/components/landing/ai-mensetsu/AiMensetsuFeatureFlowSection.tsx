"use client";

import { LandingSectionMotion } from "../LandingSectionMotion";

const steps = [
  {
    number: "01",
    title: "条件設定画面で面接内容を確定",
    description:
      "業界 / 職種 / 面接方式 / 選考種別 / 面接段階 / 面接官タイプ / 厳しさを開始前に確定。方式と段階で質問の作法が変わります。",
  },
  {
    number: "02",
    title: "1 問ずつ深掘り or 次論点へ",
    description:
      "回答のカバー状況を自動で判定し、同義質問は自動で抑制。深掘りが必要な箇所は 1 問 1 論点で重ねます。",
  },
  {
    number: "03",
    title: "最終講評で 7 軸スコア + 改善後の回答例",
    description:
      "7 軸スコアに加え、最も改善が必要な質問の改善後の回答例と次に準備したい論点を返します。質問フロー中は課金ゼロ、成功時のみ 6 クレジット。",
  },
] as const;

export function AiMensetsuFeatureFlowSection() {
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
            条件設定 → 1 問ずつ深掘り → 7 軸講評、の 3 ステップ
          </h2>
          <p
            className="mx-auto mt-4 max-w-xl text-slate-500"
            style={{ lineHeight: 1.7 }}
          >
            質問フロー中は課金なし。最終講評の成功時のみ 6 クレジット消費、失敗時は返金。
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
