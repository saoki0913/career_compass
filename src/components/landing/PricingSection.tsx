"use client";

import { Button } from "@/components/ui/button";
import { Check, Sparkles } from "lucide-react";
import Link from "next/link";

const plans = [
  {
    name: "Free",
    price: "¥0",
    period: "/月",
    description: "まずは無料でお試し",
    features: [
      "ES添削 3回/月",
      "締切管理",
      "企業情報の登録",
      "基本的なAI機能",
    ],
    cta: "無料で始める",
    ctaLink: "/login",
    highlighted: true,
    badge: null,
  },
  {
    name: "Standard",
    price: "¥980",
    period: "/月",
    description: "本格的な就活対策に",
    features: [
      "ES添削 無制限",
      "ガクチカ深掘り 無制限",
      "優先サポート",
      "詳細な添削コメント",
    ],
    cta: "詳しく見る",
    ctaLink: "/pricing",
    highlighted: false,
    badge: "おすすめ",
  },
];

export function PricingSection() {
  return (
    <section className="py-24">
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

        {/* Pricing cards */}
        <div className="flex flex-col md:flex-row justify-center gap-6 lg:gap-8 max-w-4xl mx-auto">
          {plans.map((plan, index) => (
            <div
              key={plan.name}
              className={`
                relative flex-1 max-w-sm opacity-0 animate-fade-up
                ${plan.highlighted ? 'md:order-first' : ''}
              `}
              style={{ animationDelay: `${(index + 1) * 150}ms` }}
            >
              {/* Badge */}
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent text-accent-foreground text-sm font-medium shadow-lg">
                    <Sparkles className="h-3.5 w-3.5" />
                    {plan.badge}
                  </div>
                </div>
              )}

              <div
                className={`
                  h-full p-8 rounded-2xl border-2 transition-all duration-300
                  ${plan.highlighted
                    ? 'bg-card border-primary/30 shadow-lg shadow-primary/10'
                    : 'bg-card border-border/50 hover:border-accent/30 hover:shadow-md'
                  }
                `}
              >
                {/* Plan name */}
                <div className="mb-6">
                  <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </div>

                {/* Price */}
                <div className="mb-8">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>

                {/* Features */}
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className={`h-5 w-5 shrink-0 mt-0.5 ${plan.highlighted ? 'text-primary' : 'text-success'}`} />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Button
                  asChild
                  variant={plan.highlighted ? "default" : "outline"}
                  className={`
                    w-full h-12
                    ${plan.highlighted
                      ? 'shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30'
                      : ''
                    }
                  `}
                >
                  <Link href={plan.ctaLink}>{plan.cta}</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
