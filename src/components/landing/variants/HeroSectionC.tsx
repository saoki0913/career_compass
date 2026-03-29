import { ArrowRight, Check } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { trustPoints } from "@/lib/marketing/landing-content";
import { landingMedia } from "@/components/landing/landing-media";
import { LandingPrimaryAction } from "@/components/landing/LandingPrimaryAction";
import { LaptopFrame } from "./LaptopFrame";
import { ScrollReveal } from "@/components/landing/ScrollReveal";

export function HeroSectionC() {
  const heroMedia = landingMedia.heroDashboard;
  const unoptimized = heroMedia.src.endsWith(".svg");

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/60 via-white to-white">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-28 sm:pb-20 lg:pt-36">
        {/* Full-width centered text */}
        <ScrollReveal>
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5">
              <span className="text-sm font-medium text-primary">
                ES添削 × AI × 企業管理 をひとつに
              </span>
            </div>

            <h1 className="text-balance text-[3rem] font-semibold leading-[1.08] tracking-[-0.04em] text-slate-950 sm:text-[3.75rem] lg:text-[4.75rem]">
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

        {/* Laptop mockup */}
        <ScrollReveal delay={0.15}>
          <div className="mx-auto mt-16 max-w-[960px]">
            <LaptopFrame>
              <div className="relative aspect-[16/10] overflow-hidden bg-[linear-gradient(180deg,#eef4ff_0%,#f8fbff_100%)]">
                {heroMedia.videoSrc ? (
                  <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    poster={heroMedia.src}
                    className="h-full w-full object-cover object-top"
                  >
                    <source src={heroMedia.videoSrc} type="video/mp4" />
                  </video>
                ) : (
                  <Image
                    src={heroMedia.src}
                    alt={heroMedia.alt}
                    fill
                    priority
                    unoptimized={unoptimized}
                    sizes="(min-width: 1024px) 960px, 100vw"
                    className="object-cover object-top"
                  />
                )}
              </div>
            </LaptopFrame>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
