import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "就活Compass（シューパス）",
    template: "%s | 就活Pass",
  },
  description: "AIと進捗管理で「安価に、迷わず、締切を落とさず、ESの品質を上げる」就活支援アプリ",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "就活Pass",
    title: "就活Compass（シューパス）",
    description: "AIと進捗管理で「安価に、迷わず、締切を落とさず、ESの品質を上げる」就活支援アプリ",
    locale: "ja_JP",
  },
  twitter: {
    card: "summary_large_image",
    title: "就活Compass（シューパス）",
    description: "AIと進捗管理で「安価に、迷わず、締切を落とさず、ESの品質を上げる」就活支援アプリ",
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
  },
  icons: {
    icon: [
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  return (
    <html lang="ja">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "就活Pass",
              alternateName: "就活Compass",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              url: siteUrl,
              description:
                "AIと進捗管理で就活をサポート。ES添削・締切管理・企業研究をひとつのアプリに統合。",
              offers: [
                {
                  "@type": "Offer",
                  price: "0",
                  priceCurrency: "JPY",
                  name: "Free",
                },
                {
                  "@type": "Offer",
                  price: "980",
                  priceCurrency: "JPY",
                  name: "Standard",
                  billingIncrement: "P1M",
                },
                {
                  "@type": "Offer",
                  price: "2980",
                  priceCurrency: "JPY",
                  name: "Pro",
                  billingIncrement: "P1M",
                },
              ],
            }),
          }}
        />
      </head>
      <body className="antialiased">
        {gaId ? <GoogleAnalytics measurementId={gaId} /> : null}
        <AuthProvider>{children}</AuthProvider>
        <Toaster
          position="top-right"
          richColors
          closeButton
          toastOptions={{
            className: "text-sm",
            duration: 4000,
          }}
        />
      </body>
    </html>
  );
}
