import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "就活Pass | ES添削・志望動機作成・締切管理",
    template: "%s | 就活Pass",
  },
  description:
    "就活Pass（シューパス）は、ES添削・志望動機作成・ガクチカ深掘り・締切管理をまとめて使える就活アプリです。",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "就活Pass",
    title: "就活Pass | ES添削・志望動機作成・締切管理",
    description:
      "就活Pass（シューパス）は、ES添削・志望動機作成・ガクチカ深掘り・締切管理をまとめて使える就活アプリです。",
    locale: "ja_JP",
  },
  twitter: {
    card: "summary_large_image",
    title: "就活Pass | ES添削・志望動機作成・締切管理",
    description:
      "就活Pass（シューパス）は、ES添削・志望動機作成・ガクチカ深掘り・締切管理をまとめて使える就活アプリです。",
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
              alternateName: ["シューパス", "就活Compass", "Career Compass"],
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              url: siteUrl,
              description:
                "就活Pass（シューパス）は、ES添削・志望動機作成・ガクチカ深掘り・締切管理をひとつにまとめた就活アプリです。",
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
          position="top-center"
          visibleToasts={1}
          theme="light"
          toastOptions={{
            className:
              "border border-slate-200/80 bg-white/96 text-slate-900 shadow-[0_18px_52px_rgba(15,23,42,0.14)] backdrop-blur-md",
            descriptionClassName: "text-slate-600",
            duration: 3600,
            closeButton: false,
            classNames: {
              toast:
                "rounded-[22px] px-4 py-3",
              title: "text-[13px] font-semibold tracking-[0.01em]",
              description: "text-[12px] leading-5 text-slate-600",
              success:
                "border-emerald-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.99),rgba(236,253,245,0.98))] text-slate-900",
              error:
                "border-rose-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.99),rgba(255,241,242,0.98))] text-slate-900",
              info:
                "border-sky-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.99),rgba(240,249,255,0.98))] text-slate-900",
            },
          }}
        />
      </body>
    </html>
  );
}
