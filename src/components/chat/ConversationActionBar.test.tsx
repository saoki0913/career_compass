import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("ConversationActionBar", () => {
  it("makes helperText optional", async () => {
    const source = await readFile(new URL("./ConversationActionBar.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/helperText\?:/);
  });

  it("renders compact layout when helperText is absent", async () => {
    const source = await readFile(new URL("./ConversationActionBar.tsx", import.meta.url), "utf8");
    expect(source).toContain("hasHelper");
    expect(source).toContain('xl:grid-cols-[auto_auto]');
  });

  it("uses smaller padding and button height when no helper text", async () => {
    const source = await readFile(new URL("./ConversationActionBar.tsx", import.meta.url), "utf8");
    expect(source).toContain("py-1.5");
    expect(source).toContain('"h-9"');
  });
});
