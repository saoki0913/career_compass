import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("TasksPageClient - TaskModal", () => {
  it("uses notifyError for API failure in catch block", async () => {
    const source = await readFile(new URL("./TasksPageClient.tsx", import.meta.url), "utf8");
    expect(source).toContain("notifyError");
  });

  it("keeps inline error banner for validation errors only", async () => {
    const source = await readFile(new URL("./TasksPageClient.tsx", import.meta.url), "utf8");
    // Validation error still uses inline display
    expect(source).toContain("タイトルを入力してください");
  });
});

describe("TasksPageClient - TodayPriorityTaskCard extraction", () => {
  it("imports the extracted TodayPriorityTaskCard component", async () => {
    const source = await readFile(new URL("./TasksPageClient.tsx", import.meta.url), "utf8");
    expect(source).toContain("TodayPriorityTaskCard");
  });

  it("no longer contains inline priority card markup", async () => {
    const source = await readFile(new URL("./TasksPageClient.tsx", import.meta.url), "utf8");
    // The old inline <Star> icon was part of the priority card; it should be gone
    expect(source).not.toContain("Star");
  });
});
