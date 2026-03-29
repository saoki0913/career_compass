import { Check } from "lucide-react";
import Link from "next/link";
import { trustPoints } from "@/lib/marketing/landing-content";
import { LandingPrimaryAction } from "@/components/landing/LandingPrimaryAction";
import { landingMedia } from "@/components/landing/landing-media";
import { ScreenPreview } from "@/components/landing/ScreenPreview";
import { ScrollReveal } from "@/components/landing/ScrollReveal";

export function CTASectionVariant() {
  const motivationMedia = landingMedia.motivation;

  return (
    <section className="py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-4">
        <ScrollReveal>
          <div className="relative overflow-hidden rounded-[40px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(239,246,255,0.75))] px-6 py-14 shadow-[0_34px_100px_-58px_rgba(37,99,235,0.28)] sm:px-10 sm:py-18">
            <div className="pointer-events-none absolute inset-x-[20%] top-4 h-24 rounded-full bg-[radial-gradient(circle,rgba(96,165,250,0.22),transparent_70%)] blur-3xl" />
            <div className="relative grid items-center gap-10 lg:grid-cols-[1fr_340px]">
              <div className="text-center lg:text-left">
                <h2 className="text-balance text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-4xl lg:text-5xl">
                  就活、ひとりで抱え込まなくていい。
                </h2>

                <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-8 text-slate-600 sm:text-xl">
                  やることが多すぎて手が止まっても、AIと一緒に一つずつ片付けられます。
                </p>

                <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
                  <LandingPrimaryAction
                    size="lg"
                    className="h-14 px-10 text-lg font-semibold"
                    guestLabel="続ける"
                    unauthenticatedLabel="無料で始める"
                  />
                  <Link
                    href="/pricing"
                    className="landing-cta-secondary inline-flex h-14 items-center justify-center rounded-full px-8 text-base font-semibold transition-colors"
                  >
                    料金プランを見る
                  </Link>
                </div>

                <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 lg:justify-start">
                  {trustPoints.map((point) => (
                    <span
                      key={point}
                      className="inline-flex items-center gap-2 text-sm text-slate-500"
                    >
                      <Check className="size-4 text-primary" />
                      {point}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mx-auto w-full max-w-[320px] lg:max-w-none">
                <ScreenPreview
                  src={motivationMedia.src}
                  alt={motivationMedia.alt}
                  label="Support"
                  className="rounded-[28px] border border-white/85 bg-white/96 shadow-[0_30px_90px_-58px_rgba(15,23,42,0.32)]"
                  imageClassName="object-top"
                />
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
