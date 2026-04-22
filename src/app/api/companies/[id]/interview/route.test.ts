import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getRequestIdentityMock,
  buildInterviewContextMock,
  normalizeInterviewPersistenceErrorMock,
  createInterviewPersistenceUnavailableResponseMock,
} = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  buildInterviewContextMock: vi.fn(),
  normalizeInterviewPersistenceErrorMock: vi.fn(),
  createInterviewPersistenceUnavailableResponseMock: vi.fn(),
}));

vi.mock("@/app/api/_shared/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock(".", () => ({
  buildInterviewContext: buildInterviewContextMock,
}));

vi.mock("./persistence-errors", () => ({
  normalizeInterviewPersistenceError: normalizeInterviewPersistenceErrorMock,
  createInterviewPersistenceUnavailableResponse: createInterviewPersistenceUnavailableResponseMock,
}));

describe("api/companies/[id]/interview", () => {
  beforeEach(() => {
    getRequestIdentityMock.mockReset();
    buildInterviewContextMock.mockReset();
    normalizeInterviewPersistenceErrorMock.mockReset();
    createInterviewPersistenceUnavailableResponseMock.mockReset();

    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    createInterviewPersistenceUnavailableResponseMock.mockReturnValue(
      Response.json({ error: { code: "INTERVIEW_PERSISTENCE_UNAVAILABLE" } }, { status: 503 }),
    );
  });

  it("returns 503 when interview persistence schema is unavailable", async () => {
    const { GET } = await import("./route");
    const dbError = new Error("relation does not exist");
    const normalized = {
      code: "INTERVIEW_PERSISTENCE_UNAVAILABLE",
      companyId: "company-1",
      operation: "interview:get",
      missingTables: ["interview_conversations"],
    };
    buildInterviewContextMock.mockRejectedValue(dbError);
    normalizeInterviewPersistenceErrorMock.mockReturnValue(normalized);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/companies/company-1/interview"),
      { params: Promise.resolve({ id: "company-1" }) },
    );

    expect(response.status).toBe(503);
    expect(normalizeInterviewPersistenceErrorMock).toHaveBeenCalledWith(dbError, {
      companyId: "company-1",
      operation: "interview:get",
    });
    expect(createInterviewPersistenceUnavailableResponseMock).toHaveBeenCalled();
  });
});
