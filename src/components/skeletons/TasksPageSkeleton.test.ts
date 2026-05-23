import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("TasksPageSkeleton", () => {
  it("uses responsive outer padding matching TasksPageClient", async () => {
    const source = await readFile(
      new URL("./TasksPageSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("pt-8");
    expect(source).toContain("sm:pt-10");
    expect(source).toContain("lg:pt-10");
  });

  it("has responsive priority card skeleton", async () => {
    const source = await readFile(
      new URL("./TasksPageSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("min-h-[72px]");
    expect(source).toContain("md:min-h-[56px]");
  });

  it("renders responsive task grid", async () => {
    const source = await readFile(
      new URL("./TasksPageSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("md:grid-cols-2");
    expect(source).toContain("xl:grid-cols-5");
    expect(source).toContain("length: 5");
  });

  it("announces loading state", async () => {
    const source = await readFile(
      new URL("./TasksPageSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-busy="true"');
    expect(source).toContain("タスクを読み込んでいます");
  });

  it("supports embedded loading inside the client page", async () => {
    const source = await readFile(
      new URL("./TasksPageSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("embedded = false");
    expect(source).toContain("if (embedded)");
    expect(source).toContain("<TaskListSkeleton />");
    expect(source).toContain("<TaskGridSkeleton />");
  });
});
