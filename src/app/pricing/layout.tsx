import type { Metadata } from "next";
import { createMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = createMarketingMetadata({
  title: "就活AI・ES添削AIの料金プラン | 就活Pass",
  description:
    "就活Passの料金プラン。就活AI、ES添削AI、志望動機AI、締切管理を Free / Standard / Pro で比較できます。ES添削AIを継続利用したい学生向けの価格設計です。",
  path: "/pricing",
  keywords: [
    "就活Pass 料金",
    "就活AI 料金",
    "ES添削 AI 料金",
    "就活アプリ 料金",
    "ES添削 サブスク",
  ],
});

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
