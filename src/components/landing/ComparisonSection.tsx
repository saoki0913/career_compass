import { cn } from "@/lib/utils";
import { ScrollReveal } from "./ScrollReveal";

const comparisons = [
  {
    name: "無料ツール",
    price: "¥0",
    features: [
      "ES添削のみ",
      "ガクチカ対応なし",
      "締切管理なし",
      "企業情報整理なし",
    ],
    highlight: false,
  },
  {
    name: "就活Pass",
    price: "¥0〜980/月",
    features: [
      "AI添削（設問タイプ8種）",
      "志望動機・ガクチカの対話支援",
      "締切管理 + Googleカレンダー連携",
      "企業・選考の整理",
    ],
    highlight: true,
  },
  {
    name: "就活塾",
    price: "¥30,000+/月",
    features: [
      "個別ES添削",
      "面接対策・模擬面接",
      "対面でのサポート",
      "通塾の時間が必要",
    ],
    highlight: false,
  },
] as const;

export function ComparisonSection() {
  return (
    <section className="landing-section-dark scroll-mt-24 py-28 lg:scroll-mt-28 lg:py-36">
      <div className="mx-auto max-w-6xl px-4">
        <ScrollReveal>
          <div className="mb-16 text-center lg:mb-20">
            <p className="text-sm font-semibold tracking-widest text-primary uppercase">
              比較
            </p>
            <h2 className="mt-4 text-balance text-3xl font-bold tracking-[-0.035em] sm:text-4xl lg:text-[3.25rem]">
              就活塾の30分の1の価格で、
              <br className="hidden sm:block" />
              始められる。
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-balance text-muted-foreground">
              無料から試せるプランあり。必要になったらアップグレード。
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <div className="grid gap-6 md:grid-cols-3 lg:gap-8">
            {comparisons.map((item) => (
              <div
                key={item.name}
                className={cn(
                  item.highlight ? "landing-bento-highlight" : "landing-bento-card",
                )}
              >
                <h3 className="text-lg font-semibold text-foreground">
                  {item.name}
                </h3>
                <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                  {item.price}
                </p>
                <ul className="mt-6 space-y-3">
                  {item.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-3 text-sm text-muted-foreground"
                    >
                      <span
                        className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50"
                        aria-hidden="true"
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
