"use client";

import { Check } from "lucide-react";
import { LandingSectionMotion } from "../LandingSectionMotion";

const steps = [
  {
    number: "01",
    title: "ES 材料を揃える",
    description:
      "ES 材料フェーズで STAR 4 要素を 4〜6 問で最短回収。断片的なエピソードでも質問の出し方を切り替え、材料を引き出します。",
  },
  {
    number: "02",
    title: "面接向け深掘り",
    description:
      "ES 作成後、面接深掘りフェーズで判断理由・役割範囲・成果根拠・再現性・信憑性を補強。",
  },
  {
    number: "03",
    title: "面接準備パック",
    description:
      "面接準備完了で STAR 本文 + 一言要約 + 想定深掘り質問 + 弱点メモ + 2 分版アウトラインを提示。",
  },
] as const;

export function GakuchikaAiFeatureInterviewReadySection() {
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
            面接準備完了まで、同じ会話で一貫して進める
          </h2>
          <p
            className="mx-auto mt-4 max-w-xl text-slate-500"
            style={{ lineHeight: 1.7 }}
          >
            面接深掘りフェーズで役割・判断理由・成果根拠・再現性を補強。面接準備完了で面接準備パックを提示します。継続深掘りでさらに深い論点にも対応可能。
          </p>
        </LandingSectionMotion>

        {/* Steps + mock card: two-column on large screens */}
        <div className="flex flex-col gap-12 lg:flex-row lg:gap-16">
          {/* Left: steps */}
          <div className="lg:w-[55%]">
            <div className="relative">
              {/* Horizontal connector line (desktop only) */}
              <div
                className="absolute left-0 right-0 top-5 hidden h-px bg-slate-200 md:block lg:hidden"
                aria-hidden
              />
              {/* Vertical connector line (lg only) */}
              <div
                className="absolute left-5 top-[52px] hidden w-px lg:block"
                style={{ height: "calc(100% - 64px)", backgroundColor: "#e2e8f0" }}
                aria-hidden
              />

              <div className="grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6 lg:grid-cols-1 lg:gap-6">
                {steps.map((step) => (
                  <LandingSectionMotion key={step.number}>
                    <div className="relative flex h-full flex-col lg:flex-row lg:gap-5 lg:pl-0">
                      <div className="relative mb-5 flex items-center lg:mb-0">
                        <span
                          className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--lp-navy)] text-sm text-white"
                          style={{ fontWeight: 700 }}
                        >
                          {step.number}
                        </span>
                      </div>
                      <div>
                        <h3
                          className="mb-2 text-lg text-[var(--lp-navy)]"
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
                    </div>
                  </LandingSectionMotion>
                ))}
              </div>
            </div>

            <p className="mt-8 text-xs text-slate-400 lg:pl-[60px]">
              「もっと深掘る」で継続深掘りを重ねると、役割境界 → 数値の裏取り → 再現原則の順でより細かい論点を要求します。
            </p>
          </div>

          {/* Right: CompletionSummary mock card */}
          <LandingSectionMotion className="lg:w-[45%]">
            <div
              className="overflow-hidden rounded-2xl border bg-white"
              style={{
                borderColor: "rgba(226,232,240,0.5)",
                boxShadow: "0 20px 80px rgba(10,15,92,0.08)",
              }}
              aria-hidden
            >
              <div className="p-6">
                {/* Header with badge */}
                <div className="mb-5 flex items-center justify-between">
                  <span
                    className="text-sm text-[var(--lp-navy)]"
                    style={{ fontWeight: 700 }}
                  >
                    面接準備パック
                  </span>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px]"
                    style={{ fontWeight: 600, backgroundColor: "#ecfdf5", color: "#065f46" }}
                  >
                    <Check className="h-3 w-3" strokeWidth={3} style={{ color: "#22c55e" }} />
                    面接準備完了
                  </span>
                </div>

                {/* Completion message */}
                <div
                  className="mb-5 rounded-xl p-3.5"
                  style={{ backgroundColor: "var(--lp-surface-muted)" }}
                >
                  <p className="text-xs" style={{ lineHeight: 1.7, color: "#334155" }}>
                    面接で話せる材料が揃いました。まず核と次に備える論点を整理しています。
                  </p>
                </div>

                {/* 1-line core answer */}
                <div className="mb-4">
                  <p
                    className="mb-2 text-xs"
                    style={{ fontWeight: 600, color: "#334155" }}
                  >
                    まず話す核
                  </p>
                  <div
                    className="rounded-xl border p-3.5"
                    style={{ borderColor: "rgba(10,15,92,0.12)", backgroundColor: "rgba(10,15,92,0.02)" }}
                  >
                    <p className="text-xs" style={{ lineHeight: 1.7, color: "#334155" }}>
                      広報の読者数を回復させた経験から、ユーザー理解に基づく施策立案が得意です
                    </p>
                  </div>
                </div>

                {/* Follow-up questions */}
                <div className="mb-4">
                  <p
                    className="mb-2 text-xs"
                    style={{ fontWeight: 600, color: "#334155" }}
                  >
                    次に聞かれやすい質問
                  </p>
                  <ul className="space-y-2">
                    <li className="flex gap-2 text-xs" style={{ lineHeight: 1.6, color: "#64748b" }}>
                      <span style={{ color: "#94a3b8" }}>-</span>
                      読者数減少の原因をどう特定しましたか？
                    </li>
                    <li className="flex gap-2 text-xs" style={{ lineHeight: 1.6, color: "#64748b" }}>
                      <span style={{ color: "#94a3b8" }}>-</span>
                      デジタル版の効果測定はどうしましたか？
                    </li>
                  </ul>
                </div>

                {/* Weak points */}
                <div>
                  <p
                    className="mb-2 text-xs"
                    style={{ fontWeight: 600, color: "#334155" }}
                  >
                    詰まりやすいポイント
                  </p>
                  <ul className="space-y-2">
                    <li className="flex gap-2 text-xs" style={{ lineHeight: 1.6, color: "#64748b" }}>
                      <span style={{ color: "#94a3b8" }}>-</span>
                      数値的成果の具体性をさらに補強
                    </li>
                  </ul>
                </div>

                {/* Bottom CTA hint */}
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <div className="flex gap-2">
                    <span
                      className="rounded-lg px-3.5 py-2 text-xs text-white"
                      style={{ backgroundColor: "var(--lp-navy)", fontWeight: 600 }}
                    >
                      ESを作成する
                    </span>
                    <span
                      className="rounded-lg border px-3.5 py-2 text-xs"
                      style={{ borderColor: "#e2e8f0", color: "#64748b", fontWeight: 500 }}
                    >
                      更に深掘りする
                    </span>
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
