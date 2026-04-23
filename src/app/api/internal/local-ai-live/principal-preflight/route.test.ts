import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchFastApiWithPrincipal = vi.fn();

vi.mock("@/lib/fastapi/client", () => ({
  fetchFastApiWithPrincipal,
}));

describe("GET /api/internal/local-ai-live/principal-preflight", () => {
  beforeEach(() => {
    fetchFastApiWithPrincipal.mockReset();
  });

  it("returns 404 outside localhost", async () => {
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("https://stg.shupass.jp/api/internal/local-ai-live/principal-preflight"));
    expect(response.status).toBe(404);
  });

  it("probes ai-stream and company scopes on localhost", async () => {
    fetchFastApiWithPrincipal
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, scope: "ai-stream" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, scope: "company", companyId: "local-ai-live-company" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://localhost:3000/api/internal/local-ai-live/principal-preflight"));

    expect(response.status).toBe(200);
    expect(fetchFastApiWithPrincipal).toHaveBeenCalledTimes(2);
    expect(fetchFastApiWithPrincipal.mock.calls[0][0]).toContain("/ai-stream");
    expect(fetchFastApiWithPrincipal.mock.calls[1][0]).toContain("/company");
  });
});
