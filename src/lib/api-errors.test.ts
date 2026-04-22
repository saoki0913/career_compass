import { describe, expect, it } from "vitest";

import {
  AppUiError,
  CLIENT_NETWORK_DEFAULT_ACTION,
  getUserFacingErrorMessage,
  isClientNetworkError,
  parseApiErrorResponse,
  toAppUiError,
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
});
