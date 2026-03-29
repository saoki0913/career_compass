import { Building2 } from "lucide-react";
import Image from "next/image";
import { valueStrip, detailSections } from "@/lib/marketing/landing-content";
import { LaptopFrame } from "./LaptopFrame";
import { ScrollReveal } from "@/components/landing/ScrollReveal";

export function ProductShowcaseC() {
  return (
    <section
      id="features"
      className="scroll-mt-24 py-32 lg:scroll-mt-28 lg:py-40"
    >
      <div className="mx-auto max-w-6xl px-4">
        {/* Section header - centered */}
        <ScrollReveal>
          <div className="mb-14 text-center">
            <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-4xl lg:text-5xl">
              添削も、管理も、
              ひとつのアプリで完結。
            </h2>
            <p className="mx-auto mt-6 max-w-3xl text-pretty text-lg leading-8 text-slate-600">
              ES添削から企業管理、締切確認まで。必要な機能がひとつにまとまっているから、ツールを行き来する手間がなくなります。
            </p>
          </div>
        </ScrollReveal>

        {/* Value strip - icon-based grid (cardless) */}
        <ScrollReveal delay={0.08}>
          <ul className="mb-20 grid gap-12 md:grid-cols-3 lg:mb-24">
            {valueStrip.map(({ title, description, Icon }) => (
              <li key={title} className="text-center">
                <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/8">
                  <Icon className="size-6 text-primary" />
                </div>
                <p className="text-lg font-semibold tracking-[-0.03em] text-slate-950">
                  {title}
                </p>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-7 text-slate-600">
                  {description}
                </p>
              </li>
            ))}
          </ul>
        </ScrollReveal>

        {/* Detail sections with laptop frames */}
        <div className="flex flex-col gap-20 lg:gap-28">
          {detailSections.map((feature, index) => {
            const isReversed = index % 2 === 1;
            const unoptimized = feature.image.src.endsWith(".svg");

            return (
              <ScrollReveal key={feature.id} delay={index * 0.05}>
                <article
                  id={feature.id}
                  className="scroll-mt-28 border-t border-slate-200/80 pt-10 lg:pt-14"
                >
                  <div
                    className={[
                      "grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:gap-16",
                      isReversed
                        ? "lg:[&>div:first-child]:order-2 lg:[&>div:last-child]:order-1"
                        : "",
                    ].join(" ")}
                  >
                    <div>
                      <LaptopFrame className="mx-auto max-w-[540px]">
                        <div className="relative aspect-[16/10] overflow-hidden bg-[linear-gradient(180deg,#eef4ff_0%,#f8fbff_100%)]">
                          <Image
                            src={feature.image.src}
                            alt={feature.image.alt}
                            fill
                            unoptimized={unoptimized}
                            sizes="(min-width: 1024px) 540px, 100vw"
                            className={`object-cover object-top ${feature.imageClassName}`}
                          />
                        </div>
                      </LaptopFrame>
                    </div>

                    <div className="max-w-xl">
                      <h3 className="text-balance text-2xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-3xl">
                        {feature.title}
                      </h3>
                      <p className="mt-4 text-[17px] leading-8 text-slate-600">
                        {feature.description}
                      </p>
                      <ul className="mt-7 space-y-3">
                        {feature.points.map((point) => (
                          <li
                            key={point}
                            className="flex items-center gap-3 text-sm text-slate-700"
                          >
                            <Building2 className="size-4 shrink-0 text-primary" />
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </article>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
