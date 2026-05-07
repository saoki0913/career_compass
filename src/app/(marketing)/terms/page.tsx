import type { Metadata } from "next";
import Link from "next/link";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { createMarketingMetadata } from "@/lib/marketing-metadata";
import { getLegalSupportEmail } from "@/lib/legal/commerce-disclosure";

const supportEmail = getLegalSupportEmail();

export const metadata: Metadata = createMarketingMetadata({
  title: "利用規約 | 就活Pass",
  description:
    "就活Passの利用規約です。アカウント、禁止事項、AI機能、料金・決済、免責、お問い合わせ先を掲載しています。",
  path: "/terms",
  keywords: ["就活Pass 利用規約", "就活AI 利用規約", "ES添削 AI 利用規約"],
});

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <LandingHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-12 flex-1">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
          利用規約
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          最終更新日: 2026-05-06
        </p>

        <div className="space-y-8 text-sm leading-7">
          <section>
            <h2 className="text-base font-semibold mb-2">1. 適用</h2>
            <p>
              本規約は、就活支援アプリ「就活Pass（シューパス・就活パス）」（以下「本サービス」）の利用条件を定めるものです。本サービスには、ES添削・就活AIによる文章支援、志望動機・ガクチカ関連機能、企業・締切の管理機能などが含まれます。ユーザーは本規約に同意の上、本サービスを利用します。
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
            <p className="mt-2">
              企業情報取得機能は公開ページのみを対象とし、詳細は
              <Link href="/data-source-policy" className="ml-1 underline hover:text-foreground">
                公開情報の取得ポリシー
              </Link>
              に従います。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">4-2. AI生成物の権利と責任</h2>
            <p>
              ユーザーが本サービスに入力したES本文、志望動機、ガクチカ、企業メモ、会話内容その他の原文に関する権利は、ユーザーまたは正当な権利者に留保されます。運営者は、本サービスの提供、品質維持、不正利用防止、問い合わせ対応に必要な範囲で、これらの入力情報を処理し、AIプロバイダその他の委託先に送信することができます。
            </p>
            <p className="mt-2">
              運営者は、本サービスを通じて生成されたAI出力について、運営者独自の権利を主張しません。ユーザーは、法令、本規約、第三者の権利および提出先の規則を確認したうえで、自己の責任においてAI出力を利用できます。
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>AI出力が著作物として保護されること、またはユーザーに独占的な権利が発生することは保証しません。</li>
              <li>同一または類似の入力により、他のユーザーや第三者に類似した出力が生成される可能性があります。</li>
              <li>AI出力が第三者の著作物、商標、営業秘密、プライバシーその他の権利を侵害しないことは保証しません。</li>
              <li>AI出力を応募書類、公開資料、提出物その他の用途に利用する前に、ユーザー自身で内容の確認、修正、出典確認を行ってください。</li>
              <li>当社が管理するAPI利用では、AIプロバイダの学習利用を抑制する設定または契約条件の範囲でユーザーデータを取り扱います。</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">4-3. AI機能の免責</h2>
            <p>
              AI出力には、事実誤認、古い情報、文脈に合わない提案、事実に基づかない生成が含まれる場合があります。本サービスは、就職活動の準備を補助する参考情報を提供するものであり、キャリアカウンセリング、法務相談、その他の専門的助言の代替ではありません。
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>AI機能の利用が、書類選考の通過、内定、その他の就職活動の結果を保証するものではありません。</li>
              <li>AI出力の独自性、第三者著作物との非類似性、提出先での評価を保証しません。</li>
              <li>企業情報や締切情報は最新でない場合があります。応募・提出前に、必ず企業公式サイトや募集要項で確認してください。</li>
              <li>AI機能は外部プロバイダや通信環境に依存するため、一時的に利用できない場合があります。</li>
              <li>最終的な応募判断、提出内容、提出時期、提出先とのやり取りはユーザー自身の責任で行ってください。</li>
            </ul>
          </section>

          <section>
            <h2 id="billing" className="text-base font-semibold mb-2">5. 料金・決済</h2>
            <p>
              有料プランの料金は
              <Link href="/pricing" className="mx-1 underline hover:text-foreground">
                料金プランページ
              </Link>
              に表示する税込価格のとおりです。決済は Stripe を通じて行われ、カード情報は当社サーバーに保存されません。
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>有料プランは月額または年額の自動更新サブスクリプションです。</li>
              <li>初回は申込時に即時決済され、以後は各請求期間の更新日に自動で請求されます。</li>
              <li>解約はアプリ内の設定画面または Stripe 顧客ポータルからいつでも行えます。</li>
              <li>解約後も現在の請求期間の終了日までは有料機能を利用できます。</li>
              <li>デジタルサービスの性質上、法令上必要な場合を除き、支払済み料金の返金は行いません。</li>
              <li>二重課金、誤課金、または運営者の責めに帰すべき事由により本サービスの全部もしくは重要な一部を相当期間提供できなかった場合は、状況を確認したうえで、利用不能期間や影響範囲に応じた返金その他の適切な対応を検討します。</li>
              <li>軽過失による損害賠償責任を負う場合、その上限はユーザーが直近12か月に本サービスへ支払った金額とします。ただし、運営者の故意または重過失、その他法令上制限できない責任には適用しません。</li>
            </ul>
            <p className="mt-2">
              詳細は
              <Link href="/legal" className="mx-1 underline hover:text-foreground">
                特定商取引法に基づく表記
              </Link>
              をご確認ください。
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
