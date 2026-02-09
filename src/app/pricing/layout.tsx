import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "料金プラン",
  description: "ウカルン（Career Compass）の料金プラン（Free / Standard / Pro）です。",
  alternates: {
    canonical: "/pricing",
  },
  openGraph: {
    title: "料金プラン | ウカルン",
    description: "ウカルン（Career Compass）の料金プラン（Free / Standard / Pro）です。",
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

