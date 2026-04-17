"use client";

import { CircleHelp, FileQuestion, Layers } from "lucide-react";
import { LandingSectionMotion } from "../LandingSectionMotion";
import { LandingFeatureCard } from "../shared/LandingFeatureCard";

const painPoints = [
  {
    icon: FileQuestion,
    title: "エピソードが弱い気がする",
    body: "数字もインパクトもない活動で、ガクチカになるか分からない。",
    solution:
      "→ 断片的なエピソードでも前後差・反応・変化のいずれかを引き出す設計",
  },
  {
    icon: Layers,
    title: "ES と面接で準備がバラバラ",
    body: "ES 用に書いたガクチカを面接では別の観点で聞かれて詰まる。",
    solution:
      "→ 同一セッションで ES 作成 → 面接深掘り → 面接準備完了まで段階的に進む",
  },
  {
    icon: CircleHelp,
    title: "何度書き直しても浅いまま",
    body: "添削しても「で、何が学べたの？」と言われる深さに届かない。",
    solution:
      "→ STAR + 因果欠落チェックで課題→行動→結果の接続を補強",
  },
] as const;

export function GakuchikaAiPainPointsSection() {
  return (
    <section className="bg-white px-6 py-24 md:py-32">
      <div className="mx-auto max-w-[1100px]">
        <LandingSectionMotion className="mb-14 text-center md:mb-16">
          <h2
            className="text-3xl tracking-tight text-[var(--lp-navy)] md:text-[2.5rem]"
            style={{ fontWeight: 800, lineHeight: 1.3 }}
          >
            ガクチカ、こんな壁にぶつかっていませんか？
          </h2>
          <p
            className="mx-auto mt-4 max-w-xl text-slate-500"
            style={{ lineHeight: 1.7 }}
          >
            ES と面接で別々に準備するのは非効率 — 就活Pass なら同じ会話で両方を仕上げます。
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
