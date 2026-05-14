import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createGakuchika,
  deleteGakuchika,
  fetchGakuchikaConversation,
  fetchGakuchikaDetail,
  fetchGakuchikaList,
  generateGakuchikaEsDraft,
  reorderGakuchikas,
  resumeGakuchikaConversation,
  startGakuchikaConversation,
  streamGakuchikaConversation,
  updateGakuchikaTitle,
} from "@/lib/gakuchika/client-api";

describe("gakuchika client api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the existing gakuchika route contract with credentials", async () => {
    await fetchGakuchikaList();
    await fetchGakuchikaDetail("gaku-1");
    await fetchGakuchikaConversation("gaku-1");
    await fetchGakuchikaConversation("gaku-1", "session 1");
    await startGakuchikaConversation("gaku-1");
    await streamGakuchikaConversation("gaku-1", { answer: "回答", sessionId: "session-1" });
    await resumeGakuchikaConversation("gaku-1", { sessionId: "session-1" });
    await generateGakuchikaEsDraft("gaku-1", { charLimit: 400 });

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/gakuchika", {
      credentials: "include",
    });
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/gakuchika/gaku-1", {
      credentials: "include",
    });
    expect(fetch).toHaveBeenNthCalledWith(3, "/api/gakuchika/gaku-1/conversation", {
      credentials: "include",
    });
    expect(fetch).toHaveBeenNthCalledWith(4, "/api/gakuchika/gaku-1/conversation?sessionId=session%201", {
      credentials: "include",
    });
    expect(fetch).toHaveBeenNthCalledWith(
      5,
      "/api/gakuchika/gaku-1/conversation/new",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      6,
      "/api/gakuchika/gaku-1/conversation/stream",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ answer: "回答", sessionId: "session-1" }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      7,
      "/api/gakuchika/gaku-1/conversation/resume",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ sessionId: "session-1" }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      8,
      "/api/gakuchika/gaku-1/generate-es-draft",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ charLimit: 400 }),
      }),
    );
    const streamHeaders = new Headers(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[5][1].headers,
    );
    expect(streamHeaders.get("Content-Type")).toBe("application/json");
  });

  it("wraps list CRUD and reorder routes with csrf-aware mutation helpers", async () => {
    vi.stubGlobal("document", { cookie: "csrf_token=gaku-csrf" });
    vi.stubGlobal("window", {});

    await createGakuchika({ title: "テーマ", content: "内容", charLimitType: "400" });
    await updateGakuchikaTitle("gaku-1", "更新後");
    await deleteGakuchika("gaku-1");
    await reorderGakuchikas(["gaku-2", "gaku-1"]);

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/gakuchika", expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ title: "テーマ", content: "内容", charLimitType: "400" }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/gakuchika/gaku-1", expect.objectContaining({
      method: "PUT",
      credentials: "include",
      body: JSON.stringify({ title: "更新後" }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(3, "/api/gakuchika/gaku-1", expect.objectContaining({
      method: "DELETE",
      credentials: "include",
    }));
    expect(fetch).toHaveBeenNthCalledWith(4, "/api/gakuchika/reorder", expect.objectContaining({
      method: "PATCH",
      credentials: "include",
      body: JSON.stringify({ orderedIds: ["gaku-2", "gaku-1"] }),
    }));

    for (let index = 0; index < 4; index += 1) {
      const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[index][1];
      const headers = new Headers(init.headers);
      expect(headers.get("x-csrf-token")).toBe("gaku-csrf");
    }
  });

  it("adds csrf header to gakuchika stream POST through shared postJson", async () => {
    vi.stubGlobal("document", { cookie: "csrf_token=gaku-csrf" });
    vi.stubGlobal("window", {});

    await streamGakuchikaConversation("gaku-1", {
      answer: "回答",
      sessionId: "session-1",
    });

    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const headers = new Headers(init.headers);
    expect(headers.get("x-csrf-token")).toBe("gaku-csrf");
    expect(headers.get("Content-Type")).toBe("application/json");
  });
});
