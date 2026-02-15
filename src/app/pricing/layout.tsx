import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "料金プラン",
  description: "就活Compass（シューパス）の料金プラン（Free / Standard / Pro）です。",
  alternates: {
    canonical: "/pricing",
  },
  openGraph: {
    title: "料金プラン | 就活Pass",
    description: "就活Compass（シューパス）の料金プラン（Free / Standard / Pro）です。",
    url: "/pricing",
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

