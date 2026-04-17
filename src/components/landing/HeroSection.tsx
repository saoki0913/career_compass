import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { landingMedia } from "./landing-media";
import { LandingSectionMotion } from "./LandingSectionMotion";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden px-6 pb-16 pt-24 md:pb-24 md:pt-32 lg:pb-28 lg:pt-36">
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-br"
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
                  ES添削から企業別AI模擬面接まで、就活AIで一括サポート
                </span>
              </div>

              <h1
                className="text-[2.5rem] tracking-tight text-[var(--lp-navy)] md:text-[3.25rem] lg:text-[3.5rem]"
                style={{ fontWeight: 800, lineHeight: 1.15 }}
              >
                就活を、AIと一緒に
                <br />
                迷わず進める。
              </h1>

              <p
                className="mt-6 mb-10 max-w-lg text-base text-slate-500 md:text-lg"
                style={{ lineHeight: 1.8 }}
              >
                志望動機・自己PR・ガクチカから、企業別の AI 模擬面接まで。会社に合わせた添削と対話を、カード登録なしで。
              </p>

              <div className="mb-8 flex flex-wrap gap-3">
                <Link
                  href="/login"
                  className="group inline-flex items-center gap-2 rounded-xl bg-[var(--lp-cta)] px-7 py-3.5 text-sm text-white shadow-lg shadow-blue-900/10 transition-all hover:shadow-xl hover:shadow-blue-900/15 active:scale-[0.98]"
                  style={{ fontWeight: 600 }}
                >
                  無料で試す
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="#features"
                  className="rounded-xl border border-slate-200 px-7 py-3.5 text-sm text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50"
                  style={{ fontWeight: 500 }}
                >
                  機能を見る
                </Link>
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400">
                {["カード登録不要", "成功時のみクレジット消費", "面接対策までAI と一緒に"].map((t) => (
                  <span key={t} className="flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                      <circle cx="7" cy="7" r="6" stroke="#22c55e" strokeWidth="1.5" />
                      <path d="M4.5 7l1.5 1.5 3-3" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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
              <div className="overflow-hidden rounded-2xl border border-slate-200/50 bg-white shadow-[0_20px_80px_rgba(10,15,92,0.08)]">
                <Image
                  src={landingMedia.heroDashboard.src}
                  alt={landingMedia.heroDashboard.alt}
                  width={1200}
                  height={750}
                  priority
                  className="block w-full"
                />
              </div>
            </div>
          </LandingSectionMotion>
        </div>
      </div>
    </section>
  );
}
