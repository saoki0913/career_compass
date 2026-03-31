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
});
