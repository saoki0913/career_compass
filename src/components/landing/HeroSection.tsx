import Image from "next/image";
import Link from "next/link";
import { landingMedia } from "./landing-media";
import { LandingSectionMotion } from "./LandingSectionMotion";

export function HeroSection() {
  return (
    <section
      className="overflow-hidden px-6 pb-20 pt-12 md:pb-28 md:pt-16"
      style={{
        background: `linear-gradient(180deg, var(--lp-hero-gradient-top) 0%, var(--lp-hero-gradient-mid) 45%, #ffffff 100%)`,
      }}
    >
      <div className="mx-auto max-w-7xl">
        <LandingSectionMotion instant className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="order-2 lg:order-1">
            <div
              className="mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-[var(--lp-navy)] md:text-sm"
              style={{
                fontWeight: 600,
                backgroundColor: "var(--lp-badge-bg)",
                border: "1px solid var(--lp-border-default)",
              }}
            >
              <span className="relative flex h-2 w-2">
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                  style={{ backgroundColor: "rgba(47, 111, 191, 0.45)" }}
                />
                <span
                  className="relative inline-flex h-2 w-2 rounded-full"
                  style={{ backgroundColor: "#2f6fbf" }}
                />
              </span>
              AI就活エージェント「就活Pass」
            </div>

            <h1
              className="mb-6 text-[2rem] leading-[1.15] tracking-tight text-[var(--lp-navy)] sm:text-5xl lg:text-[2.75rem] lg:leading-[1.12]"
              style={{ fontWeight: 600 }}
            >
              就活を、AIと一緒に
              <br />
              迷わず進める。
            </h1>

            <p
              className="mb-8 max-w-xl text-base leading-relaxed text-[var(--lp-body-muted)] md:text-lg"
              style={{ fontWeight: 400 }}
            >
              ES添削、志望動機、ガクチカ、面接対策、締切管理。バラバラだった準備をひとつのアプリにまとめ、AIと一緒に前に進めます。
            </p>

            <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-md bg-[var(--lp-cta)] px-7 py-3.5 text-base text-white transition hover:opacity-[0.94] active:scale-[0.99]"
                style={{
                  fontWeight: 600,
                  boxShadow: "0 4px 14px rgba(183, 19, 26, 0.35)",
                }}
              >
                今すぐ無料で体験する
              </Link>
              <Link
                href="#features"
                className="inline-flex items-center justify-center rounded-md border bg-white px-7 py-3.5 text-base text-[var(--lp-navy)] transition hover:bg-[var(--lp-surface-muted)]"
                style={{
                  fontWeight: 600,
                  borderColor: "var(--lp-border-default)",
                }}
              >
                機能を見る
              </Link>
            </div>

            <ul className="flex flex-col gap-3 text-sm text-[var(--lp-body-muted)] sm:flex-row sm:flex-wrap sm:gap-x-8 sm:gap-y-2">
              {[
                "クレジットカード不要",
                "成功時のみクレジット消費",
                "すぐにスタート",
              ].map((text) => (
                <li key={text} className="flex items-center gap-2">
                  <svg
                    className="h-4 w-4 shrink-0"
                    style={{ color: "var(--lp-success)" }}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span style={{ fontWeight: 500 }}>{text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative order-1 lg:order-2">
            <div
              className="pointer-events-none absolute -left-8 -top-8 -z-10 h-48 w-48 rounded-full opacity-40 blur-3xl"
              style={{ backgroundColor: "rgba(99, 102, 241, 0.15)" }}
            />
            <div
              className="pointer-events-none absolute -bottom-8 -right-8 -z-10 h-56 w-56 rounded-full opacity-40 blur-3xl"
              style={{ backgroundColor: "rgba(183, 19, 26, 0.12)" }}
            />
            <Image
              src={landingMedia.heroDashboard.src}
              alt={landingMedia.heroDashboard.alt}
              width={1200}
              height={750}
              priority
              className="w-full rounded-xl border bg-white"
              style={{
                borderColor: "var(--lp-border-default)",
                boxShadow: "var(--lp-shadow-screenshot)",
              }}
            />
          </div>
        </LandingSectionMotion>
      </div>
    </section>
  );
}
