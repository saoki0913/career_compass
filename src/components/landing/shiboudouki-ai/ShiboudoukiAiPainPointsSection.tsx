"use client";

import { PenLine, Building2, RefreshCcw } from "lucide-react";
import { LandingSectionMotion } from "../LandingSectionMotion";
import { LandingFeatureCard } from "../shared/LandingFeatureCard";

const painPoints = [
  {
    icon: PenLine,
    title: "何を書けばいいか分からない",
    body: "業界理由？企業理由？自分との接続？ 何から手を付けていいか分からない。",
    solution:
      "→ 6 要素を 1 問ずつ順に整理、材料整理の会話を 6〜7 問進めると ES 作成可に",
  },
  {
    icon: Building2,
    title: "どの会社でも使える文面になる",
    body: "「成長できる」「学べる」など、どこでも通じる表現で埋めてしまう。",
    solution:
      "→ 企業の採用ページ・事業内容を材料に、企業固有性の薄い言い回しは深掘りに回す",
  },
  {
    icon: RefreshCcw,
    title: "何度書き直しても良くならない",
    body: "添削で直しても、根本の材料が揃っていないから堂々巡り。",
    solution:
      "→ 材料を先に揃え、ES 作成可の段階に到達してから 300/400/500 字の下書きを生成",
  },
] as const;

export function ShiboudoukiAiPainPointsSection() {
  return (
    <section className="bg-white px-6 py-24 md:py-32">
      <div className="mx-auto max-w-[1100px]">
        <LandingSectionMotion className="mb-14 text-center md:mb-16">
          <h2
            className="text-3xl tracking-tight text-[var(--lp-navy)] md:text-[2.5rem]"
            style={{ fontWeight: 800, lineHeight: 1.3 }}
          >
            志望動機、こんな壁にぶつかっていませんか？
          </h2>
          <p
            className="mx-auto mt-4 max-w-xl text-slate-500"
            style={{ lineHeight: 1.7 }}
          >
            「なぜこの会社？」に答えられない — 就活Pass の AI が、あなたの経験と企業情報をつなぎます。
          </p>
        </LandingSectionMotion>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {painPoints.map((point) => (
            <LandingSectionMotion key={point.title}>
              <LandingFeatureCard
                icon={point.icon}
                title={point.title}
                description={point.body}
                solution={point.solution}
              />
            </LandingSectionMotion>
          ))}
        </div>
      </div>
    </section>
  );
}
