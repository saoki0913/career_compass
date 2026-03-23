import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { landingMedia } from "./landing-media";
import { LandingPrimaryAction } from "./LandingPrimaryAction";
import { ScreenPreview } from "./ScreenPreview";
import { ScrollReveal } from "./ScrollReveal";

const trustPoints = [
  "成功時のみ消費",
  "クレジットカード不要",
  "Googleカレンダー連携",
] as const;

const supportingLines = [
  "ES添削も、志望動機の整理も、企業・締切管理も一つの流れで進められます。",
  "今やることが見える状態を、AIと一緒に作る就活アプリです。",
] as const;

export function HeroSection() {
  const heroMedia = landingMedia.heroDashboard;

  return (
    <section className="landing-hero-backdrop relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(63,114,255,0.16),transparent_34%),radial-gradient(circle_at_85%_20%,rgba(148,163,184,0.16),transparent_26%)]" />
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-28 sm:pb-24 lg:pt-36">
        <ScrollReveal>
          <div className="grid items-center gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:gap-7">
            <div className="text-left">
              <div className="max-w-lg">
                <h1 className="text-balance text-[3.1rem] font-semibold leading-[0.92] tracking-[-0.08em] text-slate-950 sm:text-[4.2rem] lg:text-[5.25rem]">
                  就活を、
                  <br />
                  AIと一緒に
                  <br />
                  迷わず進める。
                </h1>
              </div>

              <div className="mt-7 max-w-xl space-y-3 text-[17px] leading-8 text-slate-600 sm:text-[18px]">
                {supportingLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>

              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <LandingPrimaryAction size="lg" className="h-[52px] px-7 text-base" />
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="landing-cta-secondary h-[52px] min-w-[190px] rounded-full px-6"
                >
                  <a href="#pricing">
                    料金を見る
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
                {trustPoints.map((point) => (
                  <span key={point} className="inline-flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-slate-400/70" aria-hidden="true" />
                    {point}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative lg:-mr-12 lg:pl-2">
              <div className="absolute inset-x-2 top-10 h-[79%] rounded-[42px] bg-[linear-gradient(180deg,rgba(37,99,235,0.18),rgba(148,163,184,0.06))] blur-3xl" />
              <div className="relative">
                <ScreenPreview
                  src={heroMedia.src}
                  alt={heroMedia.alt}
                  priority
                  className="rounded-[34px] border border-white/70 bg-white/95"
                  imageClassName="scale-[1.11] object-top translate-y-[-58px] sm:translate-y-[-88px] lg:translate-y-[-114px]"
                />
                <div className="mt-5 grid gap-4 border-t border-slate-200/70 pt-5 sm:grid-cols-3">
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.2em] text-slate-500 uppercase">
                      Review
                    </p>
                    <p className="mt-2 text-sm font-semibold tracking-[-0.02em] text-slate-950">
                      設問別の添削
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.2em] text-slate-500 uppercase">
                      Organize
                    </p>
                    <p className="mt-2 text-sm font-semibold tracking-[-0.02em] text-slate-950">
                      会話で素材整理
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.2em] text-slate-500 uppercase">
                      Track
                    </p>
                    <p className="mt-2 text-sm font-semibold tracking-[-0.02em] text-slate-950">
                      締切を一覧管理
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
