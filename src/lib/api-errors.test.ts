import { describe, expect, it } from "vitest";

import {
  AppUiError,
  CLIENT_NETWORK_DEFAULT_ACTION,
  getUserFacingErrorMessage,
  isClientNetworkError,
  parseApiErrorResponse,
  toAppUiError,
  toUserFacingError,
} from "./api-errors";

describe("api-errors", () => {
  it("returns the fallback user message for technical errors", () => {
    const message = getUserFacingErrorMessage(
      new Error("server exploded"),
      {
        code: "CONTACT_SUBMIT_FAILED",
        userMessage: "お問い合わせを送信できませんでした。",
      },
      "ContactForm:submit"
    );

    expect(message).toBe("お問い合わせを送信できませんでした。");
  });

  it("falls back when an error message contains internal technical details", () => {
    const message = getUserFacingErrorMessage(
      new Error("面接セッション保存用の DB migration が未適用です。"),
      {
        code: "INTERVIEW_UNAVAILABLE",
        userMessage: "現在この機能を利用できません。",
      },
      "api-errors:test"
    );

    expect(message).toBe("現在この機能を利用できません。");
  });

  it("parses structured API errors without exposing developer debug payloads", async () => {
    const response = new Response(
      JSON.stringify({
        error: {
          code: "SETTINGS_PROFILE_UPDATE_FAILED",
          userMessage: "プロフィールを保存できませんでした。",
          action: "時間をおいて、もう一度お試しください。",
          retryable: false,
        },
        requestId: "req-123",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": "req-123",
        },
      }
    );

    const error = await parseApiErrorResponse(
      response,
      {
        code: "FALLBACK",
        userMessage: "保存できませんでした。",
      },
      "api-errors:test"
    );

    expect(error.message).toBe("プロフィールを保存できませんでした。");
    expect(error.requestId).toBe("req-123");
    expect(error.developerMessage).toBeUndefined();
    expect(error.details).toBeUndefined();
  });

  it("parses legacy top-level token limit errors without exposing raw JSON", async () => {
    const response = new Response(
      JSON.stringify({
        code: "TOKEN_LIMIT_SERVICE_UNAVAILABLE",
        userMessage: "現在、AI機能を一時的に利用できません。",
        action: "数分後にもう一度お試しください。クレジットは消費されていません。",
        retryable: true,
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    const error = await parseApiErrorResponse(
      response,
      {
        code: "ES_REVIEW_REQUEST_FAILED",
        userMessage: "ES添削を開始できませんでした。",
      },
      "api-errors:test",
    );

    expect(error.code).toBe("TOKEN_LIMIT_SERVICE_UNAVAILABLE");
    expect(error.message).toBe("現在、AI機能を一時的に利用できません。");
    expect(error.action).toBe("数分後にもう一度お試しください。クレジットは消費されていません。");
    expect(error.retryable).toBe(true);
    expect(error.message).not.toContain("{");
    expect(error.developerMessage).toBeUndefined();
  });

  it("normalizes structured 401 errors to the shared login prompt", async () => {
    const response = new Response(
      JSON.stringify({
        error: {
          code: "INTERVIEW_AUTH_REQUIRED",
          userMessage: "面接対策を利用するには認証が必要です。",
          action: "ログイン、またはゲスト状態を確認してから、もう一度お試しください。",
        },
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );

    const error = await parseApiErrorResponse(
      response,
      {
        code: "FALLBACK",
        userMessage: "失敗しました。",
      },
      "api-errors:test",
    );

    expect(error.code).toBe("INTERVIEW_AUTH_REQUIRED");
    expect(error.message).toBe("ログインが必要です。");
    expect(error.action).toBe("ログインしてから、もう一度お試しください。");
  });

  it("normalizes legacy 401 errors to the shared login prompt", async () => {
    const response = new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });

    const error = await parseApiErrorResponse(
      response,
      {
        code: "FALLBACK",
        userMessage: "失敗しました。",
        authMessage: "カスタム認証文言",
      },
      "api-errors:test",
    );

    expect(error.code).toBe("AUTH_REQUIRED");
    expect(error.message).toBe("ログインが必要です。");
    expect(error.action).toBe("ログインしてから、もう一度お試しください。");
  });

  it("detects browser fetch network failures", () => {
    expect(isClientNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isClientNetworkError(new TypeError("Load failed"))).toBe(true);
    expect(isClientNetworkError(new Error("NetworkError when attempting to fetch resource."))).toBe(
      true,
    );
  });

  it("does not treat AbortError as a network failure", () => {
    const err = new Error("Aborted");
    err.name = "AbortError";
    expect(isClientNetworkError(err)).toBe(false);
  });

  it("marks toAppUiError with clientNetworkFailure and unified action for fetch errors", () => {
    const ui = toAppUiError(
      new TypeError("Failed to fetch"),
      {
        code: "COMPANIES_FETCH_FAILED",
        userMessage: "企業一覧を読み込めませんでした。",
        action: "ページを再読み込みして、もう一度お試しください。",
        retryable: true,
      },
      "api-errors:test",
    );
    expect(ui.clientNetworkFailure).toBe(true);
    expect(ui.message).toBe("企業一覧を読み込めませんでした。");
    expect(ui.action).toBe(CLIENT_NETWORK_DEFAULT_ACTION);
    expect(ui.retryable).toBe(true);
  });

  it("reflects clientNetworkFailure on AppUiError for isClientNetworkError", () => {
    const ok = new AppUiError("x", { code: "X" });
    expect(isClientNetworkError(ok)).toBe(false);
    const net = new AppUiError("x", { code: "X", clientNetworkFailure: true });
    expect(isClientNetworkError(net)).toBe(true);
  });

  it("parses API errors as non-client-network failures", async () => {
    const response = new Response(JSON.stringify({ error: { userMessage: "失敗" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
    const error = await parseApiErrorResponse(
      response,
      { code: "FALLBACK", userMessage: "保存できませんでした。" },
      "api-errors:test",
    );
    expect(error.clientNetworkFailure).toBe(false);
  });

  it("parses structured gakuchika list errors with request id and action", async () => {
    const response = new Response(
      JSON.stringify({
        error: {
          code: "GAKUCHIKA_LIST_FETCH_FAILED",
          userMessage: "ガクチカ一覧を読み込めませんでした。",
          action: "時間を置いて、もう一度読み込んでください。",
          retryable: true,
        },
        requestId: "req-gaku",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": "req-gaku",
        },
      },
    );

    const error = await parseApiErrorResponse(
      response,
      {
        code: "FALLBACK",
        userMessage: "読み込めませんでした。",
      },
      "api-errors:gakuchika",
    );

    expect(error.code).toBe("GAKUCHIKA_LIST_FETCH_FAILED");
    expect(error.message).toBe("ガクチカ一覧を読み込めませんでした。");
    expect(error.action).toBe("時間を置いて、もう一度読み込んでください。");
    expect(error.requestId).toBe("req-gaku");
    expect(error.retryable).toBe(true);
    expect(error.developerMessage).toBeUndefined();
  });

  describe("toUserFacingError", () => {
    it("excludes requestId, developerMessage, details", () => {
      const appError = new AppUiError("テスト", {
        code: "TEST",
        requestId: "req-123",
        developerMessage: "dev msg",
        details: "details",
        retryable: true,
        action: "再試行してください",
      });
      const safe = toUserFacingError(appError);
      expect(safe.message).toBe("テスト");
      expect(safe.action).toBe("再試行してください");
      expect(safe.retryable).toBe(true);
      expect(safe.code).toBe("TEST");
      expect("requestId" in safe).toBe(false);
      expect("developerMessage" in safe).toBe(false);
      expect("details" in safe).toBe(false);
    });
  });

  describe("parseApiErrorResponse HTML response detection", () => {
    const htmlBody = '<!DOCTYPE html><html lang="ja"><head></head><body>Not Found</body></html>';
    const fallback = {
      code: "ES_REVIEW_REQUEST_FAILED",
      userMessage: "ES添削を開始できませんでした。",
      action: "入力内容や設定を確認して、もう一度お試しください。",
      retryable: true,
    };

    it("detects HTML 404 and returns fallback message instead of raw HTML", async () => {
      const response = new Response(htmlBody, {
        status: 404,
        headers: { "Content-Type": "text/html" },
      });
      const error = await parseApiErrorResponse(response, fallback, "test");
      expect(error.message).not.toContain("<!DOCTYPE");
      expect(error.message).not.toContain("<html");
      expect(error.code).toBe("NOT_FOUND");
      expect(error.retryable).toBe(true);
      expect(error.developerMessage).toBe("HTML response (status 404)");
      expect(error.status).toBe(404);
    });

    it("detects HTML 500 as retryable", async () => {
      const response = new Response(htmlBody, {
        status: 500,
        headers: { "Content-Type": "text/html" },
      });
      const error = await parseApiErrorResponse(response, fallback, "test");
      expect(error.retryable).toBe(true);
      expect(error.developerMessage).toBe("HTML response (status 500)");
    });

    it("detects HTML by body when Content-Type header is missing", async () => {
      const response = new Response(htmlBody, { status: 404 });
      const error = await parseApiErrorResponse(response, fallback, "test");
      expect(error.code).toBe("NOT_FOUND");
      expect(error.developerMessage).toBe("HTML response (status 404)");
    });

    it("does not treat empty body 404 as HTML", async () => {
      const response = new Response("", { status: 404 });
      const error = await parseApiErrorResponse(response, fallback, "test");
      expect(error.code).toBe("NOT_FOUND");
      expect(error.developerMessage).not.toBe("HTML response (status 404)");
    });
  });

  describe("parseApiErrorResponse structured userMessage safety", () => {
    it("falls back when structured userMessage is English technical", async () => {
      const response = new Response(
        JSON.stringify({
          error: { code: "INTERNAL", userMessage: "Internal Server Error", retryable: false },
          requestId: "req-456",
        }),
        { status: 500 },
      );
      const err = await parseApiErrorResponse(
        response,
        { code: "FALLBACK", userMessage: "サーバーエラーが発生しました。" },
        "test",
      );
      expect(err.message).toBe("サーバーエラーが発生しました。");
    });
  });
});
