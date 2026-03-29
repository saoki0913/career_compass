import { landingMedia } from "./landing-media";
import { ScreenPreview } from "./ScreenPreview";
import { ScrollReveal } from "./ScrollReveal";

const steps = [
  {
    number: "01",
    title: "アカウント作成",
    description: "Googleアカウントで30秒で登録。無料プランからすぐに始められます。",
    image: landingMedia.heroDashboard,
    label: "Start",
  },
  {
    number: "02",
    title: "企業を登録",
    description:
      "志望企業を登録して、ES添削、企業情報、締切管理をスタート。",
    image: landingMedia.companies,
    label: "Track",
  },
  {
    number: "03",
    title: "AIと一緒に進める",
    description:
      "ES添削、志望動機の深掘り、ガクチカ整理をAIがサポート。",
    image: landingMedia.esReview,
    label: "Review",
  },
] as const;

export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-24 border-t border-slate-200/80 bg-white/70 py-24 lg:scroll-mt-28 lg:py-32"
    >
      <div className="mx-auto max-w-6xl px-4">
        <ScrollReveal>
          <div className="mx-auto mb-14 max-w-3xl text-center">
            <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">
              How it works
            </p>
            <h2 className="mt-4 text-balance text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-4xl lg:text-5xl">
              3ステップで、すぐに始められます。
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-8 text-slate-600">
              アカウント作成から実際の添削開始まで、最短30秒で就活管理をスタートできます。
            </p>
          </div>
        </ScrollReveal>

        <div className="relative mx-auto max-w-5xl">
          <div className="pointer-events-none absolute bottom-12 left-[38px] top-12 hidden w-px bg-[linear-gradient(180deg,rgba(96,165,250,0.55),rgba(191,219,254,0.15))] lg:block" />
          {steps.map((step, index) => (
            <ScrollReveal key={step.number} delay={index * 0.08}>
              <div className="relative grid gap-5 py-4 lg:grid-cols-[84px_1fr_280px] lg:items-center lg:gap-8">
                <div className="relative z-10 flex size-16 items-center justify-center rounded-[22px] border border-white/80 bg-[linear-gradient(180deg,#5ba8ff_0%,#2f6cff_100%)] text-2xl font-semibold tracking-tight text-white shadow-[0_24px_60px_-24px_rgba(37,99,235,0.8)] lg:size-[76px]">
                  {step.number}
                </div>
                <div className="rounded-[28px] border border-slate-200/80 bg-white/90 px-6 py-6 shadow-[0_24px_80px_-62px_rgba(15,23,42,0.4)]">
                  <h3 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-[15px]">
                    {step.description}
                  </p>
                </div>
                <div className="rounded-[24px] border border-slate-200/80 bg-white/86 p-2 shadow-[0_24px_80px_-62px_rgba(59,130,246,0.34)]">
                  <ScreenPreview
                    src={step.image.src}
                    alt={step.image.alt}
                    label={step.label}
                    className="rounded-[20px] border-0 bg-white"
                    imageClassName="object-top"
                  />
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
