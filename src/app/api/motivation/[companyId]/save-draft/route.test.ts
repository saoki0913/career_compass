import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getRequestIdentityMock,
  dbSelectMock,
  dbInsertMock,
  getMotivationConversationByConditionMock,
} = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbInsertMock: vi.fn(),
  getMotivationConversationByConditionMock: vi.fn(),
}));

vi.mock("@/app/api/_shared/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    insert: dbInsertMock,
  },
}));

vi.mock("@/lib/motivation/conversation-store", () => ({
  getMotivationConversationByCondition: getMotivationConversationByConditionMock,
}));

function makeCompanyQuery() {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([{ id: "company-1", name: "テスト株式会社" }]),
      })),
    })),
  };
}

describe("api/motivation/[companyId]/save-draft", () => {
  beforeEach(() => {
    getRequestIdentityMock.mockReset();
    dbSelectMock.mockReset();
    dbInsertMock.mockReset();
    getMotivationConversationByConditionMock.mockReset();

    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    dbSelectMock.mockReturnValue(makeCompanyQuery());
    dbInsertMock.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("creates a document from the generated draft only when the user explicitly saves", async () => {
    getMotivationConversationByConditionMock.mockResolvedValue({
      id: "conversation-1",
      generatedDraft: "志望動機の下書きです。",
      charLimitType: "500",
    });

    const { POST } = await import("@/app/api/motivation/[companyId]/save-draft/route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/motivation/company-1/save-draft", { method: "POST" }),
      { params: Promise.resolve({ companyId: "company-1" }) },
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.documentId).toEqual(expect.any(String));
    expect(dbInsertMock).toHaveBeenCalledTimes(1);
  });

  it("rejects the save when no generated draft exists", async () => {
    getMotivationConversationByConditionMock.mockResolvedValue({
      id: "conversation-1",
      generatedDraft: null,
      charLimitType: "400",
    });

    const { POST } = await import("@/app/api/motivation/[companyId]/save-draft/route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/motivation/company-1/save-draft", { method: "POST" }),
      { params: Promise.resolve({ companyId: "company-1" }) },
    );

    expect(response.status).toBe(409);
    expect(dbInsertMock).not.toHaveBeenCalled();
  });
});
