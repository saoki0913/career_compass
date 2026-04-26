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

  const healthTimeout = Number(process.env.E2E_HEALTH_TIMEOUT_MS) || 15000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), healthTimeout);

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
    const fastapiHealthTimeout =
      Number(process.env.E2E_FASTAPI_HEALTH_TIMEOUT_MS) || 60000;
    const retryInterval = 2000;
    const attemptTimeout = 5000;
    const maxAttempts = Math.floor(fastapiHealthTimeout / retryInterval);
    const deadline = Date.now() + fastapiHealthTimeout;
    let lastError: Error | null = null;
    let ready = false;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (Date.now() >= deadline) {
        break;
      }

      const fastapiController = new AbortController();
      const fastapiTimer = setTimeout(() => fastapiController.abort(), attemptTimeout);
      try {
        const response = await fetch(`${fastapiBase}/health/ready`, {
          method: "GET",
          signal: fastapiController.signal,
        });
        if (response.ok) {
          ready = true;
          break;
        }
        lastError = new Error(`FastAPI /health/ready returned HTTP ${response.status}`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      } finally {
        clearTimeout(fastapiTimer);
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(retryInterval, remainingMs)));
    }

    if (!ready) {
      throw new Error(
        [
          "Playwright: FastAPI バックエンドの readiness check に失敗しました。",
          `  URL: ${fastapiBase}/health/ready`,
          "  company-info-search / company-info-rag テストは FastAPI が必須です。",
          "  別ターミナルで `cd backend && uvicorn app.main:app --port 8000` を起動してから再実行してください。",
          `  原因: ${lastError?.message || "timeout"}`,
        ].join("\n"),
      );
    }
  }
}
