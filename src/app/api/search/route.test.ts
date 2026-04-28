import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getRequestIdentityMock, performSearchMock, enforceRateLimitLayersMock } = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  performSearchMock: vi.fn(),
  enforceRateLimitLayersMock: vi.fn(),
}));

vi.mock("@/app/api/_shared/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock("@/lib/server/search-loader", () => ({
  performSearch: performSearchMock,
}));

vi.mock("@/lib/rate-limit-spike", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit-spike")>(
    "@/lib/rate-limit-spike"
  );
  return {
    ...actual,
    enforceRateLimitLayers: enforceRateLimitLayersMock,
  };
});

function makeRequest(url: string) {
  return new NextRequest(url, { headers: { "x-request-id": "req-search-test" } });
}

describe("api/search", () => {
  beforeEach(() => {
    getRequestIdentityMock.mockReset().mockResolvedValue({ userId: "user-1", guestId: null });
    performSearchMock.mockReset().mockResolvedValue({
      query: "OpenAI",
      results: { companies: [], documents: [], deadlines: [] },
      counts: { companies: 0, documents: 0, deadlines: 0, total: 0 },
    });
    enforceRateLimitLayersMock.mockReset().mockResolvedValue(null);
  });

  it("returns structured auth error without identity", async () => {
    getRequestIdentityMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");

    const response = await GET(makeRequest("http://localhost:3000/api/search?q=OpenAI"));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(response.headers.get("X-Request-Id")).toBe("req-search-test");
    expect(payload.error.code).toBe("SEARCH_AUTH_REQUIRED");
  });

  it("rejects invalid search types", async () => {
    const { GET } = await import("./route");

    const response = await GET(makeRequest("http://localhost:3000/api/search?q=OpenAI&types=bad"));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("SEARCH_INVALID_QUERY");
    expect(performSearchMock).not.toHaveBeenCalled();
  });

  it("applies rate limiting before searching", async () => {
    enforceRateLimitLayersMock.mockResolvedValueOnce(new Response("limited", { status: 429 }));
    const { GET } = await import("./route");

    const response = await GET(makeRequest("http://localhost:3000/api/search?q=OpenAI"));

    expect(response.status).toBe(429);
    expect(performSearchMock).not.toHaveBeenCalled();
  });

  it("returns search response for valid query", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      makeRequest("http://localhost:3000/api/search?q=OpenAI&types=companies&limit=3")
    );

    expect(response.status).toBe(200);
    expect(performSearchMock).toHaveBeenCalledWith(
      { userId: "user-1", guestId: null },
      { q: "OpenAI", types: "companies", limit: 3 }
    );
  });
});
