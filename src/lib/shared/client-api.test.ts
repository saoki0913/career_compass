import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildJsonHeaders, deleteJson, patchJson, postJson, putJson, withQuery } from "./client-api";

function getFetchInit(callIndex = 0): RequestInit {
  return (fetch as ReturnType<typeof vi.fn>).mock.calls[callIndex][1] as RequestInit;
}

describe("buildJsonHeaders", () => {
  it("returns Content-Type application/json", () => {
    const headers = buildJsonHeaders();
    expect(headers["Content-Type"]).toBe("application/json");
  });
});

describe("withQuery", () => {
  it("appends query params to base path", () => {
    expect(withQuery("/api/test", { foo: "bar", baz: "qux" })).toBe(
      "/api/test?foo=bar&baz=qux",
    );
  });

  it("returns base path when no query", () => {
    expect(withQuery("/api/test")).toBe("/api/test");
    expect(withQuery("/api/test", {})).toBe("/api/test");
  });

  it("skips null/undefined values", () => {
    expect(withQuery("/api/test", { a: "1", b: null, c: undefined })).toBe(
      "/api/test?a=1",
    );
  });

  it("returns base path when all values are null", () => {
    expect(withQuery("/api/test", { a: null, b: undefined })).toBe("/api/test");
  });
});

describe("postJson", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends JSON with credentials and csrf header from an existing cookie", async () => {
    vi.stubGlobal("document", { cookie: "csrf_token=test-csrf" });
    vi.stubGlobal("window", {});

    await postJson("/api/test", { ok: true });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/test", expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ ok: true }),
    }));
    const headers = new Headers(getFetchInit().headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("x-csrf-token")).toBe("test-csrf");
  });

  it("initializes csrf cookie before POST when the cookie is missing", async () => {
    const documentState = { cookie: "" };
    vi.stubGlobal("document", documentState);
    vi.stubGlobal("window", {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((path: string) => {
        if (path === "/api/csrf") {
          documentState.cookie = "csrf_token=fetched-csrf";
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        return Promise.resolve(new Response("{}", { status: 200 }));
      }),
    );

    await postJson("/api/test", { ok: true });

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/csrf", expect.objectContaining({
      method: "GET",
      credentials: "include",
      cache: "no-store",
    }));
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/test", expect.objectContaining({
      method: "POST",
      credentials: "include",
    }));
    const headers = new Headers(getFetchInit(1).headers);
    expect(headers.get("x-csrf-token")).toBe("fetched-csrf");
  });

  it("does not require browser globals", async () => {
    await postJson("/api/test");

    expect(fetch).toHaveBeenCalledWith("/api/test", expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: undefined,
    }));
    const headers = new Headers(getFetchInit().headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("x-csrf-token")).toBeNull();
  });

  it("uses the same csrf-aware mutation path for PUT, PATCH, and DELETE", async () => {
    vi.stubGlobal("document", { cookie: "csrf_token=test-csrf" });
    vi.stubGlobal("window", {});

    await putJson("/api/test/1", { name: "updated" });
    await patchJson("/api/test/reorder", { ids: ["a", "b"] });
    await deleteJson("/api/test/1");

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/test/1", expect.objectContaining({
      method: "PUT",
      credentials: "include",
      body: JSON.stringify({ name: "updated" }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/test/reorder", expect.objectContaining({
      method: "PATCH",
      credentials: "include",
      body: JSON.stringify({ ids: ["a", "b"] }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(3, "/api/test/1", expect.objectContaining({
      method: "DELETE",
      credentials: "include",
      body: undefined,
    }));
    for (let index = 0; index < 3; index += 1) {
      const headers = new Headers(getFetchInit(index).headers);
      expect(headers.get("x-csrf-token")).toBe("test-csrf");
    }
  });
});
