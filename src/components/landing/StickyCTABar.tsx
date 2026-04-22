"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function StickyCTABar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => setVisible(window.scrollY > 600);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-100 bg-white/90 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden">
      <Link
        href="/login"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--lp-cta)] py-3.5 text-sm text-white transition-transform active:scale-[0.98]"
        style={{ fontWeight: 600 }}
      >
        無料で試す
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
