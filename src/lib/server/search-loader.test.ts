import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbSelectMock } = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
  },
}));

function makeCompanySearchQuery(result: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue(result),
        })),
      })),
    })),
  };
}

function makeDocumentSearchQuery(result: unknown[]) {
  return {
    from: vi.fn(() => ({
      leftJoin: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue(result),
          })),
        })),
      })),
    })),
  };
}

function makeDeadlineSearchQuery(result: unknown[]) {
  return {
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue(result),
          })),
        })),
      })),
    })),
  };
}

describe("performSearch", () => {
  beforeEach(() => {
    dbSelectMock.mockReset();
  });

  it("uses joined company names for documents and deadlines", async () => {
    const { performSearch } = await import("@/lib/server/search-loader");

    dbSelectMock
      .mockReturnValueOnce(
        makeCompanySearchQuery([
          {
            id: "company-1",
            name: "OpenAI",
            industry: "AI",
            notes: "研究開発",
            status: "interested",
          },
        ])
      )
      .mockReturnValueOnce(
        makeDocumentSearchQuery([
          {
            id: "doc-1",
            title: "OpenAI ES",
            contentForSnippet: JSON.stringify([{ type: "paragraph", content: "OpenAI の志望動機" }]),
            type: "es",
            companyId: "company-1",
            companyName: "OpenAI",
            updatedAt: new Date("2026-03-27T00:00:00.000Z"),
          },
        ])
      )
      .mockReturnValueOnce(
        makeDeadlineSearchQuery([
          {
            id: "deadline-1",
            title: "ES提出",
            description: "本選考",
            memo: null,
            type: "es",
            companyId: "company-1",
            companyName: "OpenAI",
            dueDate: new Date("2026-03-30T00:00:00.000Z"),
            completedAt: null,
          },
        ])
      );

    const result = await performSearch(
      { userId: "user-1", guestId: null },
      { q: "OpenAI", types: "all", limit: 5 }
    );

    expect(result.counts).toMatchObject({
      companies: 1,
      documents: 1,
      deadlines: 1,
      total: 3,
    });
    expect(result.results.documents[0]?.companyName).toBe("OpenAI");
    expect(result.results.deadlines[0]?.companyName).toBe("OpenAI");
  });

  it("does not hit the database when initial search has no identity", async () => {
    const { getInitialSearchResults } = await import("@/lib/server/search-loader");

    const result = await getInitialSearchResults(null, "OpenAI");

    expect(result).toBeNull();
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("does not hit the database when initial search sanitizes to empty", async () => {
    const { getInitialSearchResults } = await import("@/lib/server/search-loader");

    const result = await getInitialSearchResults({ userId: "user-1", guestId: null }, "\u0000\t\n");

    expect(result).toBeNull();
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("respects requested search types", async () => {
    const { performSearch } = await import("@/lib/server/search-loader");

    dbSelectMock.mockReturnValueOnce(makeCompanySearchQuery([]));

    await performSearch(
      { userId: "user-1", guestId: null },
      { q: "OpenAI", types: "companies", limit: 5 }
    );

    expect(dbSelectMock).toHaveBeenCalledTimes(1);
  });
});
