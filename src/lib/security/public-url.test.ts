import { afterEach, describe, expect, it, vi } from "vitest";

import { guardedFetch, validatePublicUrl } from "@/lib/security/public-url";

describe("public-url", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("rejects explicit private network addresses", async () => {
    const result = await validatePublicUrl("https://10.0.0.8/recruit");

    expect(result.allowed).toBe(false);
    expect(result.code).toBe("LOCAL_ADDRESS");
  });

  it("rejects explicit credentials and non-standard ports", async () => {
    const withCredentials = await validatePublicUrl("https://user:pass@example.com/recruit");
    const withPort = await validatePublicUrl("https://example.com:8443/recruit");

    expect(withCredentials.allowed).toBe(false);
    expect(withCredentials.code).toBe("URL_HAS_CREDENTIALS");
    expect(withPort.allowed).toBe(false);
    expect(withPort.code).toBe("INVALID_PORT");
  });

  it("revalidates redirect destinations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: "https://169.254.169.254/latest" },
        }),
      ),
    );

    await expect(guardedFetch("https://93.184.216.34/recruit")).rejects.toThrow(
      "内部アドレスにはアクセスできません。",
    );
  });
});
