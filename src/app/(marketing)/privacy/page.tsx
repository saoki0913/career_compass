import type { Metadata } from "next";
import Link from "next/link";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { createMarketingMetadata } from "@/lib/marketing-metadata";
import { getLegalSupportEmail } from "@/lib/legal/commerce-disclosure";

const supportEmail = getLegalSupportEmail();

export const metadata: Metadata = createMarketingMetadata({
  title: "プライバシーポリシー | 就活Pass",
  description:
    "就活Passのプライバシーポリシーです。取得する情報、利用目的、外部サービス、保管期間、お問い合わせ先を掲載しています。",
  path: "/privacy",
  keywords: ["就活Pass プライバシー", "就活AI 個人情報", "ES添削 AI データ利用"],
});

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <LandingHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-12 flex-1">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
          プライバシーポリシー
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          最終更新日: 2026-03-20
        </p>

        <div className="space-y-8 text-sm leading-7">
          <section>
            <h2 className="text-base font-semibold mb-2">1. 取得する情報</h2>
            <p>本サービスでは、以下の情報を取得する場合があります。</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>アカウント情報（メールアドレス、氏名、プロフィール画像等）</li>
              <li>入力データ（ES本文、ガクチカ本文、企業URL、メモ等）</li>
              <li>利用状況（操作ログ、機能の実行履歴、エラー情報等）</li>
              <li>端末情報（ブラウザ情報、IPアドレス、Cookie等）</li>
              <li>決済関連情報（決済はStripeにより処理され、当社がカード情報を保持しません）</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">2. 利用目的</h2>
            <p>取得した情報は、以下の目的で利用します。</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>本サービスの提供、運用、改善</li>
              <li>本人確認、認証、セキュリティ対策</li>
              <li>お問い合わせ対応、重要なお知らせの通知</li>
              <li>不正利用の防止、利用規約違反への対応</li>
              <li>分析・計測（設定した場合のみ）</li>
            </ul>
            <p className="mt-2">
              企業情報取得機能で扱う公開ページの範囲と保存方針は
              <Link href="/data-source-policy" className="ml-1 underline hover:text-foreground">
                公開情報の取得ポリシー
              </Link>
              をご確認ください。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">3. 第三者提供・委託</h2>
            <p>
              本サービスは、機能提供のために外部サービス（例: 認証、決済、AI、ホスティング等）を利用する場合があります。これらのサービス提供者に対し、必要な範囲で情報を取り扱わせることがあります。
            </p>
            <p className="mt-2">
              決済は Stripe、認証は Google OAuth、アプリ提供・分析・AI処理には当社が選定した外部サービスを利用する場合があります。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">4. 保管期間</h2>
            <p>
              取得した情報は、利用目的の達成に必要な期間保管します。ゲスト利用に関するデータは、一定期間経過後に削除される場合があります。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">5. ユーザーの権利</h2>
            <p>
              ユーザーは、アカウント削除等により、当社が保有する情報の削除を求めることができます（法令上保持が必要な場合を除きます）。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">6. お問い合わせ</h2>
            <p>
              本ポリシーに関するお問い合わせは、
              <Link href="/contact" className="underline hover:text-foreground">
                お問い合わせページ
              </Link>
              {" "}または{" "}
              <a href={`mailto:${supportEmail}`} className="underline hover:text-foreground">
                {supportEmail}
              </a>
              よりご連絡ください。
            </p>
          </section>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
