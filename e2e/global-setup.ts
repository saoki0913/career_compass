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

  // FastAPI health check: only needed when company-info / AI live tests will run.
  // Gate on LIVE_COMPANY_INFO_TARGET_ENV or LIVE_AI_CONVERSATION_TARGET_ENV so
  // unrelated suites (UI review, auth, release E2E) don't require FastAPI.
  const needsFastapi =
    process.env.LIVE_COMPANY_INFO_TARGET_ENV === "local" ||
    process.env.LIVE_AI_CONVERSATION_TARGET_ENV === "local";

  if (needsFastapi) {
    const fastapiBase =
      process.env.FASTAPI_INTERNAL_URL?.trim() || "http://localhost:8000";
    const fastapiController = new AbortController();
    const fastapiTimer = setTimeout(() => fastapiController.abort(), 8000);
    try {
      const response = await fetch(`${fastapiBase}/health`, {
        method: "GET",
        signal: fastapiController.signal,
      });
      if (!response.ok) {
        throw new Error(`FastAPI /health returned HTTP ${response.status}`);
      }
    } catch (err) {
      throw new Error(
        [
          "Playwright: FastAPI バックエンドに接続できませんでした。",
          `  URL: ${fastapiBase}/health`,
          "  company-info-search / company-info-rag テストは FastAPI が必須です。",
          "  別ターミナルで `cd backend && uvicorn app.main:app --port 8000` を起動してから再実行してください。",
          `  原因: ${err instanceof Error ? err.message : String(err)}`,
        ].join("\n"),
      );
    } finally {
      clearTimeout(fastapiTimer);
    }
  }
}
