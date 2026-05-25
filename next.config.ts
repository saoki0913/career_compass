import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const enableDevFilesystemCache = process.env.NEXT_DEV_FS_CACHE === "1";

const nextConfig: NextConfig = {
  experimental: {
    viewTransition: true,
    turbopackFileSystemCacheForDev: enableDevFilesystemCache,
    // dev/build 双方でバレル import のモジュール解決を間引き、コンパイル負荷を抑える。
    // framer-motion は sideEffects:false の barrel で 4 ファイルから利用。lucide-react は
    // Next 16 が既定で最適化済みのため列挙不要（重複指定は no-op）。
    optimizePackageImports: ["framer-motion"],
  },
  images: {
    remotePatterns: [
      // Google OAuth アバター（lh3 など *.googleusercontent.com）
      {
        protocol: "https",
        hostname: "**.googleusercontent.com",
        pathname: "/**",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/shukatsu-pass",
        destination: "/",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      // Prevent indexing of authenticated/app pages and APIs.
      {
        source: "/(dashboard|companies|es|tasks|calendar|settings|profile|notifications|search)(.*)",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive",
          },
        ],
      },
      {
        source: "/(login|onboarding|waitlist)(.*)",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive",
          },
        ],
      },
      {
        source: "/api/(.*)",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive",
          },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          {
            key: "Cross-Origin-Resource-Policy",
            value: "same-site",
          },
          {
            key: "Origin-Agent-Cluster",
            value: "?1",
          },
          {
            key: "X-Permitted-Cross-Domain-Policies",
            value: "none",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
    deleteSourcemapsAfterUpload: true,
  },
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
  },
});
