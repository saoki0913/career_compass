import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getRequestIdentityMock,
  getOwnedApplicationRecordMock,
  dbUpdateMock,
} = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  getOwnedApplicationRecordMock: vi.fn(),
  dbUpdateMock: vi.fn(),
}));

vi.mock("@/bff/identity/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock("@/bff/identity/owner-access", () => ({
  getOwnedApplicationRecord: getOwnedApplicationRecordMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    update: dbUpdateMock,
    select: vi.fn(),
    delete: vi.fn(),
  },
}));

function makePutRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/applications/app-1", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

describe("api/applications/[id] PUT", () => {
  beforeEach(() => {
    vi.resetModules();
    getRequestIdentityMock.mockReset();
    getOwnedApplicationRecordMock.mockReset();
    dbUpdateMock.mockReset();
    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    getOwnedApplicationRecordMock.mockResolvedValue({
      id: "app-1",
      companyId: "company-1",
      userId: "user-1",
      guestId: null,
    });
  });

  it("rejects non-string-array phase payloads before writing jsonb", async () => {
    const { PUT } = await import("./route");

    const response = await PUT(makePutRequest({ phase: ["ES提出", 1] }), {
      params: Promise.resolve({ id: "app-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("無効な選考フェーズです");
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("writes validated phase as an array, not a JSON string", async () => {
    const returning = vi.fn().mockResolvedValue([
      {
        id: "app-1",
        companyId: "company-1",
        phase: ["ES提出"],
        updatedAt: new Date("2026-05-01T00:00:00.000Z"),
      },
    ]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    dbUpdateMock.mockReturnValue({ set });

    const { PUT } = await import("./route");
    const response = await PUT(makePutRequest({ phase: ["ES提出"] }), {
      params: Promise.resolve({ id: "app-1" }),
    });

    expect(response.status).toBe(200);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ phase: ["ES提出"] }));
  });
});
