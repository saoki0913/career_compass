import { Building2, Coins, FileSearch, Shield } from "lucide-react";
import { LandingSectionMotion } from "./LandingSectionMotion";

const points = [
  {
    icon: FileSearch,
    title: "設問タイプごとに専用プロンプト",
    description:
      "志望動機・自己PR・ガクチカ・入社後やりたいこと・職種選択理由など 8 種の設問タイプに、独立した改善テンプレートと評価基準を用意しています。",
  },
  {
    icon: Building2,
    title: "企業情報を取り込み反映",
    description:
      "企業の採用ページ・公開情報を自動収集し、日本語ハイブリッド検索で対話・添削に根拠として反映します。",
  },
  {
    icon: Shield,
    title: "AIらしい表現を検出",
    description:
      "「新たな価値を」「幅広い視野」など AI が出しがちなフレーズを辞書とスコアで検出し、書き直し候補を提示します。",
  },
  {
    icon: Coins,
    title: "失敗時はクレジットゼロ",
    description:
      "AI 処理が失敗したクレジットは消費しません。ES 添削を無料の範囲で試してから、有料プランを検討できます。",
  },
];

export function QualitySection() {
  return (
    <section className="bg-white px-6 py-24 md:py-32">
      <div className="mx-auto max-w-[1100px]">
        <LandingSectionMotion className="mb-14 text-center md:mb-16">
          <h2
            className="text-3xl tracking-tight text-[var(--lp-navy)] md:text-[2.5rem]"
            style={{ fontWeight: 800, lineHeight: 1.3 }}
          >
            AIの仕組みで、ES添削の精度を上げる
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-500" style={{ lineHeight: 1.7 }}>
            設問タイプの理解、企業情報の取り込み、AI 表現の検出。就活AIのベースを仕組みとして用意しています。
          </p>
        </LandingSectionMotion>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {points.map((p) => (
            <LandingSectionMotion key={p.title}>
              <div className="h-full rounded-xl border border-slate-100 bg-white p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-100 bg-slate-50">
                  <p.icon className="h-5 w-5 text-[var(--lp-navy)]" strokeWidth={1.5} />
                </div>
                <h3
                  className="mb-2 text-base text-[var(--lp-navy)]"
                  style={{ fontWeight: 700 }}
                >
                  {p.title}
                </h3>
                <p className="text-sm text-slate-500" style={{ lineHeight: 1.7 }}>
                  {p.description}
                </p>
              </div>
            </LandingSectionMotion>
          ))}
        </div>
      </div>
    </section>
  );
}
