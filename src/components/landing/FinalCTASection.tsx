import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LandingSectionMotion } from "./LandingSectionMotion";

export function FinalCTASection() {
  return (
    <section className="relative overflow-hidden bg-[var(--lp-navy)] px-6 py-24 md:py-32">
      <div className="absolute left-1/2 top-0 -z-0 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-white/10 blur-[100px]" />

      <div className="relative z-10 mx-auto max-w-[700px] text-center">
        <LandingSectionMotion>
          <h2
            className="mb-6 text-3xl tracking-tight text-white md:text-[2.75rem]"
            style={{ fontWeight: 800, lineHeight: 1.2 }}
          >
            さあ、就活を
            <br />
            スムーズに進めよう。
          </h2>
          <p
            className="mx-auto mb-10 max-w-md text-lg text-[var(--lp-on-dark-muted)]"
            style={{ lineHeight: 1.7 }}
          >
            今なら会員登録で、ES対策チェックリストをプレゼント中。
          </p>
          <Link
            href="/login"
            className="group inline-flex items-center gap-2 rounded-xl bg-white px-10 py-4 text-base text-[var(--lp-navy)] shadow-lg shadow-black/20 transition-all hover:shadow-xl active:scale-[0.98]"
            style={{ fontWeight: 700 }}
          >
            無料で今すぐ始める
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <p className="mt-6 text-sm text-[var(--lp-on-dark-fine)]" style={{ fontWeight: 400 }}>
            クレジットカード登録不要 ・ いつでも解約可能
          </p>
        </LandingSectionMotion>
      </div>
    </section>
  );
}
