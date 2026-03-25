import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

describe("GET /api/csrf", () => {
  it("sets a csrf cookie when one is missing", async () => {
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://localhost:3000/api/csrf"));

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain("csrf_token=");
  });

  it("does not rotate the csrf cookie when one already exists", async () => {
    const { GET } = await import("./route");
    const request = new NextRequest("http://localhost:3000/api/csrf", {
      headers: {
        cookie: "csrf_token=existing-token",
      },
    });

    const response = await GET(request);

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
