import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ClipboardPaste, ListChecks, LogIn } from "lucide-react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { StickyCTABar } from "@/components/landing/StickyCTABar";
import { SeoLPHeroSection } from "@/components/landing/shared/SeoLPHeroSection";
import { LandingContentSection } from "@/components/landing/shared/LandingContentSection";
import { MidCTASection } from "@/components/landing/MidCTASection";
import { FAQSection } from "@/components/landing/FAQSection";
import { FinalCTASection } from "@/components/landing/FinalCTASection";
import { FaqJsonLd } from "@/components/seo/FaqJsonLd";
import { BreadcrumbJsonLd } from "@/components/seo/BreadcrumbJsonLd";
import { ES_COUNTER_PAGE_FAQS } from "@/lib/marketing/es-counter-faqs";
import { EsCounterClient } from "@/components/tools/EsCounterClient";
import { createMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = createMarketingMetadata({
  title: "ES文字数カウント | 就活Pass",
  description:
    "ESの文字数を300/400/500字で簡単にチェックできる無料ツール。空白・改行を除いたカウントにも対応。",
  path: "/tools/es-counter",
  keywords: ["ES 文字数 カウント", "ES 文字数チェッカー", "就活 無料ツール"],
});

export default function EsCounterPage() {
  return (
    <div
      className="font-['Inter','Noto_Sans_JP',sans-serif] bg-white text-slate-900 overflow-x-hidden"
      style={{ WebkitFontSmoothing: "antialiased" }}
    >
      <LandingHeader />

      <main>
        <BreadcrumbJsonLd
          crumbs={[
            { name: "ホーム", path: "/" },
            { name: "無料ツール", path: "/tools" },
            { name: "ES文字数カウント", path: "/tools/es-counter" },
          ]}
        />
        <FaqJsonLd faqs={ES_COUNTER_PAGE_FAQS} />

        <SeoLPHeroSection
          eyebrow="無料ツール · ES文字数カウント"
          title="ES文字数カウンター"
          description="空白・改行を除いた文字数でも数えられます。300/400/500字の目安付き。"
        />

        <LandingContentSection heading="使い方">
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              {(
                [
                  { step: "1", text: "ES本文を貼り付ける", Icon: ClipboardPaste },
                  { step: "2", text: "300 / 400 / 500字に合わせる", Icon: ListChecks },
                  { step: "3", text: "必要ならアプリへ", Icon: LogIn },
                ] as const
              ).map(({ step, text, Icon }) => (
                <div
                  key={step}
                  className="flex gap-3 rounded-xl border border-[var(--lp-border-default)] bg-white p-4 shadow-[var(--lp-shadow-card)]"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--lp-tint-navy-soft)]">
                    <Icon className="h-4 w-4 text-[var(--lp-navy)]" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p
                      className="text-xs text-slate-500"
                      style={{ fontWeight: 600 }}
                    >
                      STEP {step}
                    </p>
                    <p
                      className="mt-1 text-sm text-slate-700"
                      style={{ lineHeight: 1.7 }}
                    >
                      {text}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-[var(--lp-border-default)] bg-white p-4 shadow-[var(--lp-shadow-card)]">
              <EsCounterClient />
            </div>
          </div>
        </LandingContentSection>

        <LandingContentSection heading="関連リンク" bg="muted">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href="/templates/shiboudouki"
              className="group flex items-center justify-between rounded-xl border border-[var(--lp-border-default)] bg-white p-5 shadow-[var(--lp-shadow-card)] transition-all hover:shadow-md"
            >
              <div>
                <h3
                  className="text-[var(--lp-navy)]"
                  style={{ fontWeight: 700 }}
                >
                  志望動機テンプレ
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  結論から書く構成テンプレ
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-[var(--lp-navy)]" />
            </Link>

            <Link
              href="/es-tensaku-ai"
              className="group flex items-center justify-between rounded-xl border border-[var(--lp-border-default)] bg-white p-5 shadow-[var(--lp-shadow-card)] transition-all hover:shadow-md"
            >
              <div>
                <h3
                  className="text-[var(--lp-navy)]"
                  style={{ fontWeight: 700 }}
                >
                  ES添削AIの使い方
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  文字数の次はAI添削へ
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-[var(--lp-navy)]" />
            </Link>

            <Link
              href="/login"
              className="group flex items-center justify-between rounded-xl border border-[var(--lp-border-default)] bg-white p-5 shadow-[var(--lp-shadow-card)] transition-all hover:shadow-md"
            >
              <div>
                <h3
                  className="text-[var(--lp-navy)]"
                  style={{ fontWeight: 700 }}
                >
                  アプリで続ける
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  保存・添削・締切管理はログイン後
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-[var(--lp-navy)]" />
            </Link>
          </div>
        </LandingContentSection>

        <MidCTASection title="AI添削も、無料で試す" />

        <FAQSection faqs={ES_COUNTER_PAGE_FAQS} />

        <FinalCTASection
          title={
            <>
              ESの準備を、
              <br />
              今すぐ始めよう。
            </>
          }
        />
      </main>

      <LandingFooter />
      <StickyCTABar />
    </div>
  );
}
