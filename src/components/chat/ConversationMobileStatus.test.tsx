import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("ConversationMobileStatus", () => {
  it("exports ConversationMobileStatus as named export", async () => {
    const source = await readFile(new URL("./ConversationMobileStatus.tsx", import.meta.url), "utf8");
    expect(source).toContain("export function ConversationMobileStatus");
  });

  it("uses ConversationProgressBar with inline variant", async () => {
    const source = await readFile(new URL("./ConversationMobileStatus.tsx", import.meta.url), "utf8");
    expect(source).toContain("ConversationProgressBar");
    expect(source).toContain('variant="inline"');
  });

  it("renders optional badges, actions, and children slots", async () => {
    const source = await readFile(new URL("./ConversationMobileStatus.tsx", import.meta.url), "utf8");
    expect(source).toContain("{badges}");
    expect(source).toContain("{actions}");
    expect(source).toContain("{children}");
  });

  it("uses xl:hidden breakpoint for collapsible children", async () => {
    const source = await readFile(new URL("./ConversationMobileStatus.tsx", import.meta.url), "utf8");
    expect(source).toContain("xl:hidden");
  });
});
