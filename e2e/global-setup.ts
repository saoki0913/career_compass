import type { FullConfig } from "@playwright/test";

/**
 * PLAYWRIGHT_SKIP_WEBSERVER=1 のときのみ、base URL が応答するか事前確認する。
 * 未起動だと各テストが net::ERR_CONNECTION_REFUSED になり原因が分かりにくいため。
 */
export default async function globalSetup(_config: FullConfig) {
  if (process.env.PLAYWRIGHT_SKIP_WEBSERVER !== "1") {
    return;
  }

  const raw = process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:3000";
  const base = raw.replace(/\/$/, "");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    await fetch(base, { method: "GET", signal: controller.signal, redirect: "follow" });
  } catch {
    throw new Error(
      [
        "Playwright: PLAYWRIGHT_SKIP_WEBSERVER=1 ですが、アプリに接続できませんでした。",
        `  URL: ${base}`,
        "  別ターミナルで `npm run dev`（または該当 URL のサーバ）を起動するか、",
        "  `unset PLAYWRIGHT_SKIP_WEBSERVER`（または変数を削除）して Playwright に dev サーバ起動を任せてください。",
      ].join("\n"),
    );
  } finally {
    clearTimeout(timer);
  }
}
