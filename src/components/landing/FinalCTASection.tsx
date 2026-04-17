import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LandingSectionMotion } from "./LandingSectionMotion";

type FinalCTASectionProps = {
  title?: ReactNode;
  description?: string;
  primaryCta?: { label: string; href: string };
  finePrint?: string;
};

const DEFAULT_TITLE = (
  <>
    さあ、就活を
    <br />
    スムーズに進めよう。
  </>
);

export function FinalCTASection({
  title = DEFAULT_TITLE,
  description = "ESを貼り付けるだけで、AIが改善案を提示します。",
  primaryCta = { label: "無料で試す", href: "/login" },
  finePrint = "クレジットカード登録不要 ・ いつでも解約可能",
}: FinalCTASectionProps = {}) {
  return (
    <section className="relative overflow-hidden bg-[var(--lp-navy)] px-6 py-24 md:py-32">
      <div className="absolute left-1/2 top-0 -z-0 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-white/10 blur-[100px]" />

      <div className="relative z-10 mx-auto max-w-[700px] text-center">
        <LandingSectionMotion>
          <h2
            className="mb-6 text-3xl tracking-tight text-white md:text-[2.75rem]"
            style={{ fontWeight: 800, lineHeight: 1.2 }}
          >
            {title}
          </h2>
          <p
            className="mx-auto mb-10 max-w-md text-lg text-[var(--lp-on-dark-muted)]"
            style={{ lineHeight: 1.7 }}
          >
            {description}
          </p>
          <Link
            href={primaryCta.href}
            className="group inline-flex items-center gap-2 rounded-xl bg-white px-10 py-4 text-base text-[var(--lp-navy)] shadow-lg shadow-black/20 transition-all hover:shadow-xl active:scale-[0.98]"
            style={{ fontWeight: 700 }}
          >
            {primaryCta.label}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <p className="mt-6 text-sm text-[var(--lp-on-dark-fine)]" style={{ fontWeight: 400 }}>
            {finePrint}
          </p>
        </LandingSectionMotion>
      </div>
    </section>
  );
}
