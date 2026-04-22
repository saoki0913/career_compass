"use client";

import { BarChart3, Cpu, Layers, Sparkles } from "lucide-react";
import { LandingSectionMotion } from "../LandingSectionMotion";
import { LandingCheckList } from "../shared/LandingCheckList";

const checkItems = [
  "方式を切り替えると、AI 面接官の質問の作法と深掘りの基準が変わる",
  "「ケース面接」は構造化・仮説・打ち手の優先順位で聞く。「行動面接への切替」禁止",
  "「技術面接」は前提・トレードオフ・再現性まで深掘る",
] as const;

const methods = [
  {
    icon: Layers,
    key: "行動面接",
    description:
      "1 問 1 論点で STAR 互換の深掘り。志望動機・ガクチカ・経験の具体性を 1 つずつ確認。",
  },
  {
    icon: BarChart3,
    key: "ケース面接",
    description:
      "構造化・仮説・打ち手の優先順位。会社固有のケースで判断軸を確認。",
  },
  {
    icon: Cpu,
    key: "技術面接",
    description:
      "設計判断・前提・トレードオフ・再現性。エンジニア職の技術面接を想定。",
  },
  {
    icon: Sparkles,
    key: "人生史面接",
    description:
      "転機・価値観・行動の一貫性。幼少期から現在までの選択・価値観を時系列で確認。",
  },
] as const;

export function AiMensetsuFeatureFormatsSection() {
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
              面接方式ごとに、質問の作法と深掘り基準を切り替え
            </h3>
            <p className="mb-8 text-slate-500" style={{ lineHeight: 1.8 }}>
              同一機能の中で 4 方式を切り替え可能。方式ごとに質問の構え・切替の可否を変えます。ケース面接では行動面接への切替を禁止、「ケース面接のまとめ」でのみ志望動機系を限定解禁します。
            </p>
            <LandingCheckList items={checkItems} />
          </LandingSectionMotion>

          <LandingSectionMotion className="w-full lg:w-1/2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {methods.map((method) => (
                <div
                  key={method.key}
                  className="rounded-xl border border-slate-100 bg-white p-5 transition-all duration-300 hover:border-slate-200 hover:shadow-md hover:shadow-slate-100/60"
                >
                  <div className="mb-4 flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--lp-tint-navy-soft)]">
                      <method.icon
                        className="h-4 w-4 text-[var(--lp-navy)]"
                        strokeWidth={1.75}
                      />
                    </span>
                    <span
                      className="text-sm text-[var(--lp-navy)]"
                      style={{ fontWeight: 700 }}
                    >
                      {method.key}
                    </span>
                  </div>
                  <p
                    className="text-sm text-slate-500"
                    style={{ lineHeight: 1.7 }}
                  >
                    {method.description}
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
