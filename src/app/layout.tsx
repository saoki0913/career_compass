import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { CsrfFetchBootstrap } from "@/components/security/CsrfFetchBootstrap";
import { getAppUrl } from "@/lib/app-url";
import { siteDescription } from "@/lib/seo/site-structured-data";

const siteUrl = getAppUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "就活Pass | ES添削・就活AI・志望動機・締切管理",
    template: "%s | 就活Pass",
  },
  description:
    "就活Pass（シューパス・就活パス）は、ES添削・就活AI、志望動機・ガクチカの対話支援、企業・締切・Googleカレンダー連携をまとめて使える就活アプリです。",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "就活Pass",
    title: "就活Pass | ES添削・就活AI・志望動機・締切管理",
    description:
      "就活Pass（シューパス・就活パス）は、ES添削・就活AI、志望動機・ガクチカの対話支援、企業・締切・Googleカレンダー連携をまとめて使える就活アプリです。",
    locale: "ja_JP",
  },
  twitter: {
    card: "summary_large_image",
    title: "就活Pass | ES添削・就活AI・志望動機・締切管理",
    description:
      "就活Pass（シューパス・就活パス）は、ES添削・就活AI、志望動機・ガクチカの対話支援、企業・締切・Googleカレンダー連携をまとめて使える就活アプリです。",
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
  return (
    <html lang="ja">
      <head />
      <body className="antialiased">
        <CsrfFetchBootstrap />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
