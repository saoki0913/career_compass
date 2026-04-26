"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { LANDING_PAGE_FAQS } from "@/lib/marketing/landing-faqs";

const ASSET_BASE = "/marketing/LP/assets/";

/** Number of FAQs visible before the user clicks "show all". */
const INITIAL_VISIBLE = 4;

export function LPFAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [showAll, setShowAll] = useState(false);

  const visibleFaqs = showAll
    ? LANDING_PAGE_FAQS
    : LANDING_PAGE_FAQS.slice(0, INITIAL_VISIBLE);

  const toggle = (idx: number) => {
    setOpenIndex((prev) => (prev === idx ? null : idx));
  };

  return (
    <section
      id="faq"
      className="py-20 lg:py-28"
      style={{ backgroundColor: "var(--lp-surface-faq)" }}
    >
      <div className="relative mx-auto max-w-[1200px] px-6">
        {/* Decorative dotted grid -- top-right, desktop only */}
        <img
          src={`${ASSET_BASE}faq_generated_assets_transparent/15_dotted_grid_decoration.png`}
          alt=""
          role="presentation"
          className="pointer-events-none absolute -top-2 right-4 hidden w-[100px] select-none opacity-15 lg:block"
        />

        {/* ---------- Heading ---------- */}
        <div className="mb-10 text-center lg:mb-14">
          <h2
            style={{
              fontSize: "clamp(28px, 3.5vw, 42px)",
              fontWeight: 800,
              color: "var(--lp-navy)",
              lineHeight: 1.2,
            }}
          >
            よくある
            <span style={{ color: "var(--lp-cta)" }}>質問</span>
          </h2>
          <p
            className="mx-auto mt-4 max-w-lg text-base"
            style={{ color: "var(--lp-muted-text)", lineHeight: 1.7 }}
          >
            就活Passを使う前に、気になる点をまとめて確認できます。
          </p>
        </div>

        {/* ---------- 2-col layout: characters + accordion ---------- */}
        <div className="flex flex-col items-start gap-10 lg:flex-row lg:gap-14">
          {/* -- Left column: character illustrations (lg only) -- */}
          <div
            className="relative hidden shrink-0 lg:flex lg:w-[30%] lg:flex-col lg:items-center lg:justify-center"
            aria-hidden="true"
          >
            {/* Decorative dot pattern */}
            <img
              src={`${ASSET_BASE}decorative/dot-pattern-1.png`}
              alt=""
              className="pointer-events-none absolute -left-4 top-0 w-24 opacity-15"
            />

            {/* Decorative blue circle */}
            <img
              src={`${ASSET_BASE}decorative/blue-circle-sm.png`}
              alt=""
              className="pointer-events-none absolute -right-2 bottom-12 w-10 opacity-20"
            />

            {/* Girl illustration */}
            <img
              src={`${ASSET_BASE}characters/girl-clasped.png`}
              alt=""
              className="relative z-10 h-auto w-[200px]"
            />

            {/* Boy illustration -- offset slightly */}
            <img
              src={`${ASSET_BASE}characters/boy-fistpump.png`}
              alt=""
              className="relative z-10 -mt-4 ml-16 h-auto w-[190px]"
            />

            {/* Decorative sparkle near characters */}
            <img
              src={`${ASSET_BASE}faq_generated_assets_transparent/18_sparkle_decoration.png`}
              alt=""
              role="presentation"
              className="pointer-events-none absolute -left-2 bottom-16 w-[36px] select-none opacity-40"
            />

            {/* Supportive tagline below characters */}
            <p
              className="mt-4 text-center text-sm leading-relaxed"
              style={{ color: "var(--lp-muted-text)" }}
            >
              安心して
              <br />
              始められるポイント
            </p>
          </div>

          {/* -- Right column: FAQ accordion -- */}
          <div className="w-full lg:w-[70%]">
            <div className="flex flex-col gap-4">
              {visibleFaqs.map((faq, idx) => {
                const isOpen = openIndex === idx;
                const qNumber = String(idx + 1).padStart(1, "0");

                return (
                  <div
                    key={idx}
                    className="overflow-hidden rounded-2xl"
                    style={{
                      backgroundColor: "#ffffff",
                      border: "1px solid var(--lp-border-default)",
                      boxShadow:
                        "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)",
                    }}
                  >
                    {/* Question button */}
                    <button
                      id={`faq-q-${idx}`}
                      type="button"
                      onClick={() => toggle(idx)}
                      className={cn(
                        "flex w-full items-center gap-3 px-5 py-4 text-left transition-colors",
                        "focus-visible:outline-2 focus-visible:outline-offset-2",
                        "hover:bg-[#f0f5ff]"
                      )}
                      style={{
                        outlineColor: "var(--lp-cta)",
                      }}
                      aria-expanded={isOpen}
                      aria-controls={`faq-answer-${idx}`}
                    >
                      {/* Q badge */}
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ backgroundColor: "var(--lp-cta)" }}
                        aria-hidden="true"
                      >
                        Q{qNumber}
                      </span>

                      {/* Question text */}
                      <span
                        className="flex-1 text-sm font-semibold sm:text-base"
                        style={{ color: "var(--lp-navy)" }}
                      >
                        {faq.question}
                      </span>

                      {/* Chevron */}
                      <ChevronDown
                        className={cn(
                          "h-5 w-5 shrink-0 transition-transform duration-300",
                          isOpen && "rotate-180"
                        )}
                        style={{ color: "#94a3b8" }}
                        aria-hidden="true"
                      />
                    </button>

                    {/* Answer panel -- grid-rows animation */}
                    <div
                      id={`faq-answer-${idx}`}
                      role="region"
                      aria-labelledby={`faq-q-${idx}`}
                      className="grid transition-[grid-template-rows] duration-300 ease-in-out"
                      style={{
                        gridTemplateRows: isOpen ? "1fr" : "0fr",
                      }}
                    >
                      <div className="overflow-hidden">
                        <div
                          className="flex gap-3 px-5 pb-5 pt-1"
                          style={{
                            borderTop: "1px solid #f1f5f9",
                          }}
                        >
                          {/* A badge */}
                          <span
                            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                            style={{
                              backgroundColor: "#eff6ff",
                              color: "var(--lp-cta)",
                            }}
                            aria-hidden="true"
                          >
                            A
                          </span>

                          {/* Answer text */}
                          <p
                            className="flex-1 text-sm leading-relaxed"
                            style={{ color: "var(--lp-muted-text)" }}
                          >
                            {faq.answer}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Show all / collapse button */}
            {LANDING_PAGE_FAQS.length > INITIAL_VISIBLE && (
              <div className="mt-8 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setShowAll((prev) => !prev);
                    if (showAll) {
                      setOpenIndex(null);
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-sm font-bold shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    color: "var(--lp-cta)",
                    border: "2px solid var(--lp-cta)",
                    outlineColor: "var(--lp-cta)",
                    backgroundColor: "transparent",
                  }}
                >
                  {showAll ? "閉じる" : "すべての質問を見る"}
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-300",
                      showAll && "rotate-180"
                    )}
                    aria-hidden="true"
                  />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ---------- Bottom tagline ---------- */}
        <p
          className="mt-14 text-center"
          style={{
            fontSize: "clamp(18px, 2.5vw, 24px)",
            fontWeight: 700,
            color: "var(--lp-navy)",
            lineHeight: 1.4,
          }}
        >
          疑問をなくして、
          <span style={{ color: "var(--lp-cta)" }}>就活の一歩</span>
          をスムーズに。
        </p>
      </div>
    </section>
  );
}
