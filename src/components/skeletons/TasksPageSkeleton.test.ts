import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("TasksPageSkeleton", () => {
  it("uses py-10 outer padding matching TasksPageClient", async () => {
    const source = await readFile(
      new URL("./TasksPageSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("py-10");
  });

  it("has compact single-row priority card skeleton", async () => {
    const source = await readFile(
      new URL("./TasksPageSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("min-h-[44px]");
    expect(source).toContain("px-4 py-2");
  });

  it("renders 5-column kanban grid as default view", async () => {
    const source = await readFile(
      new URL("./TasksPageSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("lg:grid-cols-5");
    expect(source).toContain("length: 5");
  });

  it("includes header with responsive flex layout", async () => {
    const source = await readFile(
      new URL("./TasksPageSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("sm:flex-row sm:items-center sm:justify-between");
  });
});
