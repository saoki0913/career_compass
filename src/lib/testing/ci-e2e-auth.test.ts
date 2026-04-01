import { describe, expect, it } from "vitest";
import {
  buildCiE2EAuthFailureMessage,
  classifyCiE2EAuthResponse,
} from "./ci-e2e-auth";

describe("ci-e2e-auth diagnostics", () => {
  it("classifies disabled responses from the internal auth route", () => {
    expect(classifyCiE2EAuthResponse({ status: 404, errorCode: "CI_TEST_AUTH_DISABLED" })).toBe(
      "disabled",
    );
  });

  it("classifies raw 404 responses as a missing route", () => {
    expect(classifyCiE2EAuthResponse({ status: 404, errorCode: "" })).toBe("route_missing");
  });

  it("builds an actionable message with endpoint, request id, and response snippet", () => {
    const message = buildCiE2EAuthFailureMessage({
      status: 404,
      errorCode: "CI_TEST_AUTH_DISABLED",
      endpoint: "https://stg.shupass.jp/api/internal/test-auth/login",
      requestId: "req-123",
      responseSnippet: '{"error":{"code":"CI_TEST_AUTH_DISABLED"}}',
    });

    expect(message).toContain("CI E2E auth is disabled");
    expect(message).toContain("req-123");
    expect(message).toContain("https://stg.shupass.jp/api/internal/test-auth/login");
  });
});
