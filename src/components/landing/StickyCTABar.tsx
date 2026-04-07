"use client";

import Link from "next/link";

export function StickyCTABar() {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden"
      style={{
        backgroundColor: "rgba(255,255,255,0.92)",
        borderColor: "var(--lp-border-default)",
        backdropFilter: "blur(10px)",
      }}
    >
      <Link
        href="/login"
        className="block w-full rounded-md bg-[var(--lp-cta)] py-3.5 text-center text-base text-white transition-opacity hover:opacity-90"
        style={{ fontWeight: 600 }}
      >
        無料で始める
      </Link>
    </div>
  );
}
