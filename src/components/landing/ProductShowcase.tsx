import Image from "next/image";
import { cn } from "@/lib/utils";
import { landingFeatures } from "./landing-features";
import { ScrollReveal } from "./ScrollReveal";

export function ProductShowcase() {
  return (
    <section id="features" className="landing-section-muted scroll-mt-24 py-28 lg:scroll-mt-28 lg:py-36">
      <div className="mx-auto max-w-6xl px-4">
        <ScrollReveal>
          <div className="mx-auto mb-16 max-w-2xl text-center lg:mb-24">
            <p className="text-sm font-semibold tracking-widest text-primary uppercase">
              機能
            </p>
            <h2 className="mt-4 text-balance text-3xl font-bold tracking-[-0.035em] text-foreground sm:text-4xl lg:text-[2.75rem]">
              書く・整える・進める。
            </h2>
            <p className="mt-5 text-balance text-lg leading-relaxed text-muted-foreground">
              添削と対話で文章を磨き、企業と締切をまとめて管理。
            </p>
          </div>
        </ScrollReveal>

        <div className="flex flex-col gap-10 lg:gap-14">
          {landingFeatures.map((feature, index) => {
            const isReversed = index % 2 === 1;

            return (
              <ScrollReveal key={feature.id} delay={index * 0.05}>
                <article
                  id={feature.id}
                  className="landing-bento-card-static scroll-mt-28"
                >
                  <div
                    className={cn(
                      "grid items-center gap-8 lg:grid-cols-2 lg:gap-12",
                      isReversed && "lg:[&>div:first-child]:order-2 lg:[&>div:last-child]:order-1",
                    )}
                  >
                    <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-border/30 bg-muted/30 shadow-inner">
                      <Image
                        src={feature.image.src}
                        alt={feature.image.alt}
                        fill
                        sizes="(min-width: 1024px) 520px, 100vw"
                        className="object-cover object-top"
                      />
                    </div>

                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {feature.kicker}
                      </p>
                      <h3 className="mt-3 text-balance text-2xl font-bold tracking-[-0.03em] text-foreground sm:text-3xl lg:text-[1.85rem]">
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
                              className="h-1 w-1 shrink-0 rounded-full bg-primary/50"
                              aria-hidden="true"
                            />
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
