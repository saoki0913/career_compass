import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { createApiErrorResponse } from "./error-response";

describe("createApiErrorResponse", () => {
  it("returns only user-facing error fields in the browser response body", async () => {
    const request = new NextRequest("http://localhost:3000/api/test", {
      headers: {
        "x-request-id": "req-structured",
      },
    });

    const response = createApiErrorResponse(request, {
      status: 500,
      code: "TEST_ERROR",
      userMessage: "ユーザー向けメッセージ",
      action: "再試行してください。",
      developerMessage: "Internal stack trace",
      details: "table=users",
    });

    const body = await response.json();

    expect(body).toEqual({
      error: {
        code: "TEST_ERROR",
        userMessage: "ユーザー向けメッセージ",
        action: "再試行してください。",
        retryable: false,
      },
      requestId: "req-structured",
    });
    expect(response.headers.get("X-Request-Id")).toBe("req-structured");
  });
});
