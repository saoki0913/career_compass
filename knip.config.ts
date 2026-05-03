import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: [
    // Next.js App Router conventions (existing files)
    "src/app/**/page.tsx",
    "src/app/**/layout.tsx",
    "src/app/**/route.ts",
    "src/app/**/loading.tsx",
    "src/app/**/opengraph-image.tsx",
    "src/app/globals.css",
    // Test files (use import() extensively)
    "src/**/*.test.ts",
    "src/**/*.test.tsx",
    "e2e/**/*.spec.ts",
    // Scripts & tools
    "scripts/**/*.mjs",
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
  rules: {
    exports: "warn",
    types: "warn",
    duplicates: "warn",
  },
  ignoreDependencies: [
    "trace-core", // trace-check binary invoked by security/scan/run-lightweight-scan.sh
  ],
  ignoreBinaries: [
    "python", // System Python used by backend import-linter in lint:architecture
  ],
};

export default config;
