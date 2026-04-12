import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchGakuchikaConversation,
  fetchGakuchikaDetail,
  generateGakuchikaEsDraft,
  resumeGakuchikaConversation,
  startGakuchikaConversation,
  streamGakuchikaConversation,
} from "./client-api";

describe("gakuchika client api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
  });

  it("uses the existing gakuchika route contract with credentials", async () => {
    await fetchGakuchikaDetail("gaku-1");
    await fetchGakuchikaConversation("gaku-1");
    await fetchGakuchikaConversation("gaku-1", "session 1");
    await startGakuchikaConversation("gaku-1");
    await streamGakuchikaConversation("gaku-1", { answer: "回答", sessionId: "session-1" });
    await resumeGakuchikaConversation("gaku-1", { sessionId: "session-1" });
    await generateGakuchikaEsDraft("gaku-1", { charLimit: 400 });

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/gakuchika/gaku-1", {
      credentials: "include",
    });
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/gakuchika/gaku-1/conversation", {
      credentials: "include",
    });
    expect(fetch).toHaveBeenNthCalledWith(3, "/api/gakuchika/gaku-1/conversation?sessionId=session%201", {
      credentials: "include",
    });
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      "/api/gakuchika/gaku-1/conversation/new",
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      },
    );
    expect(fetch).toHaveBeenNthCalledWith(
      5,
      "/api/gakuchika/gaku-1/conversation/stream",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: "回答", sessionId: "session-1" }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      6,
      "/api/gakuchika/gaku-1/conversation/resume",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "session-1" }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      7,
      "/api/gakuchika/gaku-1/generate-es-draft",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ charLimit: 400 }),
      }),
    );
  });
});
