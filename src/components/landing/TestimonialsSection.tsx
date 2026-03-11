"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Calendar,
  FileText,
  ListChecks,
  UserX,
  Wallet,
} from "lucide-react";

const situations = [
  {
    icon: FileText,
    title: "ESを書いたことがない",
    description:
      "ゼロからでも大丈夫。テンプレートから始めて、AIが一緒に整えていきます。",
  },
  {
    icon: UserX,
    title: "周りに就活仲間がいない",
    description:
      "先輩や友人に聞けなくても、AIに何度でも相談できます。",
  },
  {
    icon: Wallet,
    title: "就活塾は高すぎる",
    description:
      "月980円から。高額な投資なしで、添削・志望動機・締切管理が使えます。",
  },
  {
    icon: ListChecks,
    title: "何社も同時に受けている",
    description:
      "締切を一覧管理。次にやることが一目で分かります。",
  },
] as const;

export function TestimonialsSection() {
  return (
    <section className="bg-secondary/10 py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-16 max-w-6xl lg:grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-end lg:gap-12">
          <div className="text-center lg:text-left">
            <span className="landing-kicker mb-5">使い始め</span>
            <h2 className="landing-serif text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              こんな状態でも、
              <br />
              使い始められます
            </h2>
          </div>
          <p className="mt-5 text-center text-lg leading-8 text-muted-foreground lg:mt-0 lg:text-left">
            完璧な準備ができてから始める必要はありません。
            <br className="hidden sm:block" />
            今の状態から、少しずつ進められます。
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {situations.map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: index * 0.1 }}
              className="landing-panel group flex h-full flex-col rounded-xl p-6 shadow-none transition-shadow duration-300 hover:shadow-md"
            >
              <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-muted/40 text-primary transition-transform duration-300 group-hover:scale-110">
                <item.icon className="h-4 w-4" />
              </div>
              <h3 className="text-xl font-semibold tracking-tight text-foreground">
                {item.title}
              </h3>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                {item.description}
              </p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mx-auto mt-12 max-w-4xl rounded-xl border border-border/50 bg-background px-6 py-8 sm:px-8"
        >
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl text-center lg:text-left">
              <p className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                まずは、止まっている1つから。
              </p>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                企業情報の整理も、志望動機づくりやES添削の材料として活用できます。
                <br className="hidden sm:block" />
                途中の状態から就活Passに入れて、内容を少しずつ整えていけます。
              </p>
            </div>
            <div className="flex flex-col justify-center gap-3 sm:flex-row lg:justify-end">
              <Button
                asChild
                size="lg"
                className="h-12 px-8 landing-cta-btn"
              >
                <Link href="/login">今すぐ無料で試す</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 px-8"
              >
                <a href="#pricing">料金を見る</a>
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
