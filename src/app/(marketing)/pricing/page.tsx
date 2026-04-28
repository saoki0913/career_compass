import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FaqJsonLd } from "@/components/seo/FaqJsonLd";
import type { MarketingFaq } from "@/lib/marketing/landing-faqs";
import { createMarketingMetadata } from "@/lib/marketing-metadata";
import { cn } from "@/lib/utils";
import { PricingInteractive } from "./PricingInteractive";

export const metadata: Metadata = createMarketingMetadata({
  title: "就活AI・ES添削AI・AI模擬面接の料金プラン（月¥0から）| 就活Pass",
  description:
    "就活Pass の料金プラン。ES添削AI・志望動機AI・ガクチカAI・AI模擬面接を Free / Standard / Pro で比較。成功時のみクレジット消費、Stripe 決済、いつでも変更・解約可能。",
  path: "/pricing",
  keywords: [
    "就活Pass 料金",
    "就活AI 料金",
    "ES添削 AI 料金",
    "AI 模擬面接 料金",
    "就活アプリ 料金",
    "ES添削 サブスク",
  ],
});

const comparisonRows: {
  label: string;
  free: string | boolean;
  standard: string | boolean;
  pro: string | boolean;
}[] = [
  { label: "月次クレジット", free: "50", standard: "350", pro: "750" },
  { label: "企業登録", free: "5社まで", standard: "無制限", pro: "無制限" },
  { label: "ES添削スタイル", free: "3種", standard: "全8種", pro: "全8種" },
  { label: "面接対策", free: "開始2CR・回答/続き各1CR・講評6CR", standard: "開始2CR・回答/続き各1CR・講評6CR", pro: "開始2CR・回答/続き各1CR・講評6CR" },
  { label: "ガクチカ素材", free: "5件", standard: "15件", pro: "30件" },
  { label: "企業情報取得（日次無料枠）", free: "1回", standard: "5回", pro: "20回" },
  { label: "選考スケジュール（月次無料）", free: "10回", standard: "100回", pro: "200回" },
  { label: "企業RAG取込（月次無料枠・ページ）", free: "20", standard: "200", pro: "500" },
  { label: "1社あたりRAGソース数", free: "3", standard: "200", pro: "500" },
  { label: "セクション添削", free: false, standard: true, pro: true },
  {
    label: "ES添削モデル",
    free: "GPT-5.4 mini 固定（消費クレジットは有料のプレミアム帯と同じ目安）",
    standard: "選択可（Claude / GPT / Gemini 等）",
    pro: "選択可（Claude / GPT / Gemini 等）",
  },
];

const faqItems: readonly MarketingFaq[] = [
  {
    question: "クレジットとは何ですか？",
    answer:
      "AI実行や企業情報取得に使うポイントです。クレジットは成功時のみ消費され、毎月リセットされます。",
  },
  {
    question: "AI添削は何回できますか？",
    answer:
      "文章の長さとプラン・モデルで消費クレジットが変わります。Free は GPT-5.4 mini 固定で 6〜20 クレジット/回（有料で選べるプレミアムモデルと同じ目安）です。有料プランでは低コスト 3〜12、Claude / GPT / Gemini で 6〜20 が目安です。",
  },
  {
    question: "面接対策は何回できますか？",
    answer:
      "企業特化の模擬面接は、開始時に 2 クレジット、回答送信と講評後の続きは各 1 クレジット、最終講評は成功時に 6 クレジット消費します。モデルは計画 GPT-5.4、質問 Claude Haiku 4.5、講評 Claude Sonnet 4.6 です。月次無料枠はありません。",
  },
  {
    question: "解約はいつでもできますか？",
    answer:
      "はい。Stripeのサブスクリプションをいつでも解約できます。解約後も課金期間の終了まで有料機能をご利用いただけます。",
  },
  {
    question: "無料プランからの切り替えはデータを引き継げますか？",
    answer:
      "はい。プラン変更時にデータはそのまま引き継がれます。企業情報、ES、締切などすべてのデータが維持されます。",
  },
  {
    question: "使い切れなかったクレジットは翌月に繰り越せますか？",
    answer:
      "クレジットは毎月リセットされ、繰り越しはありません。ただし、成功時のみ消費されるため無駄になることはありません。",
  },
];

function ComparisonValue({
  value,
  emphasis = false,
}: {
  value: string | boolean;
  emphasis?: boolean;
}) {
  if (typeof value === "boolean") {
    return value ? (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
        <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      </span>
    ) : (
      <span className="text-sm font-medium text-slate-300">-</span>
    );
  }

  return (
    <span
      className={cn(
        "text-sm font-medium tracking-[-0.01em]",
        emphasis ? "text-slate-950" : "text-slate-600"
      )}
    >
      {value}
    </span>
  );
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,oklch(0.995_0.002_245),oklch(0.986_0.005_245))]">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-0 top-0 h-[520px] w-[520px] rounded-full bg-primary/[0.07] blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full bg-primary/20 blur-[110px]" />
      </div>

      <PricingInteractive>
        <section className="mt-10 border border-slate-200/80 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">プラン比較</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            下表は就活Pass の実装どおりの制限値です。上部カードの説明と数字が異なる場合は、表を優先してください。
          </p>
          <div className="mt-5 rounded-lg border border-slate-200/80 md:hidden">
            <div className="divide-y divide-slate-200">
              {comparisonRows.map((row) => (
                <div key={row.label} className="space-y-3 px-4 py-4">
                  <p className="text-sm font-semibold text-slate-900">{row.label}</p>
                  <div className="grid gap-2">
                    <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Free</p>
                      <div className="mt-2">
                        <ComparisonValue value={row.free} />
                      </div>
                    </div>
                    <div className="rounded-xl border border-primary/20 bg-primary/[0.06] px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Standard</p>
                      <div className="mt-2">
                        <ComparisonValue value={row.standard} emphasis />
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Pro</p>
                      <div className="mt-2">
                        <ComparisonValue value={row.pro} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-5 hidden overflow-x-auto rounded-lg border border-slate-200/80 md:block">
            <div className="min-w-[min(100%,520px)]">
              <div className="grid grid-cols-[minmax(8rem,1.5fr)_repeat(3,minmax(0,1fr))] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-600 sm:px-4 sm:text-sm">
                <span>項目</span>
                <span className="text-center">Free</span>
                <span className="text-center text-slate-950">Standard</span>
                <span className="text-center">Pro</span>
              </div>
              <div className="divide-y divide-slate-200">
                {comparisonRows.map((row) => (
                  <div
                    key={row.label}
                    className="grid grid-cols-[minmax(8rem,1.5fr)_repeat(3,minmax(0,1fr))] items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4 sm:py-3.5"
                  >
                    <div className="text-xs font-medium leading-snug text-slate-700 sm:text-sm sm:leading-6">
                      {row.label}
                    </div>
                    <div className="flex justify-center">
                      <ComparisonValue value={row.free} />
                    </div>
                    <div className="flex justify-center rounded-lg bg-primary/[0.06] px-2 py-1.5 sm:px-3 sm:py-2">
                      <ComparisonValue value={row.standard} emphasis />
                    </div>
                    <div className="flex justify-center">
                      <ComparisonValue value={row.pro} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(30,41,59,0.98))] p-6 text-white shadow-[0_34px_90px_-56px_rgba(15,23,42,0.72)] sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-slate-300 uppercase">
                Start small
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                迷ったら Free で始めて、必要になった時に切り替えてください。
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                Free は月50クレジット・企業5社まで・ES添削3種・ガクチカ5件・面接対策は開始2CR、回答/続き各1CR、最終講評6CR。Standard（¥1,490/月・350CR）は1クレジット約4円、Pro（¥2,980/月・750CR）は約4円の目安です。
              </p>
            </div>
            <Button
              size="lg"
              variant="outline"
              className="border-slate-600 bg-white/8 text-white hover:bg-white/12 hover:text-white"
              asChild
            >
              <Link href="/contact" className="inline-flex items-center gap-2">
                相談する
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
              </Link>
            </Button>
          </div>
        </section>

        <section id="faq" className="mt-8 rounded-[30px] border border-slate-200/80 bg-white/92 p-6 shadow-[0_30px_72px_-52px_rgba(15,23,42,0.3)] sm:p-8">
          <div className="mb-6">
            <p className="text-sm font-semibold text-slate-950">FAQ</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
              料金まわりで迷いやすい点を先にまとめています。
            </h2>
          </div>
          <div className="divide-y divide-slate-200/80 rounded-[24px] border border-slate-200/80 bg-slate-50/80">
            {faqItems.map((item) => (
              <details key={item.question} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-medium text-slate-900 [&::-webkit-details-marker]:hidden">
                  <span>{item.question}</span>
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="px-5 pb-5 text-sm leading-7 text-slate-600">{item.answer}</div>
              </details>
            ))}
          </div>
          <p className="mt-5 text-center text-sm text-slate-500">
            さらに確認したい場合は
            <Link href="/contact" className="mx-1 font-medium text-primary hover:underline">
              お問い合わせ
            </Link>
            から連絡できます。
          </p>
        </section>

        <FaqJsonLd faqs={faqItems} />
      </PricingInteractive>
    </div>
  );
}
