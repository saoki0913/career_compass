import type { Metadata } from "next";
import { PricingInteractive } from "./PricingInteractive";

export const metadata: Metadata = {
  title: "料金プラン | 就活Pass",
  description: "就活Pass の料金プラン。Free / Standard / Pro で比較。",
};

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <PricingInteractive />
    </div>
  );
}
