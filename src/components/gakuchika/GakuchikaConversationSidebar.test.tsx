import { describe, expect, it } from "vitest";

describe("GakuchikaConversationSidebar", () => {
  it("module exports the component", async () => {
    const mod = await import("./GakuchikaConversationSidebar");
    expect(mod.GakuchikaConversationSidebar).toBeDefined();
  });
});
