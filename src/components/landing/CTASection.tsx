import { Check } from "lucide-react";
import { LandingPrimaryAction } from "./LandingPrimaryAction";
import { ScrollReveal } from "./ScrollReveal";
import Link from "next/link";

const trustPoints = [
  "Stripe決済で安心",
  "成功時のみクレジット消費",
  "Googleカレンダー連携",
] as const;

export function CTASection() {
  return (
    <section className="py-28 lg:py-36">
      <div className="mx-auto max-w-6xl px-4">
        <ScrollReveal>
          <div className="relative overflow-hidden rounded-[40px] bg-[linear-gradient(135deg,#2563EB_0%,#4F46E5_100%)] px-6 py-16 text-center shadow-[0_34px_100px_-48px_rgba(37,99,235,0.4)] sm:px-10 sm:py-20">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.1),transparent_50%),radial-gradient(circle_at_70%_80%,rgba(255,255,255,0.08),transparent_50%)]" />
            <div className="relative">
              <h2 className="text-balance text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl lg:text-5xl">
                就活、ひとりで抱え込まなくていい。
              </h2>

              <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-8 text-white/80 sm:text-xl">
                やることが多すぎて手が止まっても、AIと一緒に一つずつ片付けられます。
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <LandingPrimaryAction
                  size="lg"
                  className="h-14 bg-white px-10 text-lg font-semibold text-primary shadow-[0_20px_50px_-10px_rgba(0,0,0,0.2)] hover:bg-white/90"
                  guestLabel="続ける"
                  unauthenticatedLabel="無料で始める"
                />
                <Link
                  href="/pricing"
                  className="inline-flex h-14 items-center justify-center rounded-full border border-white/30 bg-white/20 px-8 text-base font-semibold text-white backdrop-blur transition-colors hover:bg-white/30"
                >
                  料金プランを見る
                </Link>
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
                {trustPoints.map((point) => (
                  <span
                    key={point}
                    className="inline-flex items-center gap-2 text-sm text-white/60"
                  >
                    <Check className="size-4" />
                    {point}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
