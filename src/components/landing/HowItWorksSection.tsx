"use client";

import { Check, Chrome, FileText } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Chrome,
    title: "無料で始める",
    description: "Googleで30秒登録。クレジットカードなしですぐ試せます。",
  },
  {
    number: "02",
    icon: FileText,
    title: "途中の材料を入れる",
    description:
      "下書き中のES、考えかけの志望動機、ガクチカのメモなど、途中の状態から始められます。",
  },
  {
    number: "03",
    icon: Check,
    title: "AIと一緒に整える",
    description:
      "添削・深掘り・志望動機作成で、応募できる状態まで少しずつ仕上げます。",
  },
] as const;

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="bg-secondary/10 py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-16 max-w-6xl lg:grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-end lg:gap-12">
          <div className="text-center lg:text-left">
            <span className="landing-kicker mb-5">使い方</span>
            <h2 className="landing-serif text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              途中からでも、始められる3ステップ
            </h2>
          </div>
          <p className="mt-5 text-center text-lg leading-8 text-muted-foreground lg:mt-0 lg:text-left">
            複雑な準備は不要です。今ある材料から、就活を前に進められます。
          </p>
        </div>

        <div className="relative mx-auto max-w-5xl">
          <div
            className="absolute left-[16.5%] right-[16.5%] top-10 hidden h-px bg-border/60 md:block"
            aria-hidden="true"
          />
          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((step) => (
              <div
                key={step.number}
                className="landing-panel relative h-full rounded-xl p-6 shadow-none"
              >
                <div className="mb-6 flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/40 text-primary">
                    <step.icon className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-semibold tracking-[0.14em] text-primary/70">
                    STEP {step.number}
                  </span>
                </div>
                <h3 className="text-xl font-semibold tracking-tight text-foreground">{step.title}</h3>
                <p className="mt-4 text-base leading-7 text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
