import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "利用規約 | 就活Pass",
  description: "就活支援アプリ「就活Pass（Career Compass）」の利用規約です。",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
          利用規約
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          最終更新日: 2026-02-08
        </p>

        <div className="space-y-8 text-sm leading-7">
          <section className="p-4 rounded-lg border bg-muted/20">
            <p className="text-muted-foreground">
              これは公開に向けた雛形です。実際の公開前に、提供内容・法令・運用に合わせて修正し、必要に応じて専門家レビューを推奨します。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">1. 適用</h2>
            <p>
              本規約は、就活支援アプリ「就活Pass（Career Compass）」（以下「本サービス」）の利用条件を定めるものです。ユーザーは本規約に同意の上、本サービスを利用します。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">2. アカウント</h2>
            <p>
              本サービスはゲスト利用およびGoogleログインによる利用を提供します。ユーザーは、自己の責任でアカウントを管理し、不正利用が疑われる場合は速やかにご連絡ください。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">3. 禁止事項</h2>
            <p>ユーザーは以下の行為をしてはなりません。</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>法令または公序良俗に違反する行為</li>
              <li>本サービスの運営を妨害する行為（過度な負荷、不正アクセス等）</li>
              <li>第三者の権利侵害（著作権、プライバシー等）</li>
              <li>不正確な個人情報・申込情報の入力</li>
              <li>その他、運営者が不適切と判断する行為</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">4. AI機能に関する注意</h2>
            <p>
              本サービスのAI機能は、入力内容および外部情報に基づき提案や文章生成を行いますが、内容の正確性・完全性・適合性を保証するものではありません。最終的な提出内容・応募判断はユーザーご自身の責任で行ってください。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">5. 料金・決済</h2>
            <p>
              有料プランの購入、変更、解約、支払い失敗時の扱い等は、アプリ内の表示および決済事業者（Stripe）による手続に従います。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">6. 免責</h2>
            <p>
              運営者は、本サービスの提供にあたり合理的な範囲で安全性・信頼性の確保に努めますが、就職活動の結果、第三者との紛争、データ損失等について一切の保証を行いません（ただし、法令上免責できない場合を除きます）。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">7. 規約の変更</h2>
            <p>
              運営者は、必要に応じて本規約を変更できます。重要な変更がある場合は、アプリ内またはWeb上で告知します。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">8. お問い合わせ</h2>
            <p>
              本規約に関するお問い合わせは、
              <Link href="/contact" className="underline hover:text-foreground">
                お問い合わせページ
              </Link>
              よりご連絡ください。
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

