import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("ConversationWorkspaceShell", () => {
  it("accepts titleExtra prop for rendering extra content after subtitle", async () => {
    const source = await readFile(new URL("./ConversationWorkspaceShell.tsx", import.meta.url), "utf8");
    expect(source).toContain("titleExtra");
    expect(source).toMatch(/titleExtra\??: ReactNode/);
  });

  it("renders titleExtra after subtitle in the header", async () => {
    const source = await readFile(new URL("./ConversationWorkspaceShell.tsx", import.meta.url), "utf8");
    const subtitleIdx = source.indexOf("{subtitle}");
    const titleExtraIdx = source.indexOf("{titleExtra}", subtitleIdx);
    expect(titleExtraIdx).toBeGreaterThan(subtitleIdx);
  });
});
