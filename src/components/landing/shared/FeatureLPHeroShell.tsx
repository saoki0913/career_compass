"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LandingSectionMotion } from "../LandingSectionMotion";

type FeatureLPHeroShellProps = {
  eyebrow: string;
  title: ReactNode;
  description: string;
  checks: readonly string[];
  primaryCta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  mockUI: ReactNode;
};

export function FeatureLPHeroShell({
  eyebrow,
  title,
  description,
  checks,
  primaryCta = { label: "無料で試す", href: "/login" },
  secondaryCta = { label: "料金プランを見る", href: "/pricing" },
  mockUI,
}: FeatureLPHeroShellProps) {
  return (
    <section className="relative overflow-hidden px-6 pb-16 pt-24 md:pb-24 md:pt-32 lg:pb-28 lg:pt-36">
      <div
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "linear-gradient(to bottom right, var(--lp-hero-gradient-top), var(--lp-hero-gradient-mid), var(--lp-tint-navy-soft))",
        }}
      />

      <div className="mx-auto max-w-[1300px]">
        <div className="flex flex-col items-center gap-12 lg:flex-row lg:gap-16">
          <div className="shrink-0 lg:w-[48%]">
            <LandingSectionMotion instant>
              <div className="mb-7">
                <span className="inline-flex items-center gap-2 text-sm text-slate-600">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--lp-navy)]" />
                  {eyebrow}
                </span>
              </div>

              <h1
                className="text-[2.5rem] tracking-tight text-[var(--lp-navy)] md:text-[3.25rem] lg:text-[3.5rem]"
                style={{ fontWeight: 800, lineHeight: 1.15 }}
              >
                {title}
              </h1>

              <p
                className="mt-6 mb-10 max-w-lg text-base text-slate-500 md:text-lg"
                style={{ lineHeight: 1.8 }}
              >
                {description}
              </p>

              <div className="mb-8 flex flex-wrap gap-3">
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

              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400">
                {checks.map((t) => (
                  <span key={t} className="flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                      <circle cx="7" cy="7" r="6" stroke="#22c55e" strokeWidth="1.5" />
                      <path
                        d="M4.5 7l1.5 1.5 3-3"
                        stroke="#22c55e"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {t}
                  </span>
                ))}
              </div>
            </LandingSectionMotion>
          </div>

          <LandingSectionMotion className="w-full lg:w-[52%]">
            <div className="relative">
              <div
                className="absolute -inset-6 -z-10 rounded-3xl blur-2xl"
                style={{
                  backgroundImage:
                    "linear-gradient(to bottom right, color-mix(in srgb, var(--lp-tint-navy-soft) 85%, white), rgba(255,255,255,0.75), transparent)",
                }}
              />
              {mockUI}
            </div>
          </LandingSectionMotion>
        </div>
      </div>
    </section>
  );
}
