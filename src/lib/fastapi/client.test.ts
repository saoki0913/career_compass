import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalFetch = global.fetch;

describe("fetchFastApiWithPrincipal", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.CAREER_PRINCIPAL_HMAC_SECRET = "top-secret";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.CAREER_PRINCIPAL_HMAC_SECRET;
    vi.restoreAllMocks();
  });

  it("injects X-Career-Principal for ai-stream scope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    global.fetch = fetchMock as typeof fetch;

    const { fetchFastApiWithPrincipal } = await import("./client");

    await fetchFastApiWithPrincipal("/api/example", {
      method: "POST",
      principal: {
        scope: "ai-stream",
        actor: { kind: "guest", id: "guest-1" },
        plan: "guest",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("X-Career-Principal")).toBeTruthy();
  });

  it("injects X-Career-Principal for company scope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    global.fetch = fetchMock as typeof fetch;

    const { fetchFastApiWithPrincipal } = await import("./client");

    await fetchFastApiWithPrincipal("/company-info/fetch", {
      method: "GET",
      principal: {
        scope: "company",
        actor: { kind: "user", id: "user-1" },
        plan: "standard",
        companyId: "company-1",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("X-Career-Principal")).toBeTruthy();
  });
});
