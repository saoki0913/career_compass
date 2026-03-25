"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { LANDING_PAGE_FAQS } from "@/lib/marketing/landing-faqs";
import { ScrollReveal } from "./ScrollReveal";

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
    <div className="border-b border-slate-200/80 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full cursor-pointer py-6 text-left transition-colors hover:text-slate-950"
        aria-expanded={isOpen}
      >
        <div className="flex items-center justify-between gap-4">
          <span className="text-base font-semibold tracking-[-0.02em] text-slate-950">
            {question}
          </span>
          <ChevronDown
            className={cn(
              "h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200",
              isOpen && "rotate-180"
            )}
          />
        </div>
      </button>
      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          isOpen ? "max-h-96 pb-6" : "max-h-0"
        )}
      >
        <p className="max-w-2xl text-sm leading-7 text-slate-600">{answer}</p>
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
    <section id="faq" className="scroll-mt-24 py-32 lg:scroll-mt-28 lg:py-40">
      <div className="mx-auto max-w-4xl px-4">
        <ScrollReveal>
          <div className="mb-12 border-b border-slate-200/80 pb-10 text-center">
            <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">
              FAQ
            </p>
            <h2 className="mt-4 text-balance text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-4xl lg:text-5xl">
              よくある質問
            </h2>
            <p className="mt-5 text-balance text-lg leading-8 text-slate-600">
              無料開始、クレジット制、データの扱いで不明な点は
              <Link
                href="/contact"
                className="ml-1 font-medium text-primary hover:underline"
              >
                お問い合わせ
              </Link>
              からご連絡ください。
            </p>
          </div>

          <div className="rounded-[32px] border border-slate-200/80 bg-white/92 px-6 py-2 shadow-[0_26px_80px_-66px_rgba(15,23,42,0.2)] sm:px-8">
            {LANDING_PAGE_FAQS.map((faq, index) => (
              <FAQItem
                key={faq.question}
                question={faq.question}
                answer={faq.answer}
                isOpen={openIndex === index}
                onToggle={() => handleToggle(index)}
              />
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
