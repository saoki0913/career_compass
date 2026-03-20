import Image from "next/image";
import { Button } from "@/components/ui/button";
import { landingMedia } from "./landing-media";
import { LandingPrimaryAction } from "./LandingPrimaryAction";
import { ScrollReveal } from "./ScrollReveal";

const trustPoints = [
  "クレジットカード不要",
  "30秒で登録",
  "いつでも解約OK",
] as const;

export function HeroSection() {
  const heroMedia = landingMedia.heroDashboard;

  return (
    <section className="landing-hero-backdrop relative overflow-hidden">
      <div className="mx-auto max-w-5xl px-4 pb-16 pt-28 text-center lg:pb-20 lg:pt-36">
        <ScrollReveal>
          <p className="text-sm font-medium tracking-tight text-muted-foreground sm:text-base">
            就活の準備を、ひと続きで。
          </p>

          <h1 className="mx-auto mt-5 max-w-3xl text-balance text-[2.75rem] font-bold leading-[0.92] tracking-[-0.05em] text-foreground sm:text-6xl lg:text-7xl xl:text-8xl">
            就活を、ひとつに。
          </h1>

          <p className="mt-5 text-lg font-semibold leading-snug tracking-tight text-foreground sm:text-xl lg:text-2xl">
            書くことも、進行管理も、同じ流れで。
          </p>

          <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-[17px]">
            AI添削・志望動機・ガクチカの整理から、企業・締切・カレンダー連携まで。
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.15}>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <LandingPrimaryAction size="lg" className="landing-cta-btn" />
            <Button
              size="lg"
              variant="outline"
              asChild
              className="h-12 min-w-[160px] border-border/60 bg-background/60 backdrop-blur-sm"
            >
              <a href="#highlights">要点を見る</a>
            </Button>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {trustPoints.map((point) => (
              <span
                key={point}
                className="inline-flex items-center gap-2 text-sm text-muted-foreground"
              >
                <span
                  className="h-1 w-1 rounded-full bg-muted-foreground/40"
                  aria-hidden="true"
                />
                {point}
              </span>
            ))}
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.3} offset={48}>
          <div className="mx-auto mt-14 max-w-4xl lg:mt-16">
            <div className="landing-bento-media aspect-[16/10]">
              <div className="relative h-full min-h-[220px] overflow-hidden rounded-2xl sm:min-h-[320px]">
                <Image
                  src={heroMedia.src}
                  alt={heroMedia.alt}
                  fill
                  priority
                  sizes="(min-width: 1024px) 896px, 100vw"
                  className="object-cover object-top"
                />
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
