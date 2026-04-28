import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("SidebarSearch", () => {
  it("uses direct /search navigation instead of hidden SearchBar keyboard events", async () => {
    const source = await readFile(new URL("./SidebarSearch.tsx", import.meta.url), "utf8");
    expect(source).toContain("router.push(`/search?q=");
    expect(source).toContain('href="/search"');
    expect(source).toContain("onNavigate?.()");
    expect(source).toContain("onClick={onNavigate}");
    expect(source).toContain("minQueryLength: 2");
    expect(source).toContain("debounceMs: 300");
    expect(source).not.toContain("new KeyboardEvent");
    expect(source).not.toContain("SearchBar");
  });

  it("sanitizes the search query before navigating", async () => {
    const source = await readFile(new URL("./SidebarSearch.tsx", import.meta.url), "utf8");
    expect(source).toContain("sanitizeSearchInput(query)");
    expect(source).toContain("encodeURIComponent(sanitizedQuery)");
  });

  it("renders the expanded sidebar search as a search form", async () => {
    const source = await readFile(new URL("./SidebarSearch.tsx", import.meta.url), "utf8");
    expect(source).toContain('role="search"');
    expect(source).toContain('type="search"');
    expect(source).toContain('type="submit"');
    expect(source).toContain('aria-label="検索を実行"');
    expect(source).toContain('aria-label="検索キーワード"');
    expect(source).toContain("onSubmit={handleSubmit}");
  });

  it("renders a dropdown for sidebar search candidates", async () => {
    const source = await readFile(new URL("./SidebarSearch.tsx", import.meta.url), "utf8");
    expect(source).toContain("SearchResultItem");
    expect(source).toContain("すべての結果を見る");
    expect(source).toContain("一致する候補がありません");
    expect(source).toContain("isDropdownOpen");
  });
});
