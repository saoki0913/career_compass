import { describe, expect, it, vi } from "vitest";
import { apiRequest, apiRequestAsAuthenticatedUser } from "../../../e2e/fixtures/auth";

describe("e2e auth fixtures", () => {
  it("uses the browser context request client for authenticated API requests", async () => {
    const contextFetch = vi.fn().mockResolvedValue({ ok: () => true });
    const pageFetch = vi.fn().mockResolvedValue({ ok: () => true });
    const cookies = vi.fn().mockResolvedValue([
      { name: "csrf_token", value: "csrf-cookie" },
    ]);

    const page = {
      context: () => ({
        cookies,
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

    await apiRequestAsAuthenticatedUser(
      page as never,
      "POST",
      "/api/companies",
      { name: "認証済み会社" },
    );

    expect(contextFetch).toHaveBeenCalledTimes(2);
    expect(pageFetch).not.toHaveBeenCalled();
  });

  it("bootstraps a csrf token before state-changing requests when missing", async () => {
    const contextFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: () => true })
      .mockResolvedValueOnce({ ok: () => true });
    const cookies = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { name: "csrf_token", value: "csrf-cookie" },
      ]);

    const page = {
      context: () => ({
        cookies,
        request: {
          fetch: contextFetch,
        },
      }),
    };

    await apiRequestAsAuthenticatedUser(
      page as never,
      "POST",
      "/api/companies",
      { name: "認証済み会社" },
    );

    expect(contextFetch).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3000/api/csrf",
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(contextFetch).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3000/api/companies",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-csrf-token": "csrf-cookie",
        }),
      }),
    );
  });

  it("keeps guest company and document helpers on the guest token path", async () => {
    const contextFetch = vi.fn().mockResolvedValue({ ok: () => true, json: async () => ({}) });
    const cookies = vi.fn().mockResolvedValue([
      { name: "guest_device_token", value: "guest-device-token" },
      { name: "csrf_token", value: "csrf-cookie" },
    ]);

    const page = {
      context: () => ({
        cookies,
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

    expect(contextFetch).toHaveBeenCalledTimes(2);
    expect(contextFetch.mock.calls[0]?.[1]?.headers).toMatchObject({
      "Content-Type": "application/json",
      "x-csrf-token": "csrf-cookie",
      "x-device-token": "guest-device-token",
    });
    expect(contextFetch.mock.calls[1]?.[1]?.headers).toMatchObject({
      "Content-Type": "application/json",
      "x-csrf-token": "csrf-cookie",
      "x-device-token": "guest-device-token",
    });
  });

  it("keeps owned company and document helpers off the guest token path", async () => {
    const contextFetch = vi.fn().mockResolvedValue({ ok: () => true, json: async () => ({}) });
    const cookies = vi.fn().mockResolvedValue([
      { name: "better-auth.session_token", value: "session-cookie" },
      { name: "csrf_token", value: "csrf-cookie" },
    ]);

    const page = {
      context: () => ({
        cookies,
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

    expect(contextFetch).toHaveBeenCalledTimes(4);
    for (const call of contextFetch.mock.calls) {
      expect(call[1]?.headers).toMatchObject({
        "Content-Type": "application/json",
        "x-csrf-token": "csrf-cookie",
        cookie: "better-auth.session_token=session-cookie; csrf_token=csrf-cookie",
      });
      expect(call[1]?.headers).not.toHaveProperty("x-device-token");
    }
  });

  it("keeps guest application, task, notification, and gakuchika helpers on the guest token path", async () => {
    const contextFetch = vi.fn().mockResolvedValue({ ok: () => true, json: async () => ({}) });
    const cookies = vi.fn().mockResolvedValue([
      { name: "guest_device_token", value: "guest-device-token" },
      { name: "csrf_token", value: "csrf-cookie" },
    ]);

    const page = {
      context: () => ({
        cookies,
        request: {
          fetch: contextFetch,
        },
      }),
    };

    const auth = await import("../../../e2e/fixtures/auth");

    await auth.createGuestApplication(page as never, "company-id", {
      name: "ゲスト応募",
      type: "main",
    });
    await auth.deleteGuestApplication(page as never, "application-id");
    await auth.createGuestTask(page as never, {
      title: "ゲストタスク",
      type: "other",
    });
    await auth.deleteGuestTask(page as never, "task-id");
    await auth.createGuestNotification(page as never, {
      type: "daily_summary",
      title: "ゲスト通知",
      message: "ゲスト通知本文",
    });
    await auth.deleteGuestNotification(page as never, "notification-id");
    await auth.createGuestGakuchika(page as never, {
      title: "ゲストガクチカ",
      content: "内容",
      charLimitType: "400",
    });
    await auth.deleteGuestGakuchika(page as never, "gakuchika-id");

    expect(contextFetch).toHaveBeenCalledTimes(8);
    for (const call of contextFetch.mock.calls) {
      expect(call[1]?.headers).toMatchObject({
        "Content-Type": "application/json",
        "x-csrf-token": "csrf-cookie",
        "x-device-token": "guest-device-token",
      });
    }
  });

  it("keeps owned application, task, notification, and gakuchika helpers off the guest token path", async () => {
    const contextFetch = vi.fn().mockResolvedValue({ ok: () => true, json: async () => ({}) });
    const cookies = vi.fn().mockResolvedValue([
      { name: "better-auth.session_token", value: "session-cookie" },
      { name: "csrf_token", value: "csrf-cookie" },
    ]);

    const page = {
      context: () => ({
        cookies,
        request: {
          fetch: contextFetch,
        },
      }),
    };

    const auth = await import("../../../e2e/fixtures/auth");

    await auth.createOwnedApplication(page as never, "company-id", {
      name: "認証済み応募",
      type: "main",
    });
    await auth.deleteOwnedApplication(page as never, "application-id");
    await auth.createOwnedTask(page as never, {
      title: "認証済みタスク",
      type: "other",
    });
    await auth.deleteOwnedTask(page as never, "task-id");
    await auth.createOwnedNotification(page as never, {
      type: "daily_summary",
      title: "認証済み通知",
      message: "認証済み通知本文",
    });
    await auth.deleteOwnedNotification(page as never, "notification-id");
    await auth.createOwnedGakuchika(page as never, {
      title: "認証済みガクチカ",
      content: "内容",
      charLimitType: "400",
    });
    await auth.deleteOwnedGakuchika(page as never, "gakuchika-id");

    expect(contextFetch).toHaveBeenCalledTimes(8);
    for (const call of contextFetch.mock.calls) {
      expect(call[1]?.headers).toMatchObject({
        "Content-Type": "application/json",
        "x-csrf-token": "csrf-cookie",
        cookie: "better-auth.session_token=session-cookie; csrf_token=csrf-cookie",
      });
      expect(call[1]?.headers).not.toHaveProperty("x-device-token");
    }
  });

  it("for authenticated requests, forwards browser cookies as a cookie header", async () => {
    const contextFetch = vi.fn().mockResolvedValue({ ok: () => true, json: async () => ({}) });
    const cookies = vi.fn().mockResolvedValue([
      { name: "better-auth.session_token", value: "session-cookie" },
      { name: "csrf_token", value: "csrf-cookie" },
      { name: "other_cookie", value: "other-value" },
    ]);

    const page = {
      context: () => ({
        cookies,
        request: {
          fetch: contextFetch,
        },
      }),
    };

    await apiRequestAsAuthenticatedUser(
      page as never,
      "POST",
      "/api/companies",
      { name: "認証済み会社" },
    );

    expect(contextFetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/companies",
      expect.objectContaining({
        headers: expect.objectContaining({
          cookie: "better-auth.session_token=session-cookie; csrf_token=csrf-cookie; other_cookie=other-value",
        }),
      }),
    );
  });

  it("strips guest cookies from authenticated requests even when they exist in the browser context", async () => {
    const contextFetch = vi.fn().mockResolvedValue({ ok: () => true, json: async () => ({}) });
    const cookies = vi.fn().mockResolvedValue([
      { name: "better-auth.session_token", value: "session-cookie" },
      { name: "guest_device_token", value: "guest-device-token" },
      { name: "csrf_token", value: "csrf-cookie" },
      { name: "other_cookie", value: "other-value" },
    ]);

    const page = {
      context: () => ({
        cookies,
        request: {
          fetch: contextFetch,
        },
      }),
    };

    await apiRequestAsAuthenticatedUser(
      page as never,
      "POST",
      "/api/companies",
      { name: "認証済み会社" },
    );

    expect(contextFetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/companies",
      expect.objectContaining({
        headers: expect.objectContaining({
          cookie: "better-auth.session_token=session-cookie; csrf_token=csrf-cookie; other_cookie=other-value",
        }),
      }),
    );
    expect(contextFetch.mock.calls[0]?.[1]?.headers).not.toHaveProperty("x-device-token");
    expect(String(contextFetch.mock.calls[0]?.[1]?.headers?.cookie || "")).not.toContain("guest_device_token=");
  });
});
