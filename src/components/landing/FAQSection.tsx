"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { LANDING_PAGE_FAQS } from "@/lib/marketing/landing-faqs";
import { LandingSectionMotion } from "./LandingSectionMotion";

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="bg-white px-6 py-24 md:py-32" id="faq">
      <div className="mx-auto max-w-[700px]">
        <LandingSectionMotion className="mb-14 text-center">
          <h2
            className="text-3xl tracking-tight text-[var(--lp-navy)] md:text-[2.5rem]"
            style={{ fontWeight: 800, lineHeight: 1.3 }}
          >
            よくある質問
          </h2>
        </LandingSectionMotion>

        <LandingSectionMotion>
          <div>
            {LANDING_PAGE_FAQS.map((faq, i) => (
              <div key={i} className="border-b border-slate-100">
                <button
                  type="button"
                  className="flex w-full items-center justify-between py-5 text-left group"
                  onClick={() => setOpenIndex(openIndex === i ? null : i)}
                >
                  <span
                    className="pr-4 text-[0.95rem] text-[var(--lp-navy)]"
                    style={{ fontWeight: 600 }}
                  >
                    {faq.question}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-slate-300 transition-transform duration-300",
                      openIndex === i && "rotate-180"
                    )}
                  />
                </button>
                <div
                  className={cn(
                    "overflow-hidden transition-all duration-300 ease-in-out",
                    openIndex === i ? "max-h-[480px] pb-5" : "max-h-0"
                  )}
                >
                  <p
                    className="text-sm text-slate-500"
                    style={{ lineHeight: 1.8 }}
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
