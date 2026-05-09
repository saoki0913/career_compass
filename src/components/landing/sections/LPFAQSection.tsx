"use client";

import { useState } from "react";
import { ChevronDown, MessageCircle, Plus } from "lucide-react";
import { lpSectionAsset } from "@/lib/marketing/lp-assets";
import { LpSparkleDecorations } from "@/components/landing/shared/LpSparkleDecorations";
import { LANDING_PAGE_FAQS } from "@/lib/marketing/landing-faqs";

function FAQItem({
  faq,
  index,
  isOpen,
  onToggle,
}: {
  faq: { question: string; answer: string };
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const panelId = `faq-panel-${index}`;
  const headingId = `faq-heading-${index}`;

  return (
    <article className="rounded-2xl border bg-white px-5 py-4" style={{ borderColor: "#d8eaff", boxShadow: "0 10px 24px rgba(20,50,110,0.12)" }}>
      <button id={headingId} type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={onToggle} className="flex w-full items-start gap-4 text-left">
        <span className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full text-white" style={{ background: "var(--lp-cta)" }}>
          {index === 2 || index === 3 ? <MessageCircle className="h-6 w-6" aria-hidden /> : <Plus className="h-7 w-7" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-3">
            <span className="flex-1 text-[18px] font-black leading-snug sm:text-[20px]" style={{ color: "var(--lp-navy)" }}>
              {index + 1}. {faq.question}
            </span>
            <ChevronDown className="mt-1 h-6 w-6 shrink-0 transition-transform duration-200" style={{ color: "var(--lp-cta)", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }} aria-hidden />
          </span>
        </span>
      </button>
      <div id={panelId} role="region" aria-labelledby={headingId} hidden={!isOpen} aria-hidden={!isOpen}>
        <p className="mt-3 text-[15px] font-medium leading-[1.75] sm:ml-[64px]" style={{ color: "var(--lp-muted-text)" }}>
          {faq.answer}
        </p>
      </div>
    </article>
  );
}

export function LPFAQSection() {
  const visibleFaqs = LANDING_PAGE_FAQS;
  const midpoint = Math.ceil(visibleFaqs.length / 2);
  const faqColumns = [visibleFaqs.slice(0, midpoint), visibleFaqs.slice(midpoint)] as const;
  const [openItems, setOpenItems] = useState<Set<number>>(() => new Set([0]));

  const toggleItem = (index: number) => {
    setOpenItems((previous) => {
      const next = new Set(previous);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const faqSparkles = [
    { x: 20, y: 6, size: 12, opacity: 0.3, color: "#78b5ff" },
    { x: 75, y: 10, size: 10, opacity: 0.35, color: "#b9d8ff", type: "dot" as const },
    { x: 6, y: 55, size: 14, opacity: 0.25, color: "#d3e5ff" },
    { x: 50, y: 80, size: 8, opacity: 0.3, color: "#78b5ff", type: "dot" as const },
  ] as const;

  return (
    <section
      id="faq"
      data-section="faq"
      className="relative scroll-mt-[92px] overflow-clip"
      style={{
        padding: "62px 0 54px",
        background: "var(--lp-surface-faq)",
        fontFamily:
          "'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        fontFeatureSettings: '"palt"',
      }}
    >
      <img src={lpSectionAsset("faq/01_dots_grid_large.png")} alt="" role="presentation" className="pointer-events-none absolute left-[-78px] top-12 hidden w-[210px] opacity-40 lg:block" />
      <img src={lpSectionAsset("faq/06_document_check.png")} alt="" role="presentation" className="pointer-events-none absolute right-[80px] top-[190px] hidden w-[110px] opacity-55 xl:block" />
      <img src={lpSectionAsset("faq/08_curve_simple.png")} alt="" role="presentation" className="pointer-events-none absolute right-0 top-0 hidden w-[560px] opacity-45 lg:block" />
      <LpSparkleDecorations sparkles={faqSparkles} />

      <div className="relative z-10 mx-auto max-w-[1430px] px-6 sm:px-10 lg:px-12 xl:px-14">
        <div className="mb-8 text-center">
          <h2 className="text-[32px] font-black leading-tight sm:text-[44px] lg:text-[52px]" style={{ color: "var(--lp-navy)", letterSpacing: "0" }}>
            よくある<span style={{ color: "var(--lp-cta)" }}>質問</span>
          </h2>
          <p className="mt-3 text-[16px] font-medium" style={{ color: "var(--lp-muted-text)" }}>
            はじめての方からよくいただく質問をまとめました。
          </p>
        </div>

        <div>
          <div className="relative z-10 grid gap-4 lg:grid-cols-2 xl:mr-[260px]">
            {faqColumns.map((column, columnIndex) => (
              <div key={columnIndex} className="flex flex-col gap-4">
                {column.map((faq, itemIndex) => {
                  const index = columnIndex * midpoint + itemIndex;
                  return <FAQItem key={faq.question} faq={faq} index={index} isOpen={openItems.has(index)} onToggle={() => toggleItem(index)} />;
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="pointer-events-none absolute right-14 top-[200px] hidden xl:block" style={{ width: 240, height: 260 }}>
          <img src={lpSectionAsset("faq/person-pc.png")} alt="" role="presentation" className="absolute bottom-0 right-0 w-[220px] max-w-full object-contain" />
          <span className="absolute right-[182px] top-[82px] flex h-11 w-11 items-center justify-center rounded-full border bg-white text-[24px] font-black" style={{ borderColor: "#b9d8ff", color: "var(--lp-cta)" }}>
            ?
          </span>
        </div>

        <p className="mt-8 text-center text-[20px] font-black leading-relaxed sm:text-[26px]" style={{ color: "var(--lp-navy)" }}>
          気になることがあっても、就活Passなら<span style={{ color: "var(--lp-cta)" }}>安心</span>して始められます。
        </p>
      </div>
    </section>
  );
}
