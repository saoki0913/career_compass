import { describe, expect, it } from "vitest";

describe("motivation loading.tsx", () => {
  it("imports ConversationPageSkeleton", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./loading.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("ConversationPageSkeleton");
  });

  it("does not wrap in redundant h-screen container", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./loading.tsx", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("h-screen");
  });
});
