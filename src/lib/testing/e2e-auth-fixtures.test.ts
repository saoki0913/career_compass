import { describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../../e2e/fixtures/auth";

describe("e2e auth fixtures", () => {
  it("uses the browser context request client for authenticated API requests", async () => {
    const contextFetch = vi.fn().mockResolvedValue({ ok: () => true });
    const pageFetch = vi.fn().mockResolvedValue({ ok: () => true });

    const page = {
      evaluate: vi.fn().mockResolvedValue(null),
      context: () => ({
        request: {
          fetch: contextFetch,
        },
      }),
      request: {
        fetch: pageFetch,
      },
    };

    await apiRequest(
      page as never,
      "POST",
      "/api/companies",
      { name: "テスト会社" },
    );

    expect(contextFetch).toHaveBeenCalledTimes(1);
    expect(pageFetch).not.toHaveBeenCalled();
  });

  it("keeps guest company and document helpers on the guest token path", async () => {
    const contextFetch = vi.fn().mockResolvedValue({ ok: () => true, json: async () => ({}) });
    const evaluate = vi.fn().mockResolvedValue("guest-device-token");

    const page = {
      evaluate,
      context: () => ({
        request: {
          fetch: contextFetch,
        },
      }),
    };

    const auth = await import("../../../e2e/fixtures/auth");

    await auth.createGuestCompany(page as never, {
      name: "ゲスト企業",
    });
    await auth.createGuestDocument(page as never, {
      title: "ゲストES",
      type: "es",
    });

    expect(evaluate).toHaveBeenCalled();
    expect(contextFetch).toHaveBeenCalledTimes(2);
    expect(contextFetch.mock.calls[0]?.[1]?.headers).toMatchObject({
      "Content-Type": "application/json",
      "x-device-token": "guest-device-token",
    });
    expect(contextFetch.mock.calls[1]?.[1]?.headers).toMatchObject({
      "Content-Type": "application/json",
      "x-device-token": "guest-device-token",
    });
  });

  it("keeps owned company and document helpers off the guest token path", async () => {
    const contextFetch = vi.fn().mockResolvedValue({ ok: () => true, json: async () => ({}) });
    const evaluate = vi.fn().mockResolvedValue("guest-device-token");

    const page = {
      evaluate,
      context: () => ({
        request: {
          fetch: contextFetch,
        },
      }),
    };

    const auth = await import("../../../e2e/fixtures/auth");

    await auth.createOwnedCompany(page as never, {
      name: "認証済み企業",
    });
    await auth.deleteOwnedCompany(page as never, "company-id");
    await auth.createOwnedDocument(page as never, {
      title: "認証済みES",
      type: "es",
    });
    await auth.deleteOwnedDocument(page as never, "document-id");

    expect(evaluate).not.toHaveBeenCalled();
    expect(contextFetch).toHaveBeenCalledTimes(4);
    for (const call of contextFetch.mock.calls) {
      expect(call[1]?.headers).toMatchObject({
        "Content-Type": "application/json",
      });
      expect(call[1]?.headers).not.toHaveProperty("x-device-token");
    }
  });
});
