import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LandingSectionMotion } from "./LandingSectionMotion";

export function MidCTASection() {
  return (
    <section className="bg-[var(--lp-tint-navy-soft)] px-6 py-16 md:py-20">
      <LandingSectionMotion className="mx-auto max-w-[600px] text-center">
        <h2
          className="text-2xl tracking-tight text-[var(--lp-navy)] md:text-[2rem]"
          style={{ fontWeight: 800, lineHeight: 1.3 }}
        >
          まずは無料で、ES添削AIを試す
        </h2>
        <p
          className="mx-auto mt-4 mb-8 max-w-md text-base text-slate-500"
          style={{ lineHeight: 1.8 }}
        >
          カード登録不要。ES を貼り付けるだけで始められます。
        </p>
        <Link
          href="/login"
          className="group inline-flex items-center gap-2 rounded-xl bg-[var(--lp-cta)] px-7 py-3.5 text-sm text-white shadow-lg shadow-blue-900/10 transition-all hover:shadow-xl hover:shadow-blue-900/15 active:scale-[0.98]"
          style={{ fontWeight: 600 }}
        >
          無料で試す
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </LandingSectionMotion>
    </section>
  );
}
