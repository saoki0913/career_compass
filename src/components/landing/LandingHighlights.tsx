import Link from "next/link";
import { landingHighlights } from "./landing-highlights";
import { ScrollReveal } from "./ScrollReveal";

export function LandingHighlights() {
  return (
    <section
      id="highlights"
      aria-labelledby="highlights-heading"
      className="scroll-mt-24 bg-background py-16 lg:scroll-mt-28 lg:py-20"
    >
      <div className="mx-auto max-w-6xl px-4">
        <ScrollReveal>
          <h2
            id="highlights-heading"
            className="text-balance text-center text-3xl font-bold tracking-[-0.035em] text-foreground sm:text-4xl lg:text-[2.5rem]"
          >
            まずは、要点から。
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-balance text-center text-base leading-relaxed text-muted-foreground">
            続きのセクションで、それぞれくわしく紹介します。
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
            {landingHighlights.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.featureId}>
                  <Link
                    href={item.href}
                    className="landing-highlight-tile group flex min-h-[5.5rem] flex-col justify-between gap-3 rounded-2xl p-5 no-underline outline-none transition-[box-shadow] duration-200 motion-reduce:transition-none lg:min-h-[6.5rem]"
                  >
                    <span className="flex items-start gap-3">
                      <span
                        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary ring-1 ring-primary/10 transition-colors duration-200 group-hover:bg-primary/12"
                        aria-hidden
                      >
                        <Icon className="size-5" strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0 pt-0.5">
                        <span className="block text-base font-semibold leading-snug tracking-tight text-foreground">
                          {item.title}
                        </span>
                        <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                          {item.blurb}
                        </span>
                      </span>
                    </span>
                    <span className="text-xs font-medium text-primary/80 group-hover:text-primary">
                      くわしく見る
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </ScrollReveal>
      </div>
    </section>
  );
}
