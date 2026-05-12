import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("LoginRequiredForAi", () => {
  it("exports component", async () => {
    const mod = await import("./LoginRequiredForAi");
    expect(mod.LoginRequiredForAi).toBeDefined();
  });

  it("accepts feature-specific title, description, and fallbackAction props", async () => {
    const source = await readFile(new URL("./LoginRequiredForAi.tsx", import.meta.url), "utf8");
    expect(source).toContain("title: string");
    expect(source).toContain("description: string");
    expect(source).toContain("fallbackAction?:");
  });

  it("shows trust badges for quick registration", async () => {
    const source = await readFile(new URL("./LoginRequiredForAi.tsx", import.meta.url), "utf8");
    expect(source).toContain("30 秒で登録");
    expect(source).toContain("カード不要");
  });

  it("uses '無料で始める' as CTA instead of 'ログイン / 新規登録'", async () => {
    const source = await readFile(new URL("./LoginRequiredForAi.tsx", import.meta.url), "utf8");
    expect(source).toContain("無料で始める");
    expect(source).not.toContain("ログイン / 新規登録");
  });

  it("does not contain 'トップへ戻る' link", async () => {
    const source = await readFile(new URL("./LoginRequiredForAi.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("トップへ戻る");
  });

  it("renders a Lock icon", async () => {
    const source = await readFile(new URL("./LoginRequiredForAi.tsx", import.meta.url), "utf8");
    expect(source).toContain("Lock");
  });

  it("renders fallbackAction link when provided", async () => {
    const source = await readFile(new URL("./LoginRequiredForAi.tsx", import.meta.url), "utf8");
    expect(source).toContain("fallbackAction.href");
    expect(source).toContain("fallbackAction.label");
  });
});
