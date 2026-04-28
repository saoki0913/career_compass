import { describe, expect, it, vi, beforeEach } from "vitest";

const { headersMock, getHeadersIdentityMock, getInitialSearchResultsMock, searchPageClientMock } =
  vi.hoisted(() => ({
    headersMock: vi.fn(),
    getHeadersIdentityMock: vi.fn(),
    getInitialSearchResultsMock: vi.fn(),
    searchPageClientMock: vi.fn(() => null),
  }));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("@/app/api/_shared/request-identity", () => ({
  getHeadersIdentity: getHeadersIdentityMock,
}));

vi.mock("@/lib/server/search-loader", () => ({
  getInitialSearchResults: getInitialSearchResultsMock,
}));

vi.mock("@/components/search/SearchPageClient", () => ({
  SearchPageClient: searchPageClientMock,
}));

describe("SearchPage", () => {
  beforeEach(() => {
    headersMock.mockReset().mockResolvedValue(new Headers());
    getHeadersIdentityMock.mockReset().mockResolvedValue({ userId: "user-1", guestId: null });
    getInitialSearchResultsMock.mockReset().mockResolvedValue({
      query: "OpenAI",
      results: { companies: [], documents: [], deadlines: [] },
      counts: { companies: 0, documents: 0, deadlines: 0, total: 0 },
    });
    searchPageClientMock.mockClear();
  });

  it("awaits searchParams and passes sanitized q to initial search", async () => {
    const { default: SearchPage } = await import("./page");

    const element = await SearchPage({
      searchParams: Promise.resolve({ q: "  ＯｐｅｎＡＩ  " }),
    });

    expect(getInitialSearchResultsMock).toHaveBeenCalledWith(
      { userId: "user-1", guestId: null },
      "OpenAI",
      { types: "all", limit: 10 }
    );
    expect(element.props.children.props).toEqual(expect.objectContaining({ initialQuery: "OpenAI" }));
  });

  it("uses the first q value when q is an array", async () => {
    const { default: SearchPage } = await import("./page");

    await SearchPage({
      searchParams: Promise.resolve({ q: ["first", "second"] }),
    });

    expect(getInitialSearchResultsMock).toHaveBeenCalledWith(
      { userId: "user-1", guestId: null },
      "first",
      { types: "all", limit: 10 }
    );
  });
});
