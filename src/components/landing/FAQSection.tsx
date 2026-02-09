"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

const faqs = [
  {
    question: "無料プランでは何ができますか？",
    answer:
      "月30クレジットが付与され、AI添削（1回2〜5クレジット）、企業登録5社まで、締切管理・通知、Googleカレンダー連携が利用できます。クレジットカード不要でご利用いただけます。",
  },
  {
    question: "他の就活サービスとの違いは何ですか？",
    answer:
      "ウカルンはES添削・締切管理・企業研究の3つをひとつのアプリに統合しています。就活塾（月3〜10万円）と比べて圧倒的に安価で、無料ツールにはない統合的なサポートが特徴です。",
  },
  {
    question: "解約はいつでもできますか？",
    answer:
      "はい、いつでも解約可能です。解約後は次回更新日まで引き続きご利用いただけます。解約手続きはアプリ内から簡単に行えます。",
  },
  {
    question: "入力したデータは安全ですか？",
    answer:
      "はい。Google OAuth認証による安全なログイン、通信の暗号化を行っています。ES添削ではAI処理のために外部サービスへデータを送信しますが、学習には使用されません。詳細はプライバシーポリシーをご確認ください。",
  },
  {
    question: "どんな企業に対応していますか？",
    answer:
      "日本国内の企業であれば、業界・規模を問わず対応可能です。企業の採用ページから情報を自動取得し、RAG検索で企業理解を深めることができます。",
  },
  {
    question: "クレジットとは何ですか？",
    answer:
      "AI添削や企業情報取得などの機能を利用する際に消費するポイントです。クレジットは成功時のみ消費され、毎月リセットされます（繰り越しはありません）。実行前に消費クレジット数の見積もりが表示されます。",
  },
];

function FAQItem({
  question,
  answer,
  isOpen,
  onToggle,
}: {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border border-border/50 rounded-xl overflow-hidden bg-card">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left hover:bg-secondary/30 transition-colors cursor-pointer"
        aria-expanded={isOpen}
      >
        <span className="text-base font-medium text-foreground">
          {question}
        </span>
        <ChevronDown
          className={cn(
            "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>
      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          isOpen ? "max-h-96" : "max-h-0"
        )}
      >
        <p className="px-6 pb-5 text-sm text-muted-foreground leading-relaxed">
          {answer}
        </p>
      </div>
    </div>
  );
}

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const handleToggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="py-24">
      <div className="container mx-auto px-4">
        {/* Section header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            よくある
            <span className="text-gradient">質問</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            ご不明な点はお気軽に
            <Link
              href="/contact"
              className="text-primary hover:underline ml-1"
            >
              お問い合わせ
            </Link>
            ください。
          </p>
        </div>

        {/* FAQ items */}
        <div className="max-w-3xl mx-auto space-y-3">
          {faqs.map((faq, index) => (
            <FAQItem
              key={faq.question}
              question={faq.question}
              answer={faq.answer}
              isOpen={openIndex === index}
              onToggle={() => handleToggle(index)}
            />
          ))}
        </div>
      </div>

      {/* FAQ Schema (JSON-LD) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((faq) => ({
              "@type": "Question",
              name: faq.question,
              acceptedAnswer: {
                "@type": "Answer",
                text: faq.answer,
              },
            })),
          }),
        }}
      />
    </section>
  );
}
