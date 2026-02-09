"use client";

import { Sparkles, Shield, Zap, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const highlights = [
  {
    icon: Sparkles,
    title: "AI添削でES品質UP",
    description:
      "8種類の添削スタイルで、あなたのESを多角的に改善。構成・誤字・具体性をAIが分析します。",
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    icon: Shield,
    title: "締切を自動で管理",
    description:
      "企業情報から締切を抽出し、Googleカレンダーと連携。もう締切を見逃しません。",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  {
    icon: Zap,
    title: "企業研究をAIが支援",
    description:
      "採用ページから情報を自動収集。RAG検索で企業理解を深め、志望動機作成に活かせます。",
    color: "text-accent",
    bgColor: "bg-accent/10",
  },
];

export function TestimonialsSection() {
  return (
    <section className="py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        {/* Section header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 text-accent text-sm font-medium mb-6">
            <Gift className="h-4 w-4" />
            無料で始められます
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            ウカルンで
            <span className="text-gradient">できること</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            ES添削・締切管理・企業研究を、ひとつのアプリで。
            <br className="hidden sm:block" />
            就活の「やるべきこと」を、AIがまとめてサポートします。
          </p>
        </div>

        {/* Feature highlights */}
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto mb-16">
          {highlights.map((item, index) => (
            <div
              key={item.title}
              className="opacity-0 animate-fade-up"
              style={{ animationDelay: `${(index + 1) * 150}ms` }}
            >
              <div className="relative h-full p-6 rounded-2xl bg-card border border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <div
                  className={`inline-flex p-3 rounded-xl ${item.bgColor} mb-4`}
                >
                  <item.icon className={`h-6 w-6 ${item.color}`} />
                </div>

                <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                <p className="text-muted-foreground leading-relaxed text-sm">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center">
          <div className="inline-flex flex-col items-center gap-4 p-8 rounded-2xl bg-card border border-border/50 shadow-sm max-w-lg">
            <p className="text-lg font-semibold">まずは無料で使ってみる</p>
            <p className="text-sm text-muted-foreground">
              企業登録とES作成から始めて、必要ならAI添削を試せます。
            </p>
            <div className="flex flex-col sm:flex-row gap-2 w-full justify-center">
              <Button asChild size="lg" className="h-12 px-8">
                <Link href="/login">無料で始める</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-8">
                <Link href="/pricing">料金を見る</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
