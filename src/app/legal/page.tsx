import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表記",
  description: "就活Passの特定商取引法に基づく表記です。",
};

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

        <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
          <table className="w-full border-collapse">
            <tbody className="divide-y divide-border">
              <tr>
                <th className="text-left py-4 pr-4 font-medium text-foreground w-1/3 align-top">
                  販売事業者
                </th>
                <td className="py-4">就活Pass運営事務局</td>
              </tr>
              <tr>
                <th className="text-left py-4 pr-4 font-medium text-foreground align-top">
                  運営責任者
                </th>
                <td className="py-4">
                  請求があった場合、遅滞なく開示いたします。
                </td>
              </tr>
              <tr>
                <th className="text-left py-4 pr-4 font-medium text-foreground align-top">
                  所在地
                </th>
                <td className="py-4">
                  請求があった場合、遅滞なく開示いたします。
                </td>
              </tr>
              <tr>
                <th className="text-left py-4 pr-4 font-medium text-foreground align-top">
                  電話番号
                </th>
                <td className="py-4">
                  請求があった場合、遅滞なく開示いたします。
                </td>
              </tr>
              <tr>
                <th className="text-left py-4 pr-4 font-medium text-foreground align-top">
                  メールアドレス
                </th>
                <td className="py-4">support@shupass.jp</td>
              </tr>
              <tr>
                <th className="text-left py-4 pr-4 font-medium text-foreground align-top">
                  販売URL
                </th>
                <td className="py-4">https://shupass.jp</td>
              </tr>
              <tr>
                <th className="text-left py-4 pr-4 font-medium text-foreground align-top">
                  販売価格
                </th>
                <td className="py-4">
                  各プランの価格は
                  <Link href="/pricing" className="text-primary hover:underline">
                    料金プランページ
                  </Link>
                  に記載のとおりです。
                </td>
              </tr>
              <tr>
                <th className="text-left py-4 pr-4 font-medium text-foreground align-top">
                  支払方法
                </th>
                <td className="py-4">クレジットカード決済（Stripe経由）</td>
              </tr>
              <tr>
                <th className="text-left py-4 pr-4 font-medium text-foreground align-top">
                  支払時期
                </th>
                <td className="py-4">
                  サブスクリプション登録時に即時決済。以降、毎月自動更新。
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
                  サブスクリプションはいつでも解約可能です。解約後は次回更新日まで引き続きご利用いただけます。デジタルサービスの性質上、返金は原則として行っておりません。
                </td>
              </tr>
              <tr>
                <th className="text-left py-4 pr-4 font-medium text-foreground align-top">
                  動作環境
                </th>
                <td className="py-4">
                  最新のChrome, Safari, Firefox, Edgeブラウザ。インターネット接続が必要です。
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
