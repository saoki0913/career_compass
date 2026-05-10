import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getRequestIdentityMock,
  dbSelectMock,
  dbUpdateMock,
  dbDeleteMock,
} = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  dbDeleteMock: vi.fn(),
}));

vi.mock("@/bff/identity/request-identity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/bff/identity/request-identity")>();
  return {
    ...actual,
    getRequestIdentity: getRequestIdentityMock,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    delete: dbDeleteMock,
    select: dbSelectMock,
    update: dbUpdateMock,
  },
}));

describe("api/submissions/[id]", () => {
  beforeEach(() => {
    getRequestIdentityMock.mockReset();
    dbSelectMock.mockReset();
    dbUpdateMock.mockReset();
    dbDeleteMock.mockReset();
    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
  });

  it("returns 404 when an owned update affects no rows", async () => {
    dbUpdateMock.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    const { PUT } = await import("./route");
    const response = await PUT(
      new NextRequest("http://localhost/api/submissions/submission-1", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "ES" }),
      }),
      { params: Promise.resolve({ id: "submission-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("SUBMISSION_NOT_FOUND");
  });

  it("keeps protected submission deletion as a business-rule 403", async () => {
    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ id: "submission-1", type: "es" }]),
        })),
      })),
    });

    const { DELETE } = await import("./route");
    const response = await DELETE(
      new NextRequest("http://localhost/api/submissions/submission-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "submission-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("SUBMISSION_PROTECTED");
    expect(dbDeleteMock).not.toHaveBeenCalled();
  });

  it("returns 404 for foreign-owner deletion before issuing delete", async () => {
    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    const { DELETE } = await import("./route");
    const response = await DELETE(
      new NextRequest("http://localhost/api/submissions/submission-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "submission-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("SUBMISSION_NOT_FOUND");
    expect(dbDeleteMock).not.toHaveBeenCalled();
  });

  it("returns 503 when strict identity resolution fails", async () => {
    const { RequestIdentitySessionError } = await import("@/bff/identity/request-identity");
    getRequestIdentityMock.mockRejectedValueOnce(new RequestIdentitySessionError(new Error("session down")));

    const { PUT } = await import("./route");
    const response = await PUT(
      new NextRequest("http://localhost/api/submissions/submission-1", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "ES" }),
      }),
      { params: Promise.resolve({ id: "submission-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("AUTH_SESSION_UNAVAILABLE");
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });
});
