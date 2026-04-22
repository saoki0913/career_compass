"use client";

import { ClipboardCheck, Target, UsersRound } from "lucide-react";
import { LandingSectionMotion } from "../LandingSectionMotion";
import { LandingFeatureCard } from "../shared/LandingFeatureCard";

const painPoints = [
  {
    icon: UsersRound,
    title: "練習相手がいない",
    body: "OB 訪問や就活塾に頼らず進めたいが、一人だと深掘ってくれる相手がいない。",
    solution: "→ AI 面接官が 1 問 1 論点で深掘り、同義質問は自動で抑制",
  },
  {
    icon: Target,
    title: "会社ごとに準備しきれない",
    body: "本命 5 社を全部カバーしきれない。会社によって聞かれ方が違う。",
    solution: "→ 登録企業の事業内容・採用ページ・業界 seed を材料に、その会社向けの質問を生成",
  },
  {
    icon: ClipboardCheck,
    title: "自分の弱点が分からない",
    body: "練習しても「なんとなく話せた」で終わり、どこを直せばいいか分からない。",
    solution: "→ 7 軸スコアと最弱設問の改善後の回答例を返す",
  },
] as const;

export function AiMensetsuPainPointsSection() {
  return (
    <section className="bg-white px-6 py-24 md:py-32">
      <div className="mx-auto max-w-[1100px]">
        <LandingSectionMotion className="mb-14 text-center md:mb-16">
          <h2
            className="text-3xl tracking-tight text-[var(--lp-navy)] md:text-[2.5rem]"
            style={{ fontWeight: 800, lineHeight: 1.3 }}
          >
            面接対策、こんな壁にぶつかっていませんか？
          </h2>
          <p
            className="mx-auto mt-4 max-w-xl text-slate-500"
            style={{ lineHeight: 1.7 }}
          >
            塾にも頼れず、一人で練習しても深掘られない — 就活Pass の AI 面接官がその壁を超えます。
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
