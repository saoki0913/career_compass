"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { LANDING_PAGE_FAQS } from "@/lib/marketing/landing-faqs";
import { LandingSectionMotion } from "./LandingSectionMotion";

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section
      className="bg-[var(--lp-surface-page)] px-6 py-24 md:py-28"
      id="faq"
    >
      <div className="mx-auto max-w-3xl">
        <LandingSectionMotion>
          <h2
            className="mb-12 text-center text-2xl tracking-tight text-[var(--lp-navy)] md:text-3xl"
            style={{ fontWeight: 600 }}
          >
            よくある質問
          </h2>
          <div
            className="divide-y rounded-xl border bg-white"
            style={{
              borderColor: "var(--lp-border-default)",
              boxShadow: "var(--lp-shadow-card)",
            }}
          >
            {LANDING_PAGE_FAQS.map((faq, i) => (
              <div key={i} className="px-5 md:px-8">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 py-5 text-left md:py-6"
                  onClick={() => setOpenIndex(openIndex === i ? null : i)}
                >
                  <span
                    className="text-base text-[var(--lp-navy)]"
                    style={{ fontWeight: 600 }}
                  >
                    {faq.question}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-5 w-5 shrink-0 text-[var(--lp-body-muted)] transition-transform duration-200",
                      openIndex === i && "rotate-180"
                    )}
                  />
                </button>
                <div
                  className={cn(
                    "overflow-hidden transition-all duration-200 ease-out",
                    openIndex === i ? "max-h-[480px] pb-5 md:pb-6" : "max-h-0"
                  )}
                >
                  <p
                    className="pr-8 text-sm leading-relaxed text-[var(--lp-body-muted)] md:text-base"
                    style={{ fontWeight: 400 }}
                  >
                    {faq.answer}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </LandingSectionMotion>
      </div>
    </section>
  );
}
