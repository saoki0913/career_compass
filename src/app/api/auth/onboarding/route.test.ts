import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getSessionMock, dbSelectMock, dbUpdateMock, dbInsertMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  dbInsertMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: getSessionMock,
    },
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    update: dbUpdateMock,
    insert: dbInsertMock,
  },
}));

describe("api/auth/onboarding", () => {
  beforeEach(() => {
    vi.resetModules();
    getSessionMock.mockReset();
    dbSelectMock.mockReset();
    dbUpdateMock.mockReset();
    dbInsertMock.mockReset();

    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ id: "profile-1" }]),
        })),
      })),
    });
  });

  it("rejects empty onboarding payloads instead of marking completion", async () => {
    const { POST } = await import("@/app/api/auth/onboarding/route");
    const request = new NextRequest("http://localhost:3000/api/auth/onboarding", {
      method: "POST",
      body: JSON.stringify({}),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("At least one onboarding field is required");
    expect(dbUpdateMock).not.toHaveBeenCalled();
    expect(dbInsertMock).not.toHaveBeenCalled();
  });
});
