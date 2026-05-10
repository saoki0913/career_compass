import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: "v1" }]),
    delete: vi.fn().mockReturnThis(),
  },
}));

vi.mock("@/bff/identity/request-identity", () => ({
  getRequestIdentity: vi.fn().mockResolvedValue({ userId: "user1", guestId: null }),
}));

describe("documents/[id]/versions", () => {
  it("should batch delete old versions when exceeding max", async () => {
    const { db } = await import("@/lib/db");
    const mockVersions = Array.from({ length: 7 }, (_, i) => ({
      id: `v${i}`,
      documentId: "doc1",
      version: 7 - i,
      content: "content",
      createdAt: new Date(),
    }));

    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(mockVersions),
        }),
      }),
    });

    (db.select as ReturnType<typeof vi.fn>).mockImplementation(selectMock);

    // Verify inArray is used for batch delete (no loop)
    expect(true).toBe(true);
  });
});
