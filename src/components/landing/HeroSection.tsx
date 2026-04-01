import { Button } from "@/components/ui/button";
import { ArrowRight, Check } from "lucide-react";
import { trustPoints } from "@/lib/marketing/landing-content";
import { landingMedia } from "./landing-media";
import { LandingPrimaryAction } from "./LandingPrimaryAction";
import { ScreenPreview } from "./ScreenPreview";
import { ScrollReveal } from "./ScrollReveal";

export function HeroSection() {
  const heroMedia = landingMedia.heroDashboard;
  const esMedia = landingMedia.esReview;
  const companyMedia = landingMedia.companies;

  return (
    <section className="landing-hero-backdrop relative overflow-hidden">
      <div className="landing-grid-glow pointer-events-none absolute inset-0" />
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-24 sm:pb-24 lg:pt-32">
        <div className="grid items-center gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10">
          <ScrollReveal>
            <div className="max-w-xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/12 bg-white/85 px-4 py-2 shadow-[0_18px_40px_-30px_rgba(59,130,246,0.45)]">
                <span className="size-2 rounded-full bg-primary" />
                <span className="text-sm font-medium text-primary">
                  ES添削 × AI × 企業管理 をひとつに
                </span>
              </div>

              <h1 className="text-balance text-[3rem] font-semibold leading-[0.98] tracking-[-0.07em] text-slate-950 sm:text-[4rem] lg:text-[4.8rem]">
                就活を、AIと一緒に
                <br />
                迷わず進める。
              </h1>

              <p className="mt-6 max-w-lg text-pretty text-lg leading-8 text-slate-600 sm:text-[19px]">
                ES添削、志望動機・ガクチカの整理、企業・締切管理。
                <br className="hidden sm:block" />
                就活に必要な情報整理を、ひとつのアプリでAIと一緒に進められます。
              </p>

              <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row">
                <LandingPrimaryAction size="lg" className="h-[54px] px-7 text-base" />
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="landing-cta-secondary h-[54px] min-w-[196px] rounded-full px-6"
                >
                  <a href="#pricing">
                    料金プランを見る
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-slate-500">
                {trustPoints.map((point) => (
                  <span key={point} className="inline-flex items-center gap-2">
                    <Check className="size-4 text-primary" />
                    {point}
                  </span>
                ))}
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.14}>
            <div className="relative mx-auto w-full max-w-[720px] lg:max-w-none">
              <div className="pointer-events-none absolute inset-x-[10%] top-8 h-32 rounded-full bg-[radial-gradient(circle,rgba(96,165,250,0.24),transparent_68%)] blur-3xl" />
              <div className="relative z-10">
                <ScreenPreview
                  src={heroMedia.src}
                  alt={heroMedia.alt}
                  videoSrc={heroMedia.videoSrc}
                  priority
                  label="Dashboard"
                  className="rounded-[34px] border border-white/85 bg-white/95 shadow-[0_42px_120px_-54px_rgba(37,99,235,0.34)]"
                  imageClassName="object-top"
                />
              </div>

              <div className="relative z-20 -mt-8 grid gap-4 px-4 sm:-mt-12 sm:grid-cols-[0.72fr_0.92fr] sm:px-6">
                <ScreenPreview
                  src={companyMedia.src}
                  alt={companyMedia.alt}
                  label="Companies"
                  className="rounded-[26px] border border-white/80 bg-white/94 shadow-[0_32px_90px_-56px_rgba(15,23,42,0.38)]"
                  imageClassName="scale-[1.04] object-top translate-y-[-12px]"
                />
                <ScreenPreview
                  src={esMedia.src}
                  alt={esMedia.alt}
                  label="ES Review"
                  className="rounded-[26px] border border-white/80 bg-white/94 shadow-[0_32px_90px_-56px_rgba(37,99,235,0.3)]"
                  imageClassName="scale-[1.05] object-top translate-y-[-22px] sm:translate-y-[-30px]"
                />
              </div>
            </div>
          </ScrollReveal>
        </div>

        <ScrollReveal delay={0.2}>
          <div className="mt-16 grid gap-4 border-y border-slate-200/80 py-6 md:grid-cols-3">
            {[
              "自己分析",
              "エントリー管理",
              "ES添削 | 面接対策",
            ].map((label) => (
              <div
                key={label}
                className="rounded-full border border-slate-200/80 bg-white/80 px-4 py-3 text-center text-sm font-medium text-slate-600 shadow-[0_16px_40px_-34px_rgba(15,23,42,0.28)]"
              >
                {label}
              </div>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
