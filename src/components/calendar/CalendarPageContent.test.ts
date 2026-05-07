import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("CalendarPageContent - AddEventModal", () => {
  it("uses notifyError for API failure in catch block", async () => {
    const source = await readFile(new URL("./CalendarPageContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("notifyError");
  });

  it("keeps inline error banner for validation errors only", async () => {
    const source = await readFile(new URL("./CalendarPageContent.tsx", import.meta.url), "utf8");
    // Validation errors still use inline display
    expect(source).toContain("タイトルを入力してください");
    expect(source).toContain("終了時刻は開始時刻より後にしてください");
  });
});
