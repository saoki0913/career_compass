import Link from "next/link";
import { LandingSectionMotion } from "./LandingSectionMotion";

export function FinalCTASection() {
  return (
    <section
      className="px-6 py-24 text-center text-white md:py-28"
      style={{
        backgroundColor: "var(--lp-navy)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      <div className="mx-auto max-w-3xl">
        <LandingSectionMotion>
          <h2
            className="mb-6 text-2xl tracking-tight md:text-4xl md:leading-tight"
            style={{ fontWeight: 600 }}
          >
            さあ、就活を
            <br className="sm:hidden" />
            スムーズに進めよう。
          </h2>
          <p
            className="mb-10 text-base md:text-lg"
            style={{ color: "var(--lp-on-dark-muted)" }}
          >
            今なら会員登録で、ES対策チェックリストをプレゼント中。
          </p>
          <Link
            href="/login"
            className="inline-flex min-h-[48px] items-center justify-center rounded-md bg-[var(--lp-cta)] px-10 py-3.5 text-base text-white transition hover:opacity-90"
            style={{
              fontWeight: 600,
              boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            }}
          >
            無料で今すぐ登録する
          </Link>
          <p
            className="mt-6 text-sm"
            style={{ color: "var(--lp-on-dark-fine)" }}
          >
            クレジットカード登録不要。いつでも解約可能です。
          </p>
        </LandingSectionMotion>
      </div>
    </section>
  );
}
