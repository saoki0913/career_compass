import { Building2, Coins, FileSearch, Shield } from "lucide-react";
import { LandingSectionMotion } from "./LandingSectionMotion";

const points = [
  {
    icon: FileSearch,
    title: "設問ごとに専用テンプレート",
    description:
      "志望動機・自己PR・ガクチカ・入社後やりたいこと・研究内容など、設問の種類ごとに評価観点と書き方のお手本を切り替えて添削します。",
  },
  {
    icon: Building2,
    title: "会社情報を添削にそのまま反映",
    description:
      "企業の採用ページや公開情報を読み込んで、会話や添削の根拠として引用。毎回ユーザーがペーストする手間を省きます。",
  },
  {
    icon: Shield,
    title: "AI っぽい定型文を、自分の言葉へ",
    description:
      "「幅広い視野」「新たな価値」など AI が使いがちなフレーズを自動で見つけて、別の表現への書き直しを提案します。",
  },
  {
    icon: Coins,
    title: "失敗時はクレジットゼロ",
    description:
      "AI 処理が失敗したときはクレジットを消費しません。Free プランの範囲で試してから、有料プランを検討できます。",
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
            その会社・その設問にしっかり寄せる仕組み
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-500" style={{ lineHeight: 1.7 }}>
            設問ごとの専用テンプレと、会社情報をふまえたチェック。AI まかせで終わらせない添削を目指しています。
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
