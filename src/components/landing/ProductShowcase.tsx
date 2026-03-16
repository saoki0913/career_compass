"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { landingFeatures } from "./landing-features";

export function ProductShowcase() {
  return (
    <section id="features" className="py-32 lg:py-40">
      <div className="mx-auto max-w-5xl px-4">
        <div className="space-y-0">
          {landingFeatures.map((feature, index) => {
            const isReversed = index % 2 === 1;

            return (
              <div key={feature.id}>
                {index > 0 && (
                  <div className="mx-auto max-w-5xl border-b border-border/20" />
                )}
                <div
                  className={cn(
                    "grid items-center gap-10 lg:grid-cols-2 lg:gap-16",
                    index > 0 && "pt-24 lg:pt-32",
                    index < landingFeatures.length - 1 && "pb-24 lg:pb-32"
                  )}
                >
                  {/* Screenshot */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                    className={cn(
                      "order-1",
                      isReversed ? "lg:order-2" : "lg:order-1"
                    )}
                  >
                    <div className="relative aspect-[16/10] overflow-hidden rounded-2xl shadow-lg">
                      <Image
                        src={feature.image}
                        alt={`${feature.kicker}の画面`}
                        fill
                        className="object-cover object-top"
                      />
                    </div>
                  </motion.div>

                  {/* Text */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    className={cn(
                      "order-2",
                      isReversed ? "lg:order-1" : "lg:order-2"
                    )}
                  >
                    <p className="text-sm font-medium text-muted-foreground">
                      {feature.kicker}
                    </p>
                    <h3 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-foreground sm:text-3xl lg:text-[2rem]">
                      {feature.title}
                    </h3>
                    <p className="mt-4 text-[17px] leading-[1.75] text-muted-foreground">
                      {feature.description}
                    </p>
                    <ul className="mt-6 space-y-2.5">
                      {feature.points.map((point) => (
                        <li
                          key={point}
                          className="flex items-center gap-3 text-sm text-foreground"
                        >
                          <span
                            className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50"
                            aria-hidden="true"
                          />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
