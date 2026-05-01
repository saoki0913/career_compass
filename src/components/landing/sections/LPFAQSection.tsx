"use client";

import { useState } from "react";
import { ChevronDown, MessageCircle, Plus } from "lucide-react";
import { lpSectionAsset } from "@/lib/marketing/lp-assets";
import { LANDING_PAGE_FAQS } from "@/lib/marketing/landing-faqs";

function getFaqIcon(index: number) {
  if (index === 2 || index === 3) {
    return <MessageCircle className="h-8 w-8" aria-hidden />;
  }

  return <Plus className="h-9 w-9" aria-hidden />;
}

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
    <article
      className="relative rounded-[18px] border bg-white px-6 py-5"
      style={{
        borderColor: "var(--lp-border-default)",
        boxShadow:
          "0 18px 36px rgba(0, 34, 104, 0.07), 0 2px 9px rgba(0, 34, 104, 0.04)",
      }}
    >
      <button
        type="button"
        id={headingId}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full items-start gap-5 text-left"
      >
        <span
          className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: "var(--lp-cta)" }}
        >
          {getFaqIcon(index)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-4">
            <h3
              className="flex-1 text-[20px] leading-snug"
              style={{ color: "var(--lp-navy)", fontWeight: 800 }}
            >
              {index + 1}. {faq.question}
            </h3>
            <ChevronDown
              className="mt-1 h-6 w-6 shrink-0 transition-transform duration-300"
              style={{
                color: "var(--lp-cta)",
                transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              }}
              aria-hidden
            />
          </div>
        </div>
      </button>

      <div
        id={panelId}
        role="region"
        aria-labelledby={headingId}
        aria-hidden={!isOpen}
        hidden={!isOpen}
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <p
            className="ml-[70px] mt-3 text-[15px] leading-[1.7]"
            style={{ color: "var(--lp-muted-text)" }}
          >
            {faq.answer}
          </p>
        </div>
      </div>
    </article>
  );
}

export function LPFAQSection() {
  const visibleFaqs = LANDING_PAGE_FAQS;
  const faqColumns = [
    visibleFaqs.slice(0, Math.ceil(visibleFaqs.length / 2)),
    visibleFaqs.slice(Math.ceil(visibleFaqs.length / 2)),
  ] as const;
  const [openItems, setOpenItems] = useState<Set<number>>(() => new Set([0]));

  function toggleItem(index: number) {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  return (
    <section
      id="faq"
      className="relative overflow-hidden py-16 sm:py-20 lg:min-h-[680px]"
      style={{
        backgroundColor: "var(--lp-surface-faq)",
        fontFamily: "'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        fontFeatureSettings: '"palt"',
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute hidden lg:block"
        style={{ left: "calc(50% - 240px)", top: 84 }}
      >
        <span style={{ position: "absolute", width: 12, height: 2, background: "#6aa9ff", borderRadius: 2, transform: "rotate(-30deg)" }} />
        <span style={{ position: "absolute", width: 14, height: 2, background: "#6aa9ff", borderRadius: 2, top: -6, left: 12, transform: "rotate(-70deg)" }} />
        <span style={{ position: "absolute", width: 12, height: 2, background: "#6aa9ff", borderRadius: 2, top: 6, left: 18, transform: "rotate(20deg)" }} />
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute hidden lg:block"
        style={{ right: "calc(50% - 220px)", top: 68 }}
      >
        <span style={{ position: "absolute", width: 10, height: 2, background: "#6aa9ff", borderRadius: 2, transform: "rotate(40deg)" }} />
        <span style={{ position: "absolute", width: 12, height: 2, background: "#6aa9ff", borderRadius: 2, top: -4, left: 8, transform: "rotate(70deg)" }} />
      </span>

      <div className="relative mx-auto max-w-[1280px] px-5 sm:px-8">
        <div className="mb-10 text-center">
          <h2
            style={{
              color: "var(--lp-navy)",
              fontSize: "clamp(34px, 5.2vw, 46px)",
              fontWeight: 800,
              letterSpacing: "0",
              lineHeight: 1.12,
            }}
          >
            よくある<span style={{ color: "var(--lp-cta)" }}>質問</span>
          </h2>
          <p
            className="mx-auto mt-4 max-w-2xl text-[16px]"
            style={{ color: "var(--lp-muted-text)", lineHeight: 1.6 }}
          >
            はじめての方からよくいただく質問をまとめました。
          </p>
        </div>

        <div className="relative xl:grid xl:grid-cols-[minmax(0,980px)_minmax(220px,1fr)] xl:items-end xl:gap-2">
          <div className="relative z-10 grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
            {faqColumns.map((columnFaqs, columnIndex) => (
              <div key={columnIndex} className="flex flex-col gap-5">
                {columnFaqs.map((faq, itemIndex) => {
                  const index =
                    columnIndex * Math.ceil(visibleFaqs.length / 2) +
                    itemIndex;

                  return (
                    <FAQItem
                      key={faq.question}
                      faq={faq}
                      index={index}
                      isOpen={openItems.has(index)}
                      onToggle={() => toggleItem(index)}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          <div className="pointer-events-none relative z-0 hidden h-[300px] w-full justify-self-end xl:block">
            <img
              src={lpSectionAsset("faq/person-pc.png")}
              alt=""
              role="presentation"
              className="absolute bottom-[-8px] right-[-42px] h-auto w-[270px] max-w-none object-contain"
            />
            <span
              className="absolute right-[168px] top-[54px] flex h-[52px] w-[52px] items-center justify-center rounded-full bg-white"
              style={{ color: "var(--lp-cta)", boxShadow: "0 18px 34px rgba(0, 102, 255, 0.12)" }}
            >
              <MessageCircle className="h-6 w-6" aria-hidden />
            </span>
          </div>
        </div>

        <p
          className="mt-9 text-center text-[22px] leading-relaxed lg:text-[28px]"
          style={{
            color: "var(--lp-navy)",
            fontWeight: 800,
          }}
        >
          気になることがあっても、就活Passなら
          <span style={{ color: "var(--lp-cta)" }}>安心</span>
          して始められます。
        </p>
      </div>
    </section>
  );
}
