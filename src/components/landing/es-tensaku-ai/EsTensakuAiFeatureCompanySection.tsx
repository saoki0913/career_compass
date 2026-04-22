"use client";

import { LandingSectionMotion } from "../LandingSectionMotion";
import { LandingCheckList } from "../shared/LandingCheckList";

const checkItems = [
  "企業固有性の薄い言い回しを検出し、書き直し案を提示",
  "採用ページ・事業内容・求める人物像を自動参照",
  "ChatGPT のようにプロンプトを毎回設計し直す手間がない",
] as const;

const sources = [
  {
    type: "企業HP",
    label: "事業説明ページ",
    url: "example.co.jp/about/business",
    excerpt: "当社はXX領域で顧客課題の解像度を上げるソリューションを提供し...",
  },
  {
    type: "採用情報",
    label: "求める人物像",
    url: "example.co.jp/recruit/person",
    excerpt: "自ら課題を発見し、チームを巻き込みながら解決できる方を求めて...",
  },
  {
    type: "IR",
    label: "中期経営計画",
    url: "example.co.jp/ir/midterm-plan",
    excerpt: "2027年度までにDX関連事業の売上比率を40%に引き上げる計画...",
  },
] as const;

export function EsTensakuAiFeatureCompanySection() {
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
              登録企業の採用ページ情報を、添削に自動反映
            </h3>
            <p className="mb-8 text-slate-500" style={{ lineHeight: 1.8 }}>
              企業を登録しておくと、採用ページや公開情報を自動で取り込み、添削の前提情報として参照します。その都度プロンプトを設計し直す必要はありません。
            </p>
            <LandingCheckList items={checkItems} />
          </LandingSectionMotion>

          <LandingSectionMotion className="w-full lg:w-1/2">
            <div
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
              aria-hidden
            >
              {/* Header */}
              <p
                className="mb-5 text-xs text-slate-400"
                style={{ fontWeight: 600 }}
              >
                参照した企業情報
              </p>

              {/* Source cards */}
              <div className="space-y-3">
                {sources.map((source) => (
                  <div
                    key={source.label}
                    className="rounded-xl border border-slate-100 bg-white p-4 transition-all duration-300 hover:border-slate-200 hover:shadow-md hover:shadow-slate-100/60"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--lp-tint-navy-soft)]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--lp-navy)]">
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        </svg>
                      </span>
                      <div>
                        <p className="text-xs text-[var(--lp-navy)]" style={{ fontWeight: 600 }}>
                          {source.type}: {source.label}
                        </p>
                        <p className="text-[10px] text-slate-300">{source.url}</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500" style={{ lineHeight: 1.6 }}>
                      {source.excerpt}
                    </p>
                  </div>
                ))}
              </div>

              {/* Bottom badge */}
              <div className="mt-5 flex justify-end">
                <span
                  className="rounded-full px-2.5 py-0.5 text-[11px] bg-[#ecfdf5] text-[#059669]"
                  style={{ fontWeight: 600 }}
                >
                  グラウンディング: 企業情報あり
                </span>
              </div>
            </div>
          </LandingSectionMotion>
        </div>
      </div>
    </section>
  );
}
