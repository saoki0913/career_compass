import type { Metadata } from "next";
import Link from "next/link";
import { createMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = createMarketingMetadata({
  title: "公開情報の取得ポリシー | 就活Pass",
  description:
    "就活Pass が企業情報・選考スケジュール取得で守る公開ページ限定ポリシーと要確認の扱いです。",
  path: "/data-source-policy",
  keywords: ["就活Pass 公開情報", "就活Pass スクレイピング ポリシー", "就活Pass 企業情報 取得方針"],
});

export default function DataSourcePolicyPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl">公開情報の取得ポリシー</h1>
        <p className="mb-8 text-sm text-muted-foreground">最終更新日: 2026-03-23</p>

        <div className="space-y-8 text-sm leading-7">
          <section>
            <h2 className="mb-2 text-base font-semibold">1. 取得対象</h2>
            <p>
              就活Pass の企業情報取得機能と選考スケジュール取得機能は、公開された Web ページのみを対象にします。
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>企業公式サイト、採用ページ、公開IR、公開募集要項などの一般公開ページ</li>
              <li>ログイン不要で閲覧できるページ</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">2. 取得しない情報</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>MyPage、応募者専用ページ、会員限定ページ、ログイン後ページ</li>
              <li>利用条件を確認できないページは、ユーザーに確認をお願いし、必要に応じて取得対象外にします</li>
              <li>個人名、メールアドレス、電話番号などの個人連絡先を主目的とした収集</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">3. 保存と表示の方針</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>保存は締切、募集区分、提出物、応募方法などの事実データを中心に行います。</li>
              <li>企業情報の検索や要約に使うのは、ユーザーが選択した公開ソースのみです。</li>
              <li>選考スケジュール取得では、検索用データベースは作らず、抽出した事実データの保存までを行います。</li>
              <li>第三者サイト本文の転載や、サイトの埋め込み表示は行いません。</li>
              <li>元サイトは外部リンクとして案内し、実際の内容確認はリンク先で行っていただきます。</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">4. 判定方法</h2>
            <p>
              取得前に、そのページが誰でも見られる公開ページか、サイト側で自動取得を制限していないか、利用条件に問題がないかを確認します。判断が難しい URL は、すぐに取得せず「要確認」として扱います。
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">5. 関連文書</h2>
            <p>
              個人情報の取り扱いは
              <Link href="/privacy" className="underline hover:text-foreground">
                プライバシーポリシー
              </Link>
              、サービス利用条件は
              <Link href="/terms" className="ml-1 underline hover:text-foreground">
                利用規約
              </Link>
              をご確認ください。
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
