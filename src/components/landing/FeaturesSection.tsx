"use client";

import { Calendar, Sparkles, MessageSquare, ArrowRight } from "lucide-react";

const features = [
  {
    icon: Calendar,
    title: "締切管理",
    subtitle: "もう締切を忘れない",
    description: "企業情報から自動で締切を抽出。Googleカレンダー連携で、通知も完璧。一覧で全ての選考を把握。",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "group-hover:border-blue-500/30",
  },
  {
    icon: Sparkles,
    title: "AI添削",
    subtitle: "プロ級のES品質",
    description: "文章構成・誤字脱字・具体性をAIが分析。改善点を具体的に提案し、通過率アップをサポート。",
    color: "text-primary",
    bgColor: "bg-primary/10",
    borderColor: "group-hover:border-primary/30",
  },
  {
    icon: MessageSquare,
    title: "ガクチカ深掘り",
    subtitle: "強みを言語化",
    description: "AIとの対話で、あなたの経験から強みを引き出す。面接で話せるエピソードが見つかる。",
    color: "text-accent",
    bgColor: "bg-accent/10",
    borderColor: "group-hover:border-accent/30",
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        {/* Section header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            あなたの就活の悩み、
            <span className="text-gradient">解決します</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            時間がない、何から始めればいいかわからない、ESの書き方がわからない。
            <br className="hidden sm:block" />
            そんな悩みを、ウカルンが解決します。
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="group relative opacity-0 animate-fade-up"
              style={{ animationDelay: `${(index + 1) * 150}ms` }}
            >
              <div
                className={`
                  relative h-full p-8 rounded-2xl bg-card border-2 border-transparent
                  shadow-sm transition-all duration-300
                  hover:shadow-lg
                  ${feature.borderColor}
                `}
              >
                {/* Icon */}
                <div className={`inline-flex p-3 rounded-xl ${feature.bgColor} mb-6`}>
                  <feature.icon className={`h-7 w-7 ${feature.color}`} />
                </div>

                {/* Content */}
                <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                <p className={`text-sm font-medium ${feature.color} mb-3`}>
                  {feature.subtitle}
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>

                {/* Hover arrow */}
                <div className="mt-6 flex items-center gap-2 text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                  <span>詳しく見る</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>

                {/* Decorative gradient on hover */}
                <div
                  className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10"
                  style={{
                    background: `radial-gradient(circle at 50% 0%, ${feature.color === 'text-primary' ? 'oklch(0.55 0.2 265 / 0.05)' : feature.color === 'text-accent' ? 'oklch(0.7 0.18 45 / 0.05)' : 'oklch(0.6 0.15 240 / 0.05)'}, transparent 70%)`
                  }}
                  aria-hidden="true"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
