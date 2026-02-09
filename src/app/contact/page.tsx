import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/marketing/ContactForm";

export const metadata: Metadata = {
  title: "お問い合わせ | 就活Pass",
  description: "就活Pass（Career Compass）へのお問い合わせ窓口です。",
};

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
            お問い合わせ
          </h1>
          <p className="text-sm text-muted-foreground">
            不具合報告・改善要望・決済に関するご相談など、お気軽にご連絡ください。
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            送信内容は
            <Link href="/privacy" className="underline hover:text-foreground">
              プライバシーポリシー
            </Link>
            に従って取り扱います。
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <ContactForm />
          </div>
          <div className="lg:col-span-2">
            <div className="rounded-xl border bg-card p-6 space-y-3 text-sm">
              <h2 className="font-semibold">よくある内容</h2>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                <li>ログインできない / 画面が真っ白</li>
                <li>企業情報の取得に失敗する</li>
                <li>クレジット消費やプランについて</li>
              </ul>
              <div className="pt-2 border-t">
                <p className="text-muted-foreground">
                  可能であれば、発生日時・画面URL・操作手順を添えてください。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

