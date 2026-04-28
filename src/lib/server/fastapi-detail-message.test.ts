import { describe, expect, it } from "vitest";

import {
  buildFastApiErrorResponseOptions,
  errorTypeFromFastApiDetail,
  messageFromFastApiDetail,
} from "./fastapi-detail-message";

describe("fastapi-detail-message", () => {
  it("extracts message and error type from object detail", () => {
    const detail = {
      error: "評価処理が一時的に利用できません",
      error_type: "evaluation_provider_failure",
    };

    expect(messageFromFastApiDetail(detail)).toBe("評価処理が一時的に利用できません");
    expect(errorTypeFromFastApiDetail(detail)).toBe("evaluation_provider_failure");
  });

  it("maps legacy tenant-key string detail to config error options", () => {
    const options = buildFastApiErrorResponseOptions({
      status: 503,
      payload: { detail: "tenant key is not configured" },
      defaultCode: "MOTIVATION_CONVERSATION_STREAM_FAILED",
      defaultUserMessage: "AIサービスに接続できませんでした",
      defaultAction: "時間をおいて、もう一度お試しください。",
    });

    expect(options.status).toBe(503);
    expect(options.code).toBe("FASTAPI_TENANT_KEY_NOT_CONFIGURED");
    expect(options.llmErrorType).toBe("tenant_key_not_configured");
    expect(options.userMessage).toBe("AI認証設定が未完了です。管理側で設定確認後に再度お試しください。");
    expect(options.retryable).toBe(true);
  });

  it("preserves upstream rate-limit status and concurrency code", () => {
    const options = buildFastApiErrorResponseOptions({
      status: 429,
      payload: { detail: { code: "sse_concurrency_exceeded", limit: 1 } },
      defaultCode: "MOTIVATION_CONVERSATION_STREAM_FAILED",
      defaultUserMessage: "AIサービスに接続できませんでした",
    });

    expect(options.status).toBe(429);
    expect(options.code).toBe("AI_STREAM_CONCURRENCY_EXCEEDED");
    expect(options.retryable).toBe(true);
  });

  it("extracts first validation message from array detail", () => {
    expect(messageFromFastApiDetail([{ msg: "field required" }])).toBe("field required");
  });
});
