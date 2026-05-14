import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  readFileSyncMock,
  checkRateLimitMock,
  createAnonymousRateLimitKeyMock,
} = vi.hoisted(() => ({
  readFileSyncMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  createAnonymousRateLimitKeyMock: vi.fn(),
}));

vi.mock("fs", () => ({
  default: {
    readFileSync: readFileSyncMock,
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  createAnonymousRateLimitKey: createAnonymousRateLimitKeyMock,
  RATE_LIMITS: {
    companySuggestions: { maxTokens: 40, refillRate: 1, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/redis", () => ({
  cacheGet: vi.fn((_key: string, fetcher: () => Promise<unknown>) => fetcher()),
}));

function makeRequest(path: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: {
      "x-forwarded-for": "203.0.113.10",
      "x-request-id": "req-suggestions-test",
    },
  });
}

describe("GET /api/companies/suggestions", () => {
  beforeEach(() => {
    vi.resetModules();
    readFileSyncMock.mockReset();
    checkRateLimitMock.mockReset().mockResolvedValue({
      allowed: true,
      remaining: 39,
      resetIn: 0,
    });
    createAnonymousRateLimitKeyMock
      .mockReset()
      .mockReturnValue("companySuggestions:anonymous-ip:test");
    readFileSyncMock.mockReturnValue(
      JSON.stringify({
        mappings: {
          _section_01: "=== IT・通信 ===",
          株式会社サンプル: ["サンプル"],
          サンプル銀行: ["銀行"],
        },
      })
    );
  });

  it("rate limits anonymous requests before reading company mappings", async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetIn: 17,
    });

    const { GET } = await import("./route");
    const response = await GET(makeRequest("/api/companies/suggestions?q=サンプル"));
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("17");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(payload.error.code).toBe("RATE_LIMITED");
    expect(createAnonymousRateLimitKeyMock).toHaveBeenCalledWith(
      "companySuggestions",
      expect.any(Headers)
    );
    expect(readFileSyncMock).not.toHaveBeenCalled();
  });

  it("returns no suggestions for one-character queries", async () => {
    const { GET } = await import("./route");
    const response = await GET(makeRequest("/api/companies/suggestions?q=サ"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ suggestions: [] });
    expect(readFileSyncMock).not.toHaveBeenCalled();
  });

  it("returns matching suggestions for two-character queries", async () => {
    const { GET } = await import("./route");
    const response = await GET(makeRequest("/api/companies/suggestions?q=サンプル"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.suggestions).toEqual([
      { name: "サンプル銀行", industry: "IT・通信" },
      { name: "株式会社サンプル", industry: "IT・通信" },
    ]);
  });
});
