"use client";

import { Check } from "lucide-react";
import { LandingSectionMotion } from "../LandingSectionMotion";
import { LandingCheckList } from "../shared/LandingCheckList";

const checkItems = [
  "志望動機・自己PR・ガクチカ・学業/研究・長所短所・挫折経験・将来像・入社後やりたいことの 8 タイプ",
  "設問タイプを自動推定。推奨と異なる場合は手動変更も可能",
  "インターン・本選考など選考種別に合わせた視点で添削",
] as const;

const templateTypes = [
  { label: "自己PR", muted: true },
  { label: "志望動機", muted: true },
  { label: "学業", muted: true },
  { label: "長所短所", muted: true },
  { label: "挫折経験", muted: true },
  { label: "将来像", muted: true },
  { label: "入社後やりたいこと", muted: true },
] as const;

export function EsTensakuAiFeatureTemplateSection() {
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
              8 種の設問テンプレートで、設問ごとに最適な添削
            </h3>
            <p className="mb-8 text-slate-500" style={{ lineHeight: 1.8 }}>
              汎用的な文章修正ではなく、志望動機・自己PR・ガクチカなど設問タイプに合わせた見直しポイントを整理。設問を選ぶだけで、その設問に最適な視点で添削します。
            </p>
            <LandingCheckList items={checkItems} />
          </LandingSectionMotion>

          <LandingSectionMotion className="w-full lg:w-1/2">
            <div
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
              aria-hidden
            >
              {/* Header */}
              <div className="mb-5 flex items-center justify-between">
                <p
                  className="text-xs text-slate-400"
                  style={{ fontWeight: 600 }}
                >
                  設問タイプ
                </p>
                <span
                  className="rounded-full px-2.5 py-0.5 text-[11px] bg-[#ecfdf5] text-[#059669]"
                  style={{ fontWeight: 600 }}
                >
                  準備完了
                </span>
              </div>

              {/* Recommended */}
              <div className="mb-4 rounded-xl bg-[#f0fdf4] p-4">
                <p className="mb-1 text-[11px] text-[#059669]" style={{ fontWeight: 600 }}>
                  推奨: ガクチカ
                </p>
                <p className="text-xs text-[#15803d]" style={{ lineHeight: 1.6 }}>
                  課題と行動の構造を重視した添削を行います
                </p>
              </div>

              {/* Dropdown-like selected */}
              <div className="mb-5 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2.5">
                <span className="text-sm text-slate-700" style={{ fontWeight: 500 }}>ガクチカ</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>

              {/* Other types */}
              <div className="space-y-1.5">
                {templateTypes.map((type) => (
                  <div
                    key={type.label}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-slate-50"
                  >
                    <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-slate-200 bg-white" />
                    <span
                      className="text-xs text-slate-400"
                      style={{ fontWeight: 500 }}
                    >
                      {type.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </LandingSectionMotion>
        </div>
      </div>
    </section>
  );
}
