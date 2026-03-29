import { Building2 } from "lucide-react";
import { valueStrip, detailSections } from "@/lib/marketing/landing-content";
import { GlassScreenPreview } from "@/components/landing/GlassScreenPreview";
import { GradientBlobBackground } from "@/components/landing/GradientBlobBackground";
import { ScrollReveal } from "@/components/landing/ScrollReveal";

const sectionBlobs = [
  {
    position: "top-[100px] -right-[120px]",
    size: "w-[450px] h-[450px]",
    variant: "blue-light" as const,
    opacity: "opacity-20",
  },
  {
    position: "top-[500px] -left-[80px]",
    size: "w-[300px] h-[300px]",
    variant: "blue" as const,
    opacity: "opacity-15",
  },
];

export function ProductShowcaseB() {
  return (
    <section
      id="features"
      className="relative scroll-mt-24 py-32 lg:scroll-mt-28 lg:py-40"
    >
      <GradientBlobBackground blobs={sectionBlobs} />

      <div className="relative mx-auto max-w-6xl px-4">
        {/* Section header */}
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

        {/* Value strip - staggered floating glass cards */}
        <ScrollReveal delay={0.08}>
          <ul className="mb-20 grid gap-6 md:grid-cols-3 lg:mb-24">
            {valueStrip.map(({ title, description, Icon }, i) => (
              <li
                key={title}
                className={`glass-card p-7 ${i === 1 ? "md:mt-4 animate-float-medium" : i === 2 ? "md:mt-8 animate-float-slow" : "animate-float-fast"}`}
                style={{ animationDelay: `${i * 0.3}s` }}
              >
                <div className="flex items-center gap-3 text-slate-950">
                  <span className="flex size-10 items-center justify-center rounded-full border border-primary/20 bg-primary/5">
                    <Icon className="size-[18px] text-primary" />
                  </span>
                  <p className="text-base font-semibold tracking-[-0.03em]">
                    {title}
                  </p>
                </div>
                <p className="mt-3 max-w-sm text-sm leading-7 text-slate-600">
                  {description}
                </p>
              </li>
            ))}
          </ul>
        </ScrollReveal>

        {/* Detail sections - full-width with blob backgrounds */}
        <div className="flex flex-col gap-20 lg:gap-28">
          {detailSections.map((feature, index) => {
            const isReversed = index % 2 === 1;

            return (
              <ScrollReveal key={feature.id} delay={index * 0.05}>
                <article
                  id={feature.id}
                  className="relative scroll-mt-28 rounded-[32px] bg-white/40 p-6 backdrop-blur-sm sm:p-10 lg:p-12"
                >
                  <div
                    className={[
                      "grid items-center gap-8 lg:grid-cols-2 lg:gap-12",
                      isReversed
                        ? "lg:[&>div:first-child]:order-2 lg:[&>div:last-child]:order-1"
                        : "",
                    ].join(" ")}
                  >
                    <div>
                      <GlassScreenPreview
                        src={feature.image.src}
                        alt={feature.image.alt}
                        imageClassName={feature.imageClassName}
                        className="shadow-[0_24px_60px_-16px_rgba(15,23,42,0.12)]"
                      />
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
