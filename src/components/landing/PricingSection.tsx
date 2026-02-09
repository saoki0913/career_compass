"use client";

import { Button } from "@/components/ui/button";
import { Check, Sparkles, Crown } from "lucide-react";
import Link from "next/link";

const plans = [
  {
    name: "Free",
    price: "¥0",
    period: "/月",
    description: "まずは無料でお試し",
    features: [
      "月30クレジット",
      "企業登録 5社まで",
      "AI添削（2〜5クレジット/回）",
      "締切管理・通知",
    ],
    cta: "無料で始める",
    ctaLink: "/login",
    variant: "default" as const,
    badge: null,
    badgeIcon: null,
  },
  {
    name: "Standard",
    price: "¥980",
    period: "/月",
    dailyPrice: "1日たった¥33",
    description: "本格的な就活対策に",
    features: [
      "月300クレジット",
      "企業登録 無制限",
      "添削スタイル 8種",
      "企業RAG 50ページ/社まで",
    ],
    cta: "Standardで始める",
    ctaLink: "/pricing",
    variant: "recommended" as const,
    badge: "一番人気",
    badgeIcon: Sparkles,
  },
  {
    name: "Pro",
    price: "¥2,980",
    period: "/月",
    dailyPrice: "1日¥99",
    description: "最大限のサポートで内定を",
    features: [
      "月800クレジット",
      "企業登録 無制限",
      "ガクチカ素材 20件まで",
      "企業RAG 150ページ/社まで",
    ],
    cta: "Proで始める",
    ctaLink: "/pricing",
    variant: "premium" as const,
    badge: "Pro",
    badgeIcon: Crown,
  },
];

export function PricingSection() {
  return (
    <section id="pricing" className="py-24">
      <div className="container mx-auto px-4">
        {/* Section header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            まずは
            <span className="text-gradient">無料</span>
            で始めよう
          </h2>
          <p className="text-lg text-muted-foreground">
            クレジットカード不要。いつでもアップグレードできます。
          </p>
        </div>

        {/* Pricing cards - 3 columns */}
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto items-start">
          {plans.map((plan, index) => (
            <div
              key={plan.name}
              className={`
                relative opacity-0 animate-fade-up
                ${plan.variant === "recommended" ? "md:-mt-4 md:mb-4" : ""}
              `}
              style={{ animationDelay: `${(index + 1) * 150}ms` }}
            >
              {/* Badge */}
              {plan.badge && plan.badgeIcon && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium shadow-lg ${
                      plan.variant === "recommended"
                        ? "bg-accent text-accent-foreground"
                        : "bg-primary text-primary-foreground"
                    }`}
                  >
                    <plan.badgeIcon className="h-3.5 w-3.5" />
                    {plan.badge}
                  </div>
                </div>
              )}

              <div
                className={`
                  h-full p-8 rounded-2xl border-2 transition-all duration-300
                  ${
                    plan.variant === "recommended"
                      ? "bg-card border-accent/40 shadow-xl shadow-accent/10 ring-1 ring-accent/20"
                      : plan.variant === "premium"
                        ? "bg-card border-primary/30 shadow-lg shadow-primary/10"
                        : "bg-card border-border/50 hover:border-border hover:shadow-md"
                  }
                `}
              >
                {/* Plan name */}
                <div className="mb-6">
                  <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {plan.description}
                  </p>
                </div>

                {/* Price */}
                <div className="mb-2">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>

                {/* Daily price */}
                {"dailyPrice" in plan && plan.dailyPrice && (
                  <p className="text-xs text-muted-foreground mb-6">
                    {plan.dailyPrice}
                  </p>
                )}
                {!("dailyPrice" in plan && plan.dailyPrice) && (
                  <div className="mb-6" />
                )}

                {/* Features */}
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check
                        className={`h-5 w-5 shrink-0 mt-0.5 ${
                          plan.variant === "recommended"
                            ? "text-accent"
                            : plan.variant === "premium"
                              ? "text-primary"
                              : "text-success"
                        }`}
                      />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Button
                  asChild
                  variant={
                    plan.variant === "recommended"
                      ? "default"
                      : plan.variant === "premium"
                        ? "outline"
                        : "outline"
                  }
                  className={`
                    w-full h-12
                    ${
                      plan.variant === "recommended"
                        ? "shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30"
                        : ""
                    }
                  `}
                >
                  <Link href={plan.ctaLink}>{plan.cta}</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Annual plan hint */}
        <p className="text-center text-sm text-muted-foreground mt-8">
          年額プランも準備中です。さらにお得にご利用いただけます。
        </p>
      </div>
    </section>
  );
}
