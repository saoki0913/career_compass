import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LandingSectionMotion } from "../LandingSectionMotion";

type SeoLPHeroSectionProps = {
  eyebrow: string;
  title: string;
  description: string;
  primaryCta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
};

export function SeoLPHeroSection({
  eyebrow,
  title,
  description,
  primaryCta = { label: "無料で試す", href: "/login" },
  secondaryCta,
}: SeoLPHeroSectionProps) {
  return (
    <section className="relative overflow-hidden px-6 pb-16 pt-24 md:pb-20 md:pt-32">
      <div
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "linear-gradient(to bottom right, var(--lp-hero-gradient-top), var(--lp-hero-gradient-mid), var(--lp-tint-navy-soft))",
        }}
      />

      <div className="mx-auto max-w-[800px] text-center">
        <LandingSectionMotion instant>
          <div className="mb-6">
            <span className="inline-flex items-center gap-2 text-sm text-slate-600">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--lp-navy)]" />
              {eyebrow}
            </span>
          </div>

          <h1
            className="text-3xl tracking-tight text-[var(--lp-navy)] md:text-[2.75rem]"
            style={{ fontWeight: 800, lineHeight: 1.2 }}
          >
            {title}
          </h1>

          <p
            className="mx-auto mt-6 mb-10 max-w-2xl text-base text-slate-500 md:text-lg"
            style={{ lineHeight: 1.8 }}
          >
            {description}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href={primaryCta.href}
              className="group inline-flex items-center gap-2 rounded-xl bg-[var(--lp-cta)] px-7 py-3.5 text-sm text-white shadow-lg shadow-blue-900/10 transition-all hover:shadow-xl hover:shadow-blue-900/15 active:scale-[0.98]"
              style={{ fontWeight: 600 }}
            >
              {primaryCta.label}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            {secondaryCta && (
              <Link
                href={secondaryCta.href}
                className="rounded-xl border border-slate-200 px-7 py-3.5 text-sm text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50"
                style={{ fontWeight: 500 }}
              >
                {secondaryCta.label}
              </Link>
            )}
          </div>
        </LandingSectionMotion>
      </div>
    </section>
  );
}
