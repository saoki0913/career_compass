import type { Metadata } from "next";
import Link from "next/link";
import { createMarketingMetadata } from "@/lib/marketing-metadata";
import {
  getLegalSalesUrl,
  getLegalSupportEmail,
  getLegalDisclosureRequestEmail,
  getLegalDisclosureNotice,
} from "@/lib/legal/commerce-disclosure";

const salesUrl = getLegalSalesUrl();
const supportEmail = getLegalSupportEmail();
const disclosureEmail = getLegalDisclosureRequestEmail();
const disclosureNotice = getLegalDisclosureNotice();

export const metadata: Metadata = createMarketingMetadata({
  title: "特定商取引法に基づく表記 | 就活Pass",
  description:
    "就活Passの特定商取引法に基づく表記です。料金、支払方法、解約、返金方針、問い合わせ先などを掲載しています。",
  path: "/legal",
  keywords: ["特定商取引法 就活Pass", "就活Pass 返金", "就活Pass 解約", "就活Pass 料金"],
});

const disclosureCell = (
  <td className="py-4">
    {disclosureNotice}
    <br />
    <a href={`mailto:${disclosureEmail}`} className="text-primary hover:underline">
      {disclosureEmail}
    </a>
  </td>
);

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center">
          <Link href="/" className="font-bold text-xl">
            就活Pass
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold mb-8">特定商取引法に基づく表記</h1>
        <p className="mb-8 text-sm leading-7 text-muted-foreground">
          就活Pass の料金、決済、解約、返金方針に関する公開情報です。プラン比較は
          <Link href="/pricing" className="text-primary hover:underline">
            料金プランページ
          </Link>
          、ご利用条件は
          <Link href="/terms" className="text-primary hover:underline ml-1">
            利用規約
          </Link>
          、データの取り扱いは
          <Link href="/privacy" className="text-primary hover:underline ml-1">
            プライバシーポリシー
          </Link>
          をご確認ください。個人事業者として、販売事業者、運営責任者、所在地、電話番号は請求があった場合に遅滞なく開示いたします。
        </p>

        <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
          <table className="w-full border-collapse">
            <tbody className="divide-y divide-border">
              <tr>
                <th className="text-left py-4 pr-4 font-medium text-foreground w-1/3 align-top">
                  販売事業者
                </th>
                {disclosureCell}
              </tr>
              <tr>
                <th className="text-left py-4 pr-4 font-medium text-foreground align-top">
                  運営責任者
                </th>
                {disclosureCell}
              </tr>
              <tr>
                <th className="text-left py-4 pr-4 font-medium text-foreground align-top">
                  所在地
                </th>
                {disclosureCell}
              </tr>
              <tr>
                <th className="text-left py-4 pr-4 font-medium text-foreground align-top">
                  電話番号
                </th>
                {disclosureCell}
              </tr>
              <tr>
                <th className="text-left py-4 pr-4 font-medium text-foreground align-top">
                  メールアドレス
                </th>
                <td className="py-4">
                  <a href={`mailto:${supportEmail}`} className="text-primary hover:underline">
                    {supportEmail}
                  </a>
                </td>
              </tr>
              <tr>
                <th className="text-left py-4 pr-4 font-medium text-foreground align-top">
                  販売URL
                </th>
                <td className="py-4">
                  <a
                    href={salesUrl}
                    className="text-primary hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {salesUrl}
                  </a>
                </td>
              </tr>
              <tr>
                <th className="text-left py-4 pr-4 font-medium text-foreground align-top">
                  サービスの内容
                </th>
                <td className="py-4">
                  就活支援 Web アプリケーション「就活Pass」の提供。ES（エントリーシート）AI
                  添削、志望動機作成支援、ガクチカ深掘り、企業管理、締切管理等の機能を含みます。
                </td>
              </tr>
              <tr>
                <th className="text-left py-4 pr-4 font-medium text-foreground align-top">
                  販売価格
                </th>
                <td className="py-4">
                  各プランの価格（税込）は
                  <Link href="/pricing" className="text-primary hover:underline">
                    料金プランページ
                  </Link>
                  に記載のとおりです。表示価格はすべて消費税込みの金額です。
                </td>
              </tr>
              <tr>
                <th className="text-left py-4 pr-4 font-medium text-foreground align-top">
                  販売価格以外の費用
                </th>
                <td className="py-4">
                  インターネット接続に必要な通信料・パケット代等はお客様のご負担となります。
                </td>
              </tr>
              <tr>
                <th className="text-left py-4 pr-4 font-medium text-foreground align-top">
                  支払方法
                </th>
                <td className="py-4">クレジットカード決済（Stripe 経由）</td>
              </tr>
              <tr>
                <th className="text-left py-4 pr-4 font-medium text-foreground align-top">
                  支払時期
                </th>
                <td className="py-4">
                  サブスクリプション登録時に即時決済。以降、月額プランは毎月、年額プランは毎年、自動更新されます。
                </td>
              </tr>
              <tr>
                <th className="text-left py-4 pr-4 font-medium text-foreground align-top">
                  商品の引渡し時期
                </th>
                <td className="py-4">
                  決済完了後、ただちにサービスをご利用いただけます。
                </td>
              </tr>
              <tr>
                <th className="text-left py-4 pr-4 font-medium text-foreground align-top">
                  返品・キャンセル
                </th>
                <td className="py-4">
                  サブスクリプションはいつでも解約可能です。アプリ内の設定画面またはStripe顧客ポータルからお手続きいただけます。解約後は次回更新日まで引き続きご利用いただけます。デジタルサービスの性質上、返金は原則として行っておりません。詳しくは
                  <Link href="/terms#billing" className="text-primary hover:underline">
                    利用規約「料金・決済」
                  </Link>
                  をご確認ください。
                </td>
              </tr>
              <tr>
                <th className="text-left py-4 pr-4 font-medium text-foreground align-top">
                  問い合わせ窓口
                </th>
                <td className="py-4">
                  <Link href="/contact" className="text-primary hover:underline">
                    お問い合わせページ
                  </Link>
                  {" "}または{" "}
                  <a href={`mailto:${supportEmail}`} className="text-primary hover:underline">
                    {supportEmail}
                  </a>
                </td>
              </tr>
              <tr>
                <th className="text-left py-4 pr-4 font-medium text-foreground align-top">
                  動作環境
                </th>
                <td className="py-4">
                  最新の Chrome, Safari, Firefox, Edge ブラウザ。インターネット接続が必要です。
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-12 pt-6 border-t text-sm text-muted-foreground">
          <Link href="/" className="text-primary hover:underline">
            トップページに戻る
          </Link>
        </div>
      </main>
    </div>
  );
}
