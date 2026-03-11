"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

const faqs = [
  {
    question: "大学院1年生でも使えますか？",
    answer:
      "はい。就活Passは、大学3年生と大学院1年生の就活準備期を主な対象として設計しています。ESの下書き、志望動機づくり、ガクチカ整理、締切管理など、準備段階で止まりやすい作業を前に進めやすくします。",
  },
  {
    question: "無料プランでは何ができますか？",
    answer:
      "月30クレジットが付与され、AI添削、企業登録 5 社まで、ESエディタ、締切管理、Google カレンダー連携が利用できます。クレジットカード不要で始められます。",
  },
  {
    question: "他の就活サービスとの違いは何ですか？",
    answer:
      "就活Passは、ES添削だけでなく、志望動機作成、ガクチカ深掘り、締切管理までを1つのアプリでつなげて使える点が違いです。無料ツールの手軽さと、継続的に進めやすい管理体験を両立することを重視しています。",
  },
  {
    question: "企業研究の機能はありますか？",
    answer:
      "企業情報の整理や参照は可能です。ただし、専用の企業研究サービスのように情報を網羅的に読むための機能というより、志望動機作成やES添削の材料を集めて前に進める補助機能として設計しています。",
  },
  {
    question: "入力したデータは安全ですか？",
    answer:
      "Google OAuth によるログインと通信の暗号化に対応しています。AI 処理のため外部サービスへデータを送信する場合がありますが、学習には使用されません。詳しくはプライバシーポリシーをご確認ください。",
  },
  {
    question: "クレジットとは何ですか？",
    answer:
      "AI 機能や企業情報整理などの実行時に消費するポイントです。クレジットは成功時のみ消費され、毎月リセットされます。実行前に消費見積もりが表示されるため、使い方を把握しながら進められます。",
  },
] as const;

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
    <div className="landing-panel overflow-hidden rounded-xl">
      <button
        onClick={onToggle}
        className="w-full cursor-pointer px-6 py-5 text-left transition-colors hover:bg-secondary/35"
        aria-expanded={isOpen}
      >
        <div className="flex items-center justify-between gap-4">
          <span className="text-base font-medium text-foreground">{question}</span>
          <ChevronDown
            className={cn(
              "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-180"
            )}
          />
        </div>
      </button>
      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          isOpen ? "max-h-96" : "max-h-0"
        )}
      >
        <p className="px-6 pb-6 text-sm leading-7 text-muted-foreground">{answer}</p>
      </div>
    </div>
  );
}

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const handleToggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <span className="landing-kicker mb-5">FAQ</span>
          <h2 className="landing-serif text-4xl font-semibold sm:text-5xl">
            よくある質問
          </h2>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            ご不明な点は
            <Link href="/contact" className="ml-1 text-primary hover:underline">
              お問い合わせ
            </Link>
            からご連絡ください。
          </p>
        </div>

        <div className="mx-auto max-w-3xl space-y-3">
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
