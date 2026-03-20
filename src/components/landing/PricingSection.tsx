import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ScrollReveal } from "./ScrollReveal";

const plans = [
  {
    name: "Free",
    price: "¥0",
    period: "/月",
    description: "まず1つ試してみたい方に。",
    features: [
      "月30クレジット",
      "企業登録 5社まで",
      "ESエディタ",
      "AI添削（2〜5クレジット/回）",
      "カレンダー連携",
    ],
    cta: "無料で始める",
    ctaLink: "/login",
    highlight: false,
  },
  {
    name: "Standard",
    price: "¥980",
    period: "/月",
    dailyPrice: "1日たった¥33",
    description: "継続的に就活を進めたい方に。",
    features: [
      "月300クレジット",
      "企業登録 無制限",
      "設問タイプ8種のAI添削",
      "ガクチカ素材 10件まで",
      "志望動機に活かせる企業情報整理",
    ],
    cta: "Standardで始める",
    ctaLink: "/pricing",
    highlight: true,
  },
  {
    name: "Pro",
    price: "¥2,980",
    period: "/月",
    dailyPrice: "1日¥99",
    description: "添削や作成支援を多めに使いたい方に。",
    features: [
      "月800クレジット",
      "企業登録 無制限",
      "設問タイプ8種のAI添削",
      "ガクチカ素材 20件まで",
      "企業情報整理をより多く利用可能",
    ],
    cta: "Proで始める",
    ctaLink: "/pricing",
    highlight: false,
  },
] as const;

export function PricingSection() {
  return (
    <section
      id="pricing"
      className="landing-section-muted scroll-mt-24 py-28 lg:scroll-mt-28 lg:py-36"
    >
      <div className="mx-auto max-w-6xl px-4">
        <ScrollReveal>
          <div className="mb-16 text-center lg:mb-20">
            <p className="text-sm font-semibold tracking-widest text-primary uppercase">
              料金
            </p>
            <h2 className="mt-4 text-balance text-3xl font-bold tracking-[-0.035em] sm:text-4xl lg:text-[3.25rem]">
              まずは無料で始める。
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-balance text-lg leading-relaxed text-muted-foreground">
              カード不要。あとからプランを選べます。
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <div className="grid items-start gap-6 md:grid-cols-3 lg:gap-8">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  plan.highlight ? "landing-bento-highlight" : "landing-bento-card",
                )}
              >
                <h3 className="text-xl font-semibold tracking-tight text-foreground">
                  {plan.name}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {plan.description}
                </p>

                <div className="mt-6 flex items-end gap-2">
                  <span className="text-5xl font-semibold tracking-tight text-foreground">
                    {plan.price}
                  </span>
                  <span className="pb-1 text-sm text-muted-foreground">
                    {plan.period}
                  </span>
                </div>

                {"dailyPrice" in plan && plan.dailyPrice ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {plan.dailyPrice}
                  </p>
                ) : (
                  <div className="mt-2" />
                )}

                <ul className="mt-8 space-y-3.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                      <span className="text-sm leading-6 text-foreground">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  variant={plan.highlight ? "default" : "outline"}
                  className={cn(
                    "mt-8 h-12 w-full",
                    plan.highlight && "landing-cta-btn",
                  )}
                >
                  <Link href={plan.ctaLink}>{plan.cta}</Link>
                </Button>
              </div>
            ))}
          </div>
        </ScrollReveal>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          全プランで全機能を使えます。クレジットは成功時のみ消費。
        </p>
      </div>
    </section>
  );
}
