import { Building2 } from "lucide-react";
import { valueStrip, detailSections } from "@/lib/marketing/landing-content";
import { GlassScreenPreview } from "@/components/landing/GlassScreenPreview";
import { GradientBlobBackground } from "@/components/landing/GradientBlobBackground";
import { ScrollReveal } from "@/components/landing/ScrollReveal";

const sectionBlobs = [
  {
    position: "top-[200px] -right-[150px]",
    size: "w-[400px] h-[400px]",
    variant: "blue-light" as const,
    opacity: "opacity-25",
  },
  {
    position: "top-[600px] -left-[100px]",
    size: "w-[350px] h-[350px]",
    variant: "blue" as const,
    opacity: "opacity-15",
  },
];

export function ProductShowcaseA() {
  return (
    <section
      id="features"
      className="relative scroll-mt-24 py-32 lg:scroll-mt-28 lg:py-40"
    >
      <GradientBlobBackground blobs={sectionBlobs} />

      <div className="relative mx-auto max-w-6xl px-4">
        {/* Section header */}
        <ScrollReveal>
          <div className="mb-14 grid gap-8 border-y border-slate-200/80 py-6 lg:grid-cols-[0.84fr_1.16fr] lg:items-end lg:gap-12">
            <div>
              <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-4xl lg:text-5xl">
                添削も、管理も、
                ひとつのアプリで完結。
              </h2>
            </div>
            <p className="max-w-3xl text-pretty text-lg leading-8 text-slate-600">
              ES添削から企業管理、締切確認まで。必要な機能がひとつにまとまっているから、ツールを行き来する手間がなくなります。
            </p>
          </div>
        </ScrollReveal>

        {/* Value strip - glass cards */}
        <ScrollReveal delay={0.08}>
          <ul className="mb-20 grid gap-6 pb-10 md:grid-cols-3 lg:mb-24">
            {valueStrip.map(({ title, description, Icon }) => (
              <li key={title} className="glass-card-subtle p-6">
                <div className="flex items-center gap-3 text-slate-950">
                  <span className="flex size-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/80 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.28)]">
                    <Icon className="size-[18px]" />
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

        {/* Detail sections with perspective */}
        <div className="flex flex-col gap-16 lg:gap-20">
          {detailSections.map((feature, index) => {
            const isReversed = index % 2 === 1;

            return (
              <ScrollReveal key={feature.id} delay={index * 0.05}>
                <article
                  id={feature.id}
                  className="scroll-mt-28 border-t border-slate-200/80 pt-8 sm:pt-10"
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
                        perspective="1500px"
                        rotateY={isReversed ? 3 : -3}
                        className="shadow-[0_24px_60px_-16px_rgba(15,23,42,0.15)]"
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
