"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

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
      "AI添削 8種テンプレート",
      "ガクチカ深掘り対話",
      "締切管理 + カレンダー連携",
      "企業情報をAIが自動整理",
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
    <section className="py-32 lg:py-40">
      <div className="mx-auto max-w-5xl px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-16 text-center"
        >
          <h2 className="text-3xl font-bold tracking-[-0.035em] sm:text-4xl lg:text-[3.25rem]">
            就活塾の30分の1の価格で、
            <br className="hidden sm:block" />
            始められる。
          </h2>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-3 lg:gap-8">
          {comparisons.map((item) => (
            <motion.div
              key={item.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className={cn(
                "rounded-2xl bg-muted/20 p-8 lg:p-10",
                item.highlight && "border border-primary/20"
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
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
