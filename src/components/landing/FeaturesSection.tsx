"use client";

import { motion } from "framer-motion";
import { Calendar, FileText, MessageSquare } from "lucide-react";

const features = [
  {
    icon: FileText,
    label: "ES添削",
    title: "下書きでも大丈夫。改善点がすぐわかる",
    description:
      "「何を直せばいいか分からない」を解決。構成・具体性・伝わり方をAIがスコア化して、次に手を入れるべきポイントを教えます。",
    points: ["下書きの段階から使える", "改善理由まで見える"],
    accentClass: "bg-primary/10 text-primary",
    dotClass: "bg-primary",
  },
  {
    icon: MessageSquare,
    label: "ガクチカ深掘り",
    title: "質問に答えるだけ。経験が言葉になる",
    description:
      "「自分の強みが分からない」を解決。AIの質問に答えていくだけで、面接で話せるエピソードが整理されます。",
    points: ["会話しながら整理できる", "志望動機づくりにもつながる"],
    accentClass: "bg-accent-teal/10 text-accent-teal",
    dotClass: "bg-accent-teal",
  },
  {
    icon: Calendar,
    label: "選考管理",
    title: "複数社の締切、もう見落とさない",
    description:
      "「いつが締切か分からない」を解決。企業ごとの進捗と締切を一覧管理。Googleカレンダーにも連携できます。",
    points: ["複数社を1画面で確認", "Googleカレンダー連携に対応"],
    accentClass: "bg-accent-yellow/15 text-accent-yellow",
    dotClass: "bg-accent-yellow",
  },
] as const;

export function FeaturesSection() {
  return (
    <section id="features" className="py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-16 max-w-6xl lg:grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-end lg:gap-12">
          <div className="text-center lg:text-left">
            <span className="landing-kicker mb-5">特長</span>
            <h2 className="landing-serif text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              何から始めればいい？
              <br />
              の答えが、ここにある
            </h2>
          </div>
          <p className="mt-5 text-center text-lg leading-8 text-muted-foreground lg:mt-0 lg:text-left">
            ESが書けない、強みが見つからない、締切が不安。
            <br className="hidden sm:block" />
            就活Passは、止まりやすいポイントごとに解決策を用意しています。
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: index * 0.15 }}
              className="landing-panel group relative flex h-full flex-col rounded-xl p-7 shadow-none transition-shadow duration-300 hover:shadow-md"
            >
              <div
                className={`mb-5 flex h-10 w-10 items-center justify-center rounded-full transition-transform duration-300 group-hover:scale-110 ${feature.accentClass}`}
              >
                <feature.icon className="h-4 w-4" />
              </div>
              <p className="mb-3 text-sm font-medium text-primary">
                {feature.label}
              </p>
              <h3 className="text-[1.375rem] font-semibold tracking-tight text-foreground">
                {feature.title}
              </h3>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                {feature.description}
              </p>
              <div
                className="my-6 h-px w-full bg-border/60"
                aria-hidden="true"
              />
              <ul className="mt-auto space-y-3 text-sm leading-6 text-foreground">
                {feature.points.map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <span
                      className={`mt-1 h-2 w-2 rounded-full ${feature.dotClass}`}
                      aria-hidden="true"
                    />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
