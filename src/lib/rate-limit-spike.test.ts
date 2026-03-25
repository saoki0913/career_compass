import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { checkRateLimitMock } = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  createRateLimitKey: vi.fn(() => "test:user-1"),
  RATE_LIMITS: {},
}));

describe("rate-limit-spike", () => {
  it("returns a structured 429 response", async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetIn: 42,
    });

    const { enforceRateLimitLayers } = await import("@/lib/rate-limit-spike");
    const request = new NextRequest("http://localhost:3000/api/companies/company-1/search-pages", {
      method: "POST",
      headers: {
        "x-request-id": "req-1",
      },
    });

    const response = await enforceRateLimitLayers(
      request,
      [{ limiterName: "companySearch", config: { maxTokens: 1, refillRate: 1, windowMs: 1_000 } }],
      "user-1",
      null,
      "companies_search_pages",
    );

    expect(response).not.toBeNull();
    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe("42");
    expect(response?.headers.get("X-Request-Id")).toBe("req-1");

    const data = await response?.json();
    expect(data.error.code).toBe("RATE_LIMITED");
    expect(data.error.userMessage).toBe("しばらく待ってから再試行してください。");
    expect(data.error.action).toContain("42");
  });
});
