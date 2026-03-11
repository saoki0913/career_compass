"use client";

import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import Link from "next/link";

const plans = [
  {
    name: "Free",
    price: "¥0",
    period: "/月",
    description: "まずは1つ試してみたい方向け",
    features: [
      "月30クレジット",
      "企業登録 5社まで",
      "ESエディタ",
      "AI添削（2〜5クレジット/回）",
      "カレンダー連携",
    ],
    cta: "無料で始める",
    ctaLink: "/login",
    variant: "default" as const,
    badge: null,
  },
  {
    name: "Standard",
    price: "¥980",
    period: "/月",
    dailyPrice: "1日たった¥33",
    description: "就活を継続的に進めたい方向け",
    features: [
      "月300クレジット",
      "企業登録 無制限",
      "添削スタイル 8種",
      "ガクチカ素材 10件まで",
      "志望動機に活かせる企業情報整理",
    ],
    cta: "Standardで始める",
    ctaLink: "/pricing",
    variant: "recommended" as const,
    badge: "一番人気",
  },
  {
    name: "Pro",
    price: "¥2,980",
    period: "/月",
    dailyPrice: "1日¥99",
    description: "添削や作成支援を多めに使いたい方向け",
    features: [
      "月800クレジット",
      "企業登録 無制限",
      "添削スタイル 8種",
      "ガクチカ素材 20件まで",
      "企業情報整理をより多く利用可能",
    ],
    cta: "Proで始める",
    ctaLink: "/pricing",
    variant: "premium" as const,
    badge: "Pro",
  },
] as const;

export function PricingSection() {
  return (
    <section id="pricing" className="py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-16 max-w-6xl lg:grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-end lg:gap-12">
          <div className="text-center lg:text-left">
            <span className="landing-kicker mb-5">料金</span>
            <h2 className="landing-serif text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              まずは無料で始める
            </h2>
          </div>
          <p className="mt-5 text-center text-lg leading-8 text-muted-foreground lg:mt-0 lg:text-left">
            クレジットカード不要。就活の進み方に合わせて、あとからプランを選べます。
          </p>
        </div>

        <div className="grid items-start gap-6 md:grid-cols-3 lg:gap-8">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative ${plan.variant === "recommended" ? "md:-mt-3 md:mb-3" : ""}`}
            >
              <div
                className={`landing-panel h-full rounded-2xl p-7 ${
                  plan.variant === "recommended"
                    ? "border-primary/25 shadow-sm"
                    : plan.variant === "premium"
                      ? "border-primary/30"
                      : ""
                }`}
              >
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight text-foreground">{plan.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{plan.description}</p>
                  </div>
                  {plan.badge ? (
                    <div className="rounded-full border border-primary/15 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                      {plan.badge}
                    </div>
                  ) : null}
                </div>

                <div className="mb-3 flex items-end gap-2">
                  <span className="text-5xl font-semibold tracking-tight text-foreground lg:text-6xl">{plan.price}</span>
                  <span className="pb-1 text-sm text-muted-foreground">{plan.period}</span>
                </div>

                {"dailyPrice" in plan && plan.dailyPrice ? (
                  <div className="mb-6 inline-flex rounded-full bg-muted/35 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {plan.dailyPrice}
                  </div>
                ) : (
                  <div className="mb-6" />
                )}

                <ul className="mb-8 space-y-3.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check
                        className={`mt-0.5 h-5 w-5 shrink-0 ${
                          plan.variant === "recommended"
                            ? "text-primary"
                            : plan.variant === "premium"
                              ? "text-primary"
                              : "text-success"
                        }`}
                      />
                      <span className="text-sm leading-6 text-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  variant={plan.variant === "recommended" ? "default" : "outline"}
                  className="h-12 w-full"
                >
                  <Link href={plan.ctaLink}>{plan.cta}</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          年額プランも準備中です。継続利用しやすい形でご提供予定です。
        </p>
      </div>
    </section>
  );
}
