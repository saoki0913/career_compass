import { Building2 } from "lucide-react";
import { detailSections, valueStrip } from "@/lib/marketing/landing-content";
import { ScreenPreview } from "./ScreenPreview";
import { ScrollReveal } from "./ScrollReveal";

export function ProductShowcase() {
  return (
    <section
      id="features"
      className="scroll-mt-24 border-t border-slate-200/80 py-28 lg:scroll-mt-28 lg:py-36"
    >
      <div className="mx-auto max-w-6xl px-4">
        <ScrollReveal>
          <div className="mb-14 grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end lg:gap-12">
            <div className="space-y-4">
              <p className="text-sm font-semibold tracking-[0.22em] text-primary uppercase">
                Features
              </p>
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

        <ScrollReveal delay={0.08}>
          <ul className="mb-16 grid gap-5 md:grid-cols-3 lg:mb-20">
            {valueStrip.map(({ title, description, Icon }) => (
              <li
                key={title}
                className="rounded-[28px] border border-slate-200/80 bg-white/88 p-6 shadow-[0_26px_80px_-64px_rgba(15,23,42,0.35)]"
              >
                <div className="flex items-center gap-3 text-slate-950">
                  <span className="flex size-10 items-center justify-center rounded-full border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#eff6ff_100%)] shadow-[0_10px_24px_-18px_rgba(59,130,246,0.38)]">
                    <Icon className="size-[18px]" />
                  </span>
                  <p className="text-base font-semibold tracking-[-0.03em]">{title}</p>
                </div>
                <p className="mt-3 max-w-sm text-sm leading-7 text-slate-600">{description}</p>
              </li>
            ))}
          </ul>
        </ScrollReveal>

        <div className="flex flex-col gap-16 lg:gap-20">
          {detailSections.map((feature, index) => {
            const isReversed = index % 2 === 1;

            return (
              <ScrollReveal key={feature.id} delay={index * 0.05}>
                <article id={feature.id} className="scroll-mt-28">
                  <div
                    className={[
                      "grid items-center gap-8 rounded-[34px] border border-slate-200/80 bg-white/88 p-6 shadow-[0_30px_90px_-64px_rgba(15,23,42,0.34)] sm:p-8 lg:grid-cols-2 lg:gap-12 lg:p-10",
                      isReversed
                        ? "lg:[&>div:first-child]:order-2 lg:[&>div:last-child]:order-1"
                        : "",
                    ].join(" ")}
                  >
                    <div className="max-w-xl">
                      <p className="mb-3 text-sm font-semibold tracking-[0.22em] text-primary uppercase">
                        {index === 0 ? "Writing Flow" : "Management Flow"}
                      </p>
                      <h3 className="text-balance text-2xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-3xl">
                        {feature.title}
                      </h3>
                      <p className="mt-4 text-[17px] leading-8 text-slate-600">
                        {feature.description}
                      </p>
                      <ul className="mt-7 space-y-3">
                        {feature.points.map((point) => (
                          <li key={point} className="flex items-center gap-3 text-sm text-slate-700">
                            <Building2 className="size-4 shrink-0 text-primary" />
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="relative">
                      <div className="pointer-events-none absolute inset-x-[14%] top-8 h-24 rounded-full bg-[radial-gradient(circle,rgba(96,165,250,0.22),transparent_70%)] blur-3xl" />
                      <ScreenPreview
                        src={feature.image.src}
                        alt={feature.image.alt}
                        imageClassName={feature.imageClassName}
                        className="rounded-[32px] border border-white/80 bg-white/95"
                      />
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
