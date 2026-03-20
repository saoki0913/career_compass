"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ScrollReveal } from "./ScrollReveal";

const faqs = [
  {
    question: "無料プランでは何ができますか？",
    answer:
      "月30クレジットが付与され、AI添削、企業登録 5 社まで、ESエディタ、締切管理、Google カレンダー連携が利用できます。クレジットカード不要で始められます。",
  },
  {
    question: "他の就活サービスとの違いは何ですか？",
    answer:
      "就活Passは、設問タイプに合わせたAI添削に加え、志望動機・ガクチカの対話支援、企業・締切の整理とGoogleカレンダー連携までを1つのアプリでつなげて使える点が違いです。無料ツールの手軽さと、継続的に進めやすい管理体験を両立することを重視しています。",
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
  {
    question: "1クレジットでどのくらいの操作ができますか？",
    answer:
      "AI添削は1回あたり2〜5クレジット、ガクチカ深掘りは1メッセージあたり1クレジットが目安です。実行前に消費量が表示されるので、使いすぎる心配はありません。Freeプランの30クレジットでも、AI添削を6〜15回ほどお試しいただけます。",
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
    <div className="border-b border-border/30">
      <button
        onClick={onToggle}
        className="w-full cursor-pointer py-5 text-left transition-colors hover:text-foreground"
        aria-expanded={isOpen}
      >
        <div className="flex items-center justify-between gap-4">
          <span className="text-base font-medium text-foreground">
            {question}
          </span>
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
          isOpen ? "max-h-96 pb-5" : "max-h-0"
        )}
      >
        <p className="text-sm leading-7 text-muted-foreground">{answer}</p>
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
    <section id="faq" className="scroll-mt-24 py-28 lg:scroll-mt-28 lg:py-36">
      <div className="mx-auto max-w-3xl px-4">
        <ScrollReveal>
          <div className="landing-bento-card-static mb-10 px-6 py-10 sm:px-8">
            <div className="mb-8 text-center">
              <p className="text-sm font-semibold tracking-widest text-primary uppercase">
                サポート
              </p>
              <h2 className="mt-4 text-balance text-3xl font-bold tracking-[-0.035em] sm:text-4xl lg:text-[3.25rem]">
                よくある質問
              </h2>
              <p className="mt-5 text-balance text-lg leading-relaxed text-muted-foreground">
                ご不明な点は
                <Link
                  href="/contact"
                  className="ml-1 text-primary hover:underline"
                >
                  お問い合わせ
                </Link>
                からご連絡ください。
              </p>
            </div>

            <div>
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
        </ScrollReveal>
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
