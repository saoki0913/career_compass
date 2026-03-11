"use client";

import { motion } from "framer-motion";
import { Compass, UserX, Wallet, ArrowRight } from "lucide-react";

const painPoints = [
  {
    icon: Compass,
    title: "何から手をつければいいか分からない",
    description:
      "ESも志望動機も、何を書けばいいか見当がつかない。自分の強みも言葉にできない。",
    accentColor: "bg-primary/10 text-primary",
  },
  {
    icon: UserX,
    title: "周りに聞ける人がいない",
    description:
      "先輩も就活仲間も少なく、相談相手が見つからない。一人で進めるしかない。",
    accentColor: "bg-accent-teal/10 text-accent-teal",
  },
  {
    icon: Wallet,
    title: "就活塾は高すぎる",
    description:
      "プロに頼りたいけど、月3万〜10万は出せない。でも無料ツールだけだと不安。",
    accentColor: "bg-accent-coral/10 text-accent-coral",
  },
] as const;

export function PainPointsSection() {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <span className="landing-kicker mb-5">悩み</span>
          <h2 className="landing-serif text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
            こんな悩み、ありませんか？
          </h2>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            就活を始めたいけど、どこから手をつけていいか分からない。
            <br className="hidden sm:block" />
            そんな声から就活Passは生まれました。
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {painPoints.map((point, index) => (
            <motion.div
              key={point.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: index * 0.12 }}
              className="landing-panel group relative flex h-full flex-col rounded-xl p-7 shadow-none transition-shadow duration-300 hover:shadow-md"
            >
              <div
                className={`mb-5 flex h-12 w-12 items-center justify-center rounded-full transition-transform duration-300 group-hover:scale-110 ${point.accentColor}`}
              >
                <point.icon className="h-5 w-5" />
              </div>
              <h3 className="text-xl font-semibold tracking-tight text-foreground">
                {point.title}
              </h3>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                {point.description}
              </p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="mt-10 flex items-center justify-center gap-2 text-center"
        >
          <ArrowRight className="h-4 w-4 text-primary" />
          <p className="text-lg font-semibold text-foreground">
            就活Passなら、この悩みを1つのアプリで解決できます。
          </p>
        </motion.div>
      </div>
    </section>
  );
}
