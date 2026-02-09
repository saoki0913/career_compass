"use client";

import { Chrome, Building2, Bot } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Chrome,
    title: "Googleで登録",
    description: "ワンクリックで簡単登録。メールアドレス認証も不要です。",
  },
  {
    number: "02",
    icon: Building2,
    title: "企業を追加",
    description: "志望企業を登録するだけ。締切は自動で管理されます。",
  },
  {
    number: "03",
    icon: Bot,
    title: "AIを活用",
    description: "ES添削やガクチカ深掘りをAIにおまかせ。品質が上がります。",
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-24">
      <div className="container mx-auto px-4">
        {/* Section header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            30秒で始められる
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            シンプルな3ステップ
          </h2>
          <p className="text-lg text-muted-foreground">
            複雑な設定は一切なし。すぐに就活対策を始められます。
          </p>
        </div>

        {/* Steps */}
        <div className="relative max-w-5xl mx-auto">
          {/* Connecting line (desktop) */}
          <div
            className="hidden md:block absolute top-24 left-[16.67%] right-[16.67%] h-0.5 bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20"
            aria-hidden="true"
          />

          <div className="grid md:grid-cols-3 gap-8 md:gap-12">
            {steps.map((step, index) => (
              <div
                key={step.number}
                className="relative opacity-0 animate-fade-up"
                style={{ animationDelay: `${(index + 1) * 200}ms` }}
              >
                {/* Step card */}
                <div className="flex flex-col items-center text-center">
                  {/* Number + Icon */}
                  <div className="relative mb-6">
                    {/* Outer ring */}
                    <div className="absolute inset-0 rounded-full bg-primary/5 scale-125" />

                    {/* Main circle */}
                    <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-card border-2 border-primary/20 shadow-lg">
                      <step.icon className="h-8 w-8 text-primary" />
                    </div>

                    {/* Step number badge */}
                    <div className="absolute -top-2 -right-2 flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold shadow-md">
                      {step.number.replace('0', '')}
                    </div>
                  </div>

                  {/* Content */}
                  <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                  <p className="text-muted-foreground leading-relaxed max-w-xs">
                    {step.description}
                  </p>
                </div>

                {/* Mobile arrow */}
                {index < steps.length - 1 && (
                  <div className="md:hidden flex justify-center my-6">
                    <div className="w-0.5 h-8 bg-gradient-to-b from-primary/40 to-primary/10" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
