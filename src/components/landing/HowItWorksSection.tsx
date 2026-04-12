import { UserPlus, FileText, Rocket } from "lucide-react";
import { LandingSectionMotion } from "./LandingSectionMotion";

const steps = [
  {
    step: "1",
    title: "30秒で無料登録",
    description: "Googleアカウントで簡単ログイン。クレジットカード不要ですぐに始められます。",
    icon: UserPlus,
  },
  {
    step: "2",
    title: "ESや志望動機を入力",
    description: "下書きやメモを貼り付けるだけ。AIが改善案を即座に提示します。",
    icon: FileText,
  },
  {
    step: "3",
    title: "就活を効率的に進める",
    description: "添削、対話、スケジュール管理を繰り返して、選考を有利に進めましょう。",
    icon: Rocket,
  },
];

export function HowItWorksSection() {
  return (
    <section className="bg-white px-6 py-24 md:py-32" id="how-it-works">
      <div className="mx-auto max-w-[1100px]">
        <LandingSectionMotion className="mb-16 text-center md:mb-20">
          <h2
            className="text-3xl tracking-tight text-[var(--lp-navy)] md:text-[2.5rem]"
            style={{ fontWeight: 800, lineHeight: 1.3 }}
          >
            3ステップで始められます
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-slate-500" style={{ lineHeight: 1.7 }}>
            登録から利用開始まで、わずか30秒。迷う手順はありません。
          </p>
        </LandingSectionMotion>

        <div className="relative grid grid-cols-1 gap-0 md:grid-cols-3">
          {/* Desktop connector line */}
          <div className="absolute left-[16.66%] right-[16.66%] top-[38px] hidden h-px overflow-hidden md:block">
            <div className="h-full bg-gradient-to-r from-[var(--lp-navy)]/20 via-[var(--lp-navy)]/30 to-[var(--lp-navy)]/20" />
          </div>

          {steps.map((s, i) => (
            <LandingSectionMotion key={s.step}>
              <div className="relative flex flex-col items-center px-6 py-10 text-center md:py-0">
                {/* Mobile connector */}
                {i < steps.length - 1 && (
                  <div className="absolute bottom-0 left-1/2 h-5 w-px -translate-x-1/2 bg-slate-200 md:hidden" />
                )}

                <div className="relative mb-6">
                  <div className="flex h-[76px] w-[76px] items-center justify-center rounded-2xl bg-[var(--lp-navy)] shadow-lg shadow-[var(--lp-navy)]/15">
                    <s.icon className="h-7 w-7 text-white" strokeWidth={1.5} />
                  </div>
                  <div
                    className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-100 bg-white text-xs text-[var(--lp-navy)] shadow-sm"
                    style={{ fontWeight: 800 }}
                  >
                    {s.step}
                  </div>
                </div>

                <h3
                  className="mb-3 text-lg text-[var(--lp-navy)]"
                  style={{ fontWeight: 700 }}
                >
                  {s.title}
                </h3>
                <p className="mx-auto max-w-[260px] text-sm text-slate-500" style={{ lineHeight: 1.7 }}>
                  {s.description}
                </p>
              </div>
            </LandingSectionMotion>
          ))}
        </div>
      </div>
    </section>
  );
}
