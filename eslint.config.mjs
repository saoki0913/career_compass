import { defineConfig, globalIgnores } from "eslint/config";
import boundaries from "eslint-plugin-boundaries";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".vercel/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "backend/.venv/**",
    "ml/**/.venv*/**",
  ]),
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "app", pattern: "src/app/**" },
        { type: "bff", pattern: "src/bff/**" },
        { type: "features", pattern: "src/features/*/**", capture: ["feature"] },
        { type: "components", pattern: "src/components/**" },
        { type: "hooks", pattern: "src/hooks/**" },
        { type: "lib", pattern: "src/lib/**" },
        { type: "shared", pattern: "src/shared/**" },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          rules: [
            { from: { type: "features" }, disallow: { to: { type: "app" } } },
            { from: { type: "features" }, disallow: { to: { type: "bff" } } },
            { from: { type: "components" }, disallow: { to: { type: "bff" } } },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
