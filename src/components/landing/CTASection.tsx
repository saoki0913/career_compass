import { LandingPrimaryAction } from "./LandingPrimaryAction";
import { ScrollReveal } from "./ScrollReveal";

const trustPoints = [
  "クレジットカード不要",
  "30秒で登録",
  "いつでも解約OK",
] as const;

export function CTASection() {
  return (
    <section className="landing-section-dark py-28 lg:py-40">
      <div className="mx-auto max-w-6xl px-4">
        <ScrollReveal>
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold tracking-widest text-primary uppercase">
              はじめよう
            </p>
            <h2 className="mt-4 text-balance text-3xl font-bold tracking-[-0.035em] text-foreground sm:text-4xl lg:text-[3.25rem]">
              就活を、ひとつに。
            </h2>

            <p className="mx-auto mt-5 max-w-md text-balance text-lg leading-relaxed text-muted-foreground sm:text-xl">
              今すぐ無料で始めましょう。
            </p>

            <div className="mt-10 flex justify-center">
              <LandingPrimaryAction
                size="lg"
                className="h-14 px-10 text-lg landing-cta-btn"
                guestLabel="続ける"
                unauthenticatedLabel="無料で始める"
              />
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
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
