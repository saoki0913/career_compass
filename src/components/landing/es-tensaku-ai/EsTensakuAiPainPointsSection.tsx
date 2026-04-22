"use client";

import { Building2, HelpCircle, Sparkles } from "lucide-react";
import { LandingSectionMotion } from "../LandingSectionMotion";
import { LandingFeatureCard } from "../shared/LandingFeatureCard";

const painPoints = [
  {
    icon: HelpCircle,
    title: "何を直せばいいかわからない",
    body: "設問タイプに合わせた改善ポイントを自動で提示。8 種の専用テンプレで、どこを直せばいいかが明確になります。",
    solution: "→ 設問タイプを選ぶだけで、その設問に最適な視点で添削",
  },
  {
    icon: Building2,
    title: "どの会社でも同じ内容になる",
    body: "登録した企業の採用ページ・事業内容を自動で取り込み、企業固有性の薄い表現を検出。あなたの言葉で書き直す案を提示します。",
    solution: "→ 登録企業の情報を自動反映し、企業ごとの表現を提案",
  },
  {
    icon: Sparkles,
    title: "AIっぽい文章になってしまう",
    body: "「幅広い視野」「新たな価値」など AI が使いがちな定番フレーズを検出し、あなたの経験に基づいた具体的な表現への書き換え案を出します。",
    solution: "→ 定番フレーズを検出し、あなたの言葉への書き直し案を提示",
  },
] as const;

export function EsTensakuAiPainPointsSection() {
  return (
    <section className="bg-white px-6 py-24 md:py-32">
      <div className="mx-auto max-w-[1100px]">
        <LandingSectionMotion className="mb-14 text-center md:mb-16">
          <h2
            className="text-3xl tracking-tight text-[var(--lp-navy)] md:text-[2.5rem]"
            style={{ fontWeight: 800, lineHeight: 1.3 }}
          >
            ES添削、こんな壁にぶつかっていませんか？
          </h2>
          <p
            className="mx-auto mt-4 max-w-xl text-slate-500"
            style={{ lineHeight: 1.7 }}
          >
            ChatGPT に貼っても汎用的なフィードバックしか返ってこない — 就活Pass の ES 添削 AI がその壁を超えます。
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
