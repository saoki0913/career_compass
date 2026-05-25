import { describe, expect, it } from "vitest";

async function readSource() {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL("./SearchPageClient.tsx", import.meta.url), "utf8");
}

describe("SearchPageClient", () => {
  it("keeps search URL synchronization while using the shared filter surface", async () => {
    const source = await readSource();
    expect(source).toContain("ListPageFilterBar");
    expect(source).toContain("sanitizeSearchInput");
    expect(source).toContain("router.push(`/search?q=${encodeURIComponent(sanitizedQuery)}`)");
    expect(source).toContain('router.push("/search")');
    expect(source).toContain("onSearchSubmit={handleSubmit}");
    expect(source).toContain("onSearchClear={query ? handleClear : undefined}");
    expect(source).not.toContain("sortOptions={[]}");
    expect(source).not.toContain('sortBy=""');
  });
});
