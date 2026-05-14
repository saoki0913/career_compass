"use client";

import { useSearchParams } from "next/navigation";

export function PricingCancelNotice() {
  const searchParams = useSearchParams();
  const canceled = searchParams.get("checkout") === "canceled";
  const source = searchParams.get("source");

  if (!canceled || source !== "lp-pricing") {
    return null;
  }

  return (
    <div className="mx-auto mt-6 max-w-[640px] rounded-2xl border bg-white px-5 py-4 text-center text-[14px] font-bold leading-6 shadow-[0_10px_26px_rgba(20,50,110,0.10)]" style={{ borderColor: "#cfe3ff", color: "var(--lp-navy)" }}>
      チェックアウトがキャンセルされました。プラン内容を見直してから、いつでも再開できます。
    </div>
  );
}
