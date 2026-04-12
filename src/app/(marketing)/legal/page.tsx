import type { Metadata } from "next";
import Link from "next/link";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { createMarketingMetadata } from "@/lib/marketing-metadata";
import { getMarketingPricingPlans } from "@/lib/marketing/pricing-plans";

// ---------------------------------------------------------------------------
// 特商法ページの値は環境変数ではなく直接記載する方針。
// 根拠: docs/release/INDIVIDUAL_BUSINESS_COMPLIANCE.md §5-1
// ---------------------------------------------------------------------------

const SALES_URL = "https://www.shupass.jp";
const SUPPORT_EMAIL = "support@shupass.jp";
const SUPPORT_URL = "/contact";
const REFUND_POLICY_URL = "/terms#billing";

const BUSINESS_NAME = "Harbor Works";
const REPRESENTATIVE_NAME =
  "請求があった場合、遅滞なく開示いたします。開示をご希望の方は support@shupass.jp までご連絡ください。";
const BUSINESS_ADDRESS = "〒160-0023 東京都新宿区西新宿3丁目3番13号西新宿水間ビル2F";
const PHONE_NUMBER =
  "請求があった場合、遅滞なく開示いたします。開示をご希望の方は support@shupass.jp までご連絡ください。";

const monthlyPlans = getMarketingPricingPlans("monthly");
const annualPlans = getMarketingPricingPlans("annual");
const standardMonthly = monthlyPlans.find((plan) => plan.id === "standard");
const standardAnnual = annualPlans.find((plan) => plan.id === "standard");
const proMonthly = monthlyPlans.find((plan) => plan.id === "pro");
const proAnnual = annualPlans.find((plan) => plan.id === "pro");

export const metadata: Metadata = createMarketingMetadata({
  title: "特定商取引法に基づく表記 | 就活Pass",
  description:
    "就活Passの特定商取引法に基づく表記です。料金、支払方法、解約、返金方針、問い合わせ先などを掲載しています。",
  path: "/legal",
  keywords: ["特定商取引法 就活Pass", "就活Pass 返金", "就活Pass 解約", "就活Pass 料金"],
});

type DisclosureRow = {
  label: string;
  value: React.ReactNode;
};

const disclosureRows: DisclosureRow[] = [
  {
    label: "販売事業者",
    value: BUSINESS_NAME,
  },
  {
    label: "運営責任者",
    value: <span className="whitespace-pre-wrap">{REPRESENTATIVE_NAME}</span>,
  },
  {
    label: "所在地",
    value: BUSINESS_ADDRESS,
  },
  {
    label: "電話番号",
    value: <span className="whitespace-pre-wrap">{PHONE_NUMBER}</span>,
  },
  {
    label: "メールアドレス",
    value: (
      <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
        {SUPPORT_EMAIL}
      </a>
    ),
  },
  {
    label: "販売URL",
    value: (
      <a
        href={SALES_URL}
        className="text-primary hover:underline"
        target="_blank"
        rel="noopener noreferrer"
      >
        {SALES_URL}
      </a>
    ),
  },
  {
    label: "サービスの内容",
    value:
      "就活支援 Web アプリケーション「就活Pass」の提供。ES 添削、志望動機作成支援、ガクチカ深掘り、企業管理、締切管理、通知、Google カレンダー連携などの機能を含みます。",
  },
  {
    label: "販売価格",
    value: (
      <>
        Free: ¥0
        <br />
        Standard: {standardMonthly?.price ?? "¥1,490"}/月、{standardAnnual?.price ?? "¥14,900"}/年
        <br />
        Pro: {proMonthly?.price ?? "¥2,980"}/月、{proAnnual?.price ?? "¥29,800"}/年
        <br />
        最新の税込価格とプラン差分は
        <Link href="/pricing" className="ml-1 text-primary hover:underline">
          料金プランページ
        </Link>
        をご確認ください。
      </>
    ),
  },
  {
    label: "販売価格以外の費用",
    value:
      "インターネット接続に必要な通信料・パケット代等はお客様のご負担となります。",
  },
  {
    label: "受け付け可能な決済方法",
    value: "クレジットカード決済（Stripe）",
  },
  {
    label: "支払時期",
    value:
      "サブスクリプション申込時に即時決済されます。以後、月額プランは毎月、年額プランは毎年、自動更新日に請求されます。",
  },
  {
    label: "サービス提供時期",
    value: "決済完了後、ただちにサービスをご利用いただけます。",
  },
  {
    label: "返品・キャンセル（お客様都合）",
    value: (
      <>
        サブスクリプションはいつでも解約できます。アプリ内の設定画面または Stripe
        顧客ポータルからお手続きください。解約後も次回更新日までは利用可能です。
        <br />
        デジタルサービスの性質上、法令上必要な場合を除き、支払済み料金の返金は行っていません。詳細は
        <a href={REFUND_POLICY_URL} className="ml-1 text-primary hover:underline">
          料金・返金ポリシー
        </a>
        をご確認ください。
      </>
    ),
  },
  {
    label: "返品・返金（不具合・提供不能時）",
    value: (
      <>
        本サービスに重大な不具合があり、当社が合理的期間内に復旧できず、購入済み機能を提供できなかった場合は、状況確認のうえ返金その他の適切な対応を行います。
        <br />
        不具合のご連絡は
        <a href={SUPPORT_URL} className="ml-1 text-primary hover:underline">
          お問い合わせページ
        </a>
        または
        <a href={`mailto:${SUPPORT_EMAIL}`} className="ml-1 text-primary hover:underline">
          {SUPPORT_EMAIL}
        </a>
        までお願いします。
      </>
    ),
  },
  {
    label: "問い合わせ窓口",
    value: (
      <>
        <a href={SUPPORT_URL} className="text-primary hover:underline">
          お問い合わせページ
        </a>
        {" "}または{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
          {SUPPORT_EMAIL}
        </a>
      </>
    ),
  },
  {
    label: "動作環境",
    value:
      "最新の Chrome、Safari、Firefox、Edge ブラウザ。インターネット接続が必要です。",
  },
];

export default function LegalPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <LandingHeader />

      <main className="mx-auto w-full max-w-3xl px-4 py-12 flex-1">
        <h1 className="mb-8 text-2xl font-bold">特定商取引法に基づく表記</h1>

        <div className="rounded-2xl border bg-card/70 p-5 text-sm leading-7 text-muted-foreground">
          <p>
            就活Pass の料金、決済、解約、返金方針に関する公開情報です。プラン比較は
            <Link href="/pricing" className="ml-1 text-primary hover:underline">
              料金プランページ
            </Link>
            、ご利用条件は
            <Link href="/terms" className="ml-1 text-primary hover:underline">
              利用規約
            </Link>
            、データの取り扱いは
            <Link href="/privacy" className="ml-1 text-primary hover:underline">
              プライバシーポリシー
            </Link>
            をご確認ください。
          </p>
        </div>

        <dl className="mt-8 divide-y divide-border rounded-2xl border bg-background px-5 text-sm leading-relaxed text-muted-foreground">
          {disclosureRows.map((row) => (
            <div
              key={row.label}
              className="grid gap-2 py-4 sm:grid-cols-[minmax(0,220px)_1fr] sm:gap-6"
            >
              <dt className="font-medium text-foreground">{row.label}</dt>
              <dd className="min-w-0">{row.value}</dd>
            </div>
          ))}
        </dl>

      </main>
      <LandingFooter />
    </div>
  );
}
