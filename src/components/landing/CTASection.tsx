import { LandingPrimaryAction } from "./LandingPrimaryAction";
import { ScrollReveal } from "./ScrollReveal";
import Link from "next/link";

const trustPoints = [
  "クレジットカード不要",
  "成功時のみ消費",
  "Googleカレンダー連携",
] as const;

export function CTASection() {
  return (
    <section className="py-28 lg:py-36">
      <div className="mx-auto max-w-6xl px-4">
        <ScrollReveal>
          <div className="mx-auto max-w-4xl rounded-[40px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(244,248,255,0.96),rgba(255,255,255,0.94))] px-6 py-12 text-center shadow-[0_34px_100px_-72px_rgba(15,23,42,0.24)] sm:px-10">
            <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">
              Start
            </p>
            <h2 className="mt-4 text-balance text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-4xl lg:text-5xl">
              就活を、
              迷わず続けられる状態へ。
            </h2>

            <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-8 text-slate-600 sm:text-xl">
              ES 添削、対話支援、企業管理、締切管理を一つにまとめて、次にやることが見える状態を作ります。
              まずは無料から始められます。
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <LandingPrimaryAction
                size="lg"
                className="h-14 px-10 text-lg"
                guestLabel="続ける"
                unauthenticatedLabel="無料で始める"
              />
              <Link
                href="/pricing"
                className="landing-cta-secondary inline-flex h-14 items-center justify-center rounded-full border px-8 text-base font-semibold"
              >
                料金を見る
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              {trustPoints.map((point) => (
                <span
                  key={point}
                  className="inline-flex items-center gap-2 text-sm text-slate-500"
                >
                  <span
                    className="h-1 w-1 rounded-full bg-slate-400/70"
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
