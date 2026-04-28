"use client";

import { useState } from "react";
import { ChevronDown, MessageCircle, Plus } from "lucide-react";
import { LP_ASSET_BASE } from "@/lib/marketing/lp-assets";
import { LANDING_PAGE_FAQS } from "@/lib/marketing/landing-faqs";

const ASSET_BASE = `${LP_ASSET_BASE}/`;

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
      className="relative rounded-[18px] border bg-white px-8 py-6"
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
        className="flex w-full items-start gap-6 text-left"
      >
        <span
          className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: "var(--lp-cta)" }}
        >
          {getFaqIcon(index)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-4">
            <h3
              className="flex-1 text-[25px] leading-snug"
              style={{ color: "var(--lp-navy)", fontWeight: 800 }}
            >
              {index + 1}. {faq.question}
            </h3>
            <ChevronDown
              className="mt-1 h-7 w-7 shrink-0 transition-transform duration-300"
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
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <p
            className="ml-[82px] mt-4 text-[18px] leading-[1.7]"
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
  const visibleFaqs = LANDING_PAGE_FAQS.slice(0, 6);
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
      className="relative min-h-[940px] overflow-hidden py-[72px]"
      style={{
        backgroundColor: "var(--lp-surface-faq)",
        fontFamily: "'Inter', 'Noto Sans JP', sans-serif",
      }}
    >
      <img
        src={`${ASSET_BASE}decorative/wave-line-1.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute bottom-0 left-0 hidden w-full opacity-38 2xl:block"
      />
      <img
        src={`${ASSET_BASE}decorative/dot-pattern-light.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute left-8 top-12 hidden w-[120px] opacity-35 2xl:block"
      />
      <img
        src={`${ASSET_BASE}faq_generated_assets_transparent/18_sparkle_decoration.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute left-[29%] top-[74px] hidden w-[58px] opacity-55 2xl:block"
      />
      <img
        src={`${ASSET_BASE}decorative/curved-lines-dot.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute right-0 top-0 hidden w-[620px] opacity-28 2xl:block"
      />

      <div className="relative mx-auto max-w-[1600px] px-5 sm:px-8 2xl:px-0">
        <div className="mb-[52px] text-center">
          <h2
            style={{
              color: "var(--lp-navy)",
              fontSize: "clamp(44px, 5.2vw, 78px)",
              fontWeight: 800,
              letterSpacing: "0",
              lineHeight: 1.12,
            }}
          >
            よくある<span style={{ color: "var(--lp-cta)" }}>質問</span>
          </h2>
          <p
            className="mx-auto mt-6 max-w-3xl text-[24px]"
            style={{ color: "var(--lp-muted-text)", lineHeight: 1.6 }}
          >
            はじめての方からよくいただく質問をまとめました。
          </p>
        </div>

        <div className="relative min-h-[660px]">
          <div className="relative z-10 grid max-w-[1225px] grid-cols-1 gap-5 xl:grid-cols-2 2xl:ml-[92px]">
            {visibleFaqs.map((faq, index) => (
              <FAQItem
                key={faq.question}
                faq={faq}
                index={index}
                isOpen={openItems.has(index)}
                onToggle={() => toggleItem(index)}
              />
            ))}
          </div>

          <div className="pointer-events-none absolute bottom-0 right-[-48px] z-0 hidden h-[520px] w-[330px] 2xl:block">
            <img
              src={`${ASSET_BASE}characters/girl-at-laptop.png`}
              alt=""
              role="presentation"
              className="absolute bottom-0 right-0 h-auto w-[330px] object-contain"
            />
            <span
              className="absolute right-[260px] top-[84px] flex h-[88px] w-[88px] items-center justify-center rounded-full bg-white"
              style={{ color: "var(--lp-cta)", boxShadow: "0 18px 34px rgba(0, 102, 255, 0.12)" }}
            >
              <MessageCircle className="h-10 w-10" aria-hidden />
            </span>
          </div>
        </div>

        <p
          className="mt-4 text-center text-[25px] leading-relaxed lg:text-[32px]"
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
