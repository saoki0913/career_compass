"use client";

import { Check } from "lucide-react";
import { LandingSectionMotion } from "../LandingSectionMotion";

const axes = [
  { label: "企業適合性", description: "その企業の事業・文化・求める人物像との合致" },
  { label: "職種適合性", description: "応募職種で求められる能力・経験との合致" },
  { label: "具体性", description: "固有名詞・数字・意思決定理由の具体性" },
  { label: "論理性", description: "結論・根拠・事実の構造が崩れていないか" },
  { label: "説得力", description: "面接官が納得できる説得力のある説明" },
  { label: "一貫性", description: "志望動機・ガクチカ・ES との一貫性" },
  { label: "信憑性", description: "内容の信憑性（過度な盛りや抽象化の検出）" },
] as const;

const SCORE_ITEMS = [
  { label: "企業適合性", score: 8 },
  { label: "職種適合性", score: 7 },
  { label: "具体性", score: 8 },
  { label: "論理性", score: 9 },
  { label: "説得力", score: 8 },
  { label: "一貫性", score: 7 },
  { label: "信憑性", score: 8 },
] as const;

const nextPreparation = [
  "事業ごとに「自分がどの論点で価値を出すか」を 1 段階具体化",
  "原体験のうち「打ち手の判断軸」を言語化して用意",
  "過去の ES・志望動機と一貫するエピソードの優先順位を整理",
] as const;

export function AiMensetsuFeatureScoringSection() {
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
              最終講評は 7 軸スコア + 最弱設問の改善後の回答例
            </h3>
            <p className="mb-8 text-slate-500" style={{ lineHeight: 1.8 }}>
              面接終了後に、7 軸でスコアと所見を返します。加えて、強み・改善点・一貫性リスク・最弱設問の改善後の回答例・次に準備したい論点まで一括で返します。
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {axes.map((axis) => (
                <div
                  key={axis.label}
                  className="rounded-xl border border-slate-100 bg-white p-3"
                >
                  <p
                    className="text-sm text-[var(--lp-navy)]"
                    style={{ fontWeight: 700 }}
                  >
                    {axis.label}
                  </p>
                  <p
                    className="mt-1 text-xs text-slate-500"
                    style={{ lineHeight: 1.6 }}
                  >
                    {axis.description}
                  </p>
                </div>
              ))}
            </div>
          </LandingSectionMotion>

          <LandingSectionMotion className="w-full lg:w-1/2">
            <div
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
              aria-hidden
            >
              {/* 7-axis score grid */}
              <div className="mb-5">
                <p
                  className="mb-3 text-xs text-slate-400"
                  style={{ fontWeight: 600 }}
                >
                  7 軸スコア
                </p>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {SCORE_ITEMS.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-lg border border-[var(--lp-border-default)] p-3 text-center"
                    >
                      <p className="text-xs text-slate-500">{item.label}</p>
                      <p
                        className="text-lg text-[var(--lp-navy)]"
                        style={{ fontWeight: 700 }}
                      >
                        {item.score}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-5 border-t border-slate-100" />

              {/* Strengths */}
              <div className="mb-4">
                <p
                  className="mb-2 text-xs text-slate-500"
                  style={{ fontWeight: 600 }}
                >
                  良かった点
                </p>
                <p className="text-sm text-slate-600" style={{ lineHeight: 1.7 }}>
                  • 業界への理解が深く、具体的な事例を用いている
                </p>
              </div>

              {/* Improvements */}
              <div>
                <p
                  className="mb-2 text-xs text-slate-500"
                  style={{ fontWeight: 600 }}
                >
                  改善点
                </p>
                <p className="text-sm text-slate-600" style={{ lineHeight: 1.7 }}>
                  • 他社との差別化が不明確。将来像の具体性をさらに高めるとよい
                </p>
              </div>

              <div className="my-5 border-t border-slate-100" />

              <div>
                <p
                  className="mb-2 text-[11px] text-slate-400"
                  style={{ fontWeight: 600 }}
                >
                  最も改善が必要な質問
                </p>
                <p
                  className="text-sm text-slate-700"
                  style={{ fontWeight: 500, lineHeight: 1.7 }}
                >
                  御社の〇〇事業の中で、あなたが一番価値を出したいテーマは何ですか？
                </p>
              </div>

              <div className="my-5 border-t border-slate-100" />

              <div>
                <p
                  className="mb-2 text-[11px] text-slate-400"
                  style={{ fontWeight: 600 }}
                >
                  その時の回答
                </p>
                <p
                  className="text-sm italic text-slate-500"
                  style={{ lineHeight: 1.7 }}
                >
                  「成長できる環境だと感じていて、幅広く貢献したいと思っています。」
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  サンプル
                </p>
              </div>

              <div className="my-5 border-t border-slate-100" />

              <div>
                <p
                  className="mb-2 text-[11px] text-slate-400"
                  style={{ fontWeight: 600 }}
                >
                  改善後の回答例
                </p>
                <p
                  className="text-sm text-[var(--lp-navy)]"
                  style={{ fontWeight: 500, lineHeight: 1.75 }}
                >
                  御社の〇〇事業の中では、XX 領域で顧客課題の解像度を上げる仕事に価値を出したいです。大学で△△の課題を定量化した経験から、既存の KPI だけでは取りこぼす論点を一段具体化する打ち手が得意だと感じており、そこを起点に〇〇事業へ貢献したいと考えています。
                </p>
              </div>

              <div className="my-5 border-t border-slate-100" />

              <div>
                <p
                  className="mb-3 text-[11px] text-slate-400"
                  style={{ fontWeight: 600 }}
                >
                  次に準備したい論点
                </p>
                <ul className="space-y-2">
                  {nextPreparation.map((text) => (
                    <li key={text} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--lp-success)]">
                        <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
                      </span>
                      <span
                        className="text-xs text-slate-600"
                        style={{ lineHeight: 1.6 }}
                      >
                        {text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p
              className="mt-4 text-xs italic text-slate-400"
              style={{ lineHeight: 1.6 }}
            >
              スクリーンショット内は見え方のサンプルです。実際の講評はあなたの回答に応じて生成されます。
            </p>
          </LandingSectionMotion>
        </div>
      </div>
    </section>
  );
}
