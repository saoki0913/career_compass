import { expect, test } from "@playwright/test";

test.describe("API route registration", () => {
  test("documents review stream route is registered", async ({ request, baseURL }) => {
    const origin = baseURL ?? "http://localhost:3000";
    const response = await request.post("/api/documents/__route_smoke__/review/stream", {
      headers: {
        origin,
        cookie: "csrf_token=route-smoke",
        "x-csrf-token": "route-smoke",
        "content-type": "application/json",
      },
      data: {
        content: "志望理由です",
        sectionTitle: "志望動機",
        sectionCharLimit: 400,
      },
    });
    const contentType = response.headers()["content-type"] ?? "";

    expect(contentType).not.toContain("text/html");
    expect(contentType).toContain("application/json");
    const body = await response.json();
    expect(body).toHaveProperty("error");
  });
});
