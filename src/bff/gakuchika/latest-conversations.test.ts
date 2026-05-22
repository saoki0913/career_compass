import { beforeEach, describe, expect, it, vi } from "vitest";

const { selectDistinctOnMock, fromMock, whereMock, orderByMock } = vi.hoisted(() => ({
  selectDistinctOnMock: vi.fn(),
  fromMock: vi.fn(),
  whereMock: vi.fn(),
  orderByMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    selectDistinctOn: selectDistinctOnMock,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  gakuchikaConversations: {
    id: "id",
    gakuchikaId: "gakuchikaId",
    status: "status",
    starScores: "starScores",
    questionCount: "questionCount",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  desc: vi.fn((value: unknown) => ({ direction: "desc", value })),
  inArray: vi.fn((column: unknown, values: unknown[]) => ({ column, values })),
}));

describe("loadLatestGakuchikaConversationsForOwnedContentIds", () => {
  beforeEach(() => {
    selectDistinctOnMock.mockReset();
    fromMock.mockReset();
    whereMock.mockReset();
    orderByMock.mockReset();
    orderByMock.mockResolvedValue([]);
    whereMock.mockReturnValue({ orderBy: orderByMock });
    fromMock.mockReturnValue({ where: whereMock });
    selectDistinctOnMock.mockReturnValue({ from: fromMock });
  });

  it("returns an empty list without querying when there are no owned content ids", async () => {
    const { loadLatestGakuchikaConversationsForOwnedContentIds } = await import("./latest-conversations");

    const result = await loadLatestGakuchikaConversationsForOwnedContentIds([]);

    expect(result).toEqual([]);
    expect(selectDistinctOnMock).not.toHaveBeenCalled();
  });

  it("uses a distinct latest-row query and maps Drizzle rows", async () => {
    orderByMock.mockResolvedValue([
      {
        id: "conv-2",
        gakuchikaId: "gk-1",
        status: "completed",
        starScores: { stage: "interview_ready" },
        questionCount: 5,
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
        updatedAt: new Date("2026-05-02T00:00:00.000Z"),
      },
    ]);
    const { loadLatestGakuchikaConversationsForOwnedContentIds } = await import("./latest-conversations");

    const result = await loadLatestGakuchikaConversationsForOwnedContentIds(["gk-1", "gk-2"]);

    expect(selectDistinctOnMock).toHaveBeenCalledWith(["gakuchikaId"], expect.any(Object));
    expect(whereMock).toHaveBeenCalledWith({ column: "gakuchikaId", values: ["gk-1", "gk-2"] });
    expect(orderByMock).toHaveBeenCalledWith(
      "gakuchikaId",
      { direction: "desc", value: "updatedAt" },
      { direction: "desc", value: "createdAt" },
      { direction: "desc", value: "id" },
    );
    expect(result).toEqual([
      {
        gakuchikaId: "gk-1",
        status: "completed",
        starScores: { stage: "interview_ready" },
        questionCount: 5,
      },
    ]);
  });
});
