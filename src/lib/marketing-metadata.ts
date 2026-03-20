import type { Metadata } from "next";

type MarketingMetadataOptions = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
};

const BRAND_NAME = "就活Pass";

export function createMarketingMetadata({
  title,
  description,
  path,
  keywords,
}: MarketingMetadataOptions): Metadata {
  return {
    title,
    description,
    keywords,
    alternates: {
      canonical: path,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title,
      description,
      url: path,
      siteName: BRAND_NAME,
      locale: "ja_JP",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
