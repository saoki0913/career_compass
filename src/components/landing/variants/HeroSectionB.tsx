import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trustPoints } from "@/lib/marketing/landing-content";
import { landingMedia } from "@/components/landing/landing-media";
import { LandingPrimaryAction } from "@/components/landing/LandingPrimaryAction";
import { GlassScreenPreview } from "@/components/landing/GlassScreenPreview";
import { GradientBlobBackground } from "@/components/landing/GradientBlobBackground";
import { ScrollReveal } from "@/components/landing/ScrollReveal";

const heroBlobs = [
  {
    position: "-top-[180px] -left-[120px]",
    size: "w-[550px] h-[550px]",
    variant: "blue" as const,
    opacity: "opacity-35",
  },
  {
    position: "-top-[80px] -right-[100px]",
    size: "w-[400px] h-[400px]",
    variant: "blue-light" as const,
    opacity: "opacity-30",
  },
];

export function HeroSectionB() {
  const heroMedia = landingMedia.heroDashboard;

  return (
    <section className="relative overflow-hidden">
      <GradientBlobBackground blobs={heroBlobs} />

      <div className="mx-auto max-w-6xl px-4 pb-16 pt-28 sm:pb-20 lg:pt-36">
        {/* Center-aligned text */}
        <ScrollReveal>
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5">
              <span className="text-sm font-medium text-primary">
                ES添削 × AI × 企業管理 をひとつに
              </span>
            </div>

            <h1 className="text-balance text-[2.75rem] font-semibold leading-[1.1] tracking-[-0.04em] text-slate-950 sm:text-[3.5rem] lg:text-[4.25rem]">
              就活を、AIと一緒に
              <br />
              迷わず進める。
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-8 text-slate-600">
              ES添削、志望動機・ガクチカの整理、企業・締切管理。
              <br className="hidden sm:block" />
              就活に必要な情報整理を、ひとつのアプリでAIと一緒に進められます。
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <LandingPrimaryAction
                size="lg"
                className="h-[52px] px-7 text-base"
              />
              <Button
                size="lg"
                variant="outline"
                asChild
                className="landing-cta-secondary h-[52px] min-w-[190px] rounded-full px-6"
              >
                <a href="#pricing">
                  料金プランを見る
                  <ArrowRight className="size-4" />
                </a>
              </Button>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500">
              {trustPoints.map((point) => (
                <span key={point} className="inline-flex items-center gap-2">
                  <Check className="size-4 text-primary" />
                  {point}
                </span>
              ))}
            </div>
          </div>
        </ScrollReveal>

        {/* Tilted screenshot below */}
        <ScrollReveal delay={0.15}>
          <div className="mx-auto mt-16 max-w-[1000px]">
            <GlassScreenPreview
              src={heroMedia.src}
              alt={heroMedia.alt}
              videoSrc={heroMedia.videoSrc}
              priority
              perspective="2000px"
              rotateX={4}
              className="shadow-[0_40px_100px_-30px_rgba(15,23,42,0.22)]"
            />
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
