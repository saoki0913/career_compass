import { Building2, CalendarClock, FileText, MessageSquareQuote } from "lucide-react";
import { landingMedia } from "./landing-media";
import { ScreenPreview } from "./ScreenPreview";
import { ScrollReveal } from "./ScrollReveal";

const valueStrip = [
  {
    title: "AI添削",
    description: "設問の切り口に合わせて、直しどころと書き換え案が分かる。",
    Icon: FileText,
  },
  {
    title: "対話で整理",
    description: "志望動機やガクチカを、会話しながら前に進められる。",
    Icon: MessageSquareQuote,
  },
  {
    title: "企業・締切管理",
    description: "応募先、締切、次にやることを見失わずに続けられる。",
    Icon: CalendarClock,
  },
] as const;

const detailSections = [
  {
    id: "ai-writing",
    title: "書くことを、AIと同じ画面で前に進める。",
    description:
      "就活Pass は、添削だけ返して終わるツールではありません。ES を直す、志望動機の材料を整理する、途中までの状態から続きを書く。その流れを、一つの workspace で続けられます。",
    points: ["設問別の添削", "書き換え案を見ながら更新", "途中のメモからでも始められる"],
    image: landingMedia.esReview,
    imageClassName: "scale-[1.05] object-top translate-y-[-34px] sm:translate-y-[-52px]",
  },
  {
    id: "management",
    title: "就活全体を、これ一つで見渡せる状態にする。",
    description:
      "企業一覧、締切、応募状況、Google カレンダー連携までを同じ流れにまとめます。ES 添削だけで終わらず、応募までの進行を止めないことを前提にした product です。",
    points: ["企業ごとの状況整理", "締切の見落とし防止", "次にやることが見える dashboard"],
    image: landingMedia.companies,
    imageClassName: "scale-[1.04] object-top translate-y-[-20px] sm:translate-y-[-34px]",
  },
] as const;

export function ProductShowcase() {
  return (
    <section id="features" className="scroll-mt-24 py-32 lg:scroll-mt-28 lg:py-40">
      <div className="mx-auto max-w-6xl px-4">
        <ScrollReveal>
          <div className="mb-14 grid gap-8 border-y border-slate-200/80 py-6 lg:grid-cols-[0.84fr_1.16fr] lg:items-end lg:gap-12">
            <div>
              <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-4xl lg:text-5xl">
                書くことも、管理することも、
                同じ流れで進める。
              </h2>
            </div>
            <p className="max-w-3xl text-pretty text-lg leading-8 text-slate-600">
              AI の出力だけを見るのではなく、そのまま就活の進行に戻れることを重視しています。
              書き直し、素材整理、企業管理、締切確認を、ばらばらのツールに分けずに扱えます。
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.08}>
          <ul className="mb-20 grid gap-8 border-b border-slate-200/80 pb-10 md:grid-cols-3 lg:mb-24">
            {valueStrip.map(({ title, description, Icon }) => (
              <li key={title} className="grid gap-3">
                <div className="flex items-center gap-3 text-slate-950">
                  <span className="flex size-10 items-center justify-center rounded-full border border-slate-200 bg-white shadow-[0_10px_24px_-18px_rgba(15,23,42,0.28)]">
                    <Icon className="size-[18px]" />
                  </span>
                  <p className="text-base font-semibold tracking-[-0.03em]">{title}</p>
                </div>
                <p className="max-w-sm text-sm leading-7 text-slate-600">{description}</p>
              </li>
            ))}
          </ul>
        </ScrollReveal>

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
                    <ScreenPreview
                      src={feature.image.src}
                      alt={feature.image.alt}
                      imageClassName={feature.imageClassName}
                      className="rounded-[32px] border border-white/70 bg-white/95"
                    />

                    <div className="max-w-xl">
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
