import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: [
    // Next.js App Router conventions (existing files)
    "src/app/**/page.tsx",
    "src/app/**/layout.tsx",
    "src/app/**/route.ts",
    "src/app/**/loading.tsx",
    "src/app/**/not-found.tsx",
    "src/app/**/opengraph-image.tsx",
    "src/app/robots.ts",
    "src/app/sitemap.ts",
    "src/app/globals.css",
    // Proxy (Next.js 16 middleware equivalent)
    "src/proxy.ts",
    // Root config files (verified to exist)
    "next.config.ts",
    "drizzle.config.ts",
    "postcss.config.mjs",
    "vitest.config.ts",
    "playwright.config.ts",
    "playwright.live.config.ts",
    "eslint.config.mjs",
    // Test files (use import() extensively)
    "src/**/*.test.ts",
    "src/**/*.test.tsx",
    "e2e/**/*.spec.ts",
    // Scripts & tools
    "scripts/**/*.mjs",
    "scripts/**/*.ts",
    "scripts/**/*.tsx",
    "tools/**/*.mjs",
  ],
  project: [
    "src/**/*.{ts,tsx}",
    "e2e/**/*.{ts,tsx}",
    "scripts/**/*.{ts,tsx,mjs}",
    "tools/**/*.{ts,tsx,mjs}",
  ],
  paths: {
    "@/*": ["./src/*"],
  },
  ignore: [],
  ignoreDependencies: [
    "@tailwindcss/postcss", // PostCSS plugin loaded by config
    "@remotion/cli", // Used via npx
    "@remotion/renderer", // Indirect reference from CLI
    "remotion", // Indirect reference from CLI
    "@types/*", // Type-only packages
    "dotenv-cli", // CLI tool used in npm scripts
  ],
};

export default config;
