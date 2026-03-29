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
    position: "-top-[200px] -right-[100px]",
    size: "w-[600px] h-[600px]",
    variant: "blue" as const,
    opacity: "opacity-40",
  },
  {
    position: "top-[100px] -left-[200px]",
    size: "w-[500px] h-[500px]",
    variant: "blue-light" as const,
    opacity: "opacity-30",
  },
];

export function HeroSectionA() {
  const heroMedia = landingMedia.heroDashboard;
  const esMedia = landingMedia.esReview;

  return (
    <section className="relative overflow-hidden">
      <GradientBlobBackground blobs={heroBlobs} />

      <div className="mx-auto max-w-6xl px-4 pb-16 pt-28 sm:pb-20 lg:pt-36">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8">
          {/* Left: Text */}
          <ScrollReveal>
            <div>
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

              <p className="mt-6 max-w-xl text-pretty text-lg leading-8 text-slate-600">
                ES添削、志望動機・ガクチカの整理、企業・締切管理。
                <br className="hidden sm:block" />
                就活に必要な情報整理を、ひとつのアプリでAIと一緒に進められます。
              </p>

              <div className="mt-10 flex flex-col items-start gap-3 sm:flex-row">
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

              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500">
                {trustPoints.map((point) => (
                  <span key={point} className="inline-flex items-center gap-2">
                    <Check className="size-4 text-primary" />
                    {point}
                  </span>
                ))}
              </div>
            </div>
          </ScrollReveal>

          {/* Right: Perspective screens */}
          <ScrollReveal delay={0.15}>
            <div className="relative mx-auto w-full max-w-[560px] lg:max-w-none">
              <div style={{ perspective: "2000px", transformStyle: "preserve-3d" }}>
                {/* Main dashboard - front */}
                <GlassScreenPreview
                  src={heroMedia.src}
                  alt={heroMedia.alt}
                  videoSrc={heroMedia.videoSrc}
                  priority
                  rotateY={-8}
                  rotateX={4}
                  className="shadow-[0_32px_80px_-20px_rgba(15,23,42,0.25)]"
                />

                {/* ES review - behind and offset */}
                <div className="mt-[-40%] ml-[8%] lg:mt-[-35%] lg:ml-[12%]">
                  <GlassScreenPreview
                    src={esMedia.src}
                    alt={esMedia.alt}
                    rotateY={-12}
                    rotateX={2}
                    imageClassName="scale-[1.05] object-top translate-y-[-34px] sm:translate-y-[-52px]"
                    className="shadow-[0_24px_60px_-16px_rgba(15,23,42,0.2)]"
                  />
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
