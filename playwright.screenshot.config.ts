import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:3000";
const parsedBaseURL = new URL(baseURL);
if (
  parsedBaseURL.protocol !== "http:" ||
  !["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsedBaseURL.hostname)
) {
  throw new Error("Screenshot capture must use a local http base URL");
}
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1";
const storageState = process.env.PLAYWRIGHT_AUTH_STATE;

export default defineConfig({
  globalSetup: "./e2e/global-setup.ts",
  testDir: "./e2e",
  testMatch: ["**/tooling/screenshot-capture.spec.ts"],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL,
    ...(storageState ? { storageState } : {}),
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: skipWebServer
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
