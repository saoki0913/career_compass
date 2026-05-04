import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getRequestIdentityMock,
  getOwnedDocumentMock,
  verifyGakuchikaAccessMock,
  dbInsertMock,
  dbSelectMock,
  dbDeleteMock,
} = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  getOwnedDocumentMock: vi.fn(),
  verifyGakuchikaAccessMock: vi.fn(),
  dbInsertMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbDeleteMock: vi.fn(),
}));

vi.mock("@/bff/identity/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock("@/bff/identity/owner-access", () => ({
  getOwnedDocument: getOwnedDocumentMock,
  hasValidOwnerIdentity: (identity: { userId: string | null; guestId: string | null }) =>
    Boolean(identity.userId) !== Boolean(identity.guestId),
}));

vi.mock("@/bff/gakuchika/access", () => ({
  verifyGakuchikaAccess: verifyGakuchikaAccessMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: dbInsertMock,
    select: dbSelectMock,
    delete: dbDeleteMock,
  },
}));

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

function makeRequest(method: string, body?: unknown) {
  return new NextRequest("http://localhost:3000/api/pins", {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "content-type": "application/json" } : undefined,
  });
}

describe("api/pins", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    dbInsertMock.mockReturnValue({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      })),
    });
    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ entityId: "doc-1" }]),
      })),
    });
    dbDeleteMock.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("rejects pinning a document owned by another principal", async () => {
    getOwnedDocumentMock.mockResolvedValueOnce(null);

    const { POST } = await import("./route");
    const response = await POST(makeRequest("POST", {
      entityType: "document",
      entityId: "doc-1",
    }));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error.code).toBe("PIN_TARGET_NOT_FOUND");
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("rejects mixed user and guest identity before owner checks", async () => {
    getRequestIdentityMock.mockResolvedValueOnce({ userId: "user-1", guestId: "guest-1" });

    const { POST } = await import("./route");
    const response = await POST(makeRequest("POST", {
      entityType: "gakuchika",
      entityId: "gaku-1",
    }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(verifyGakuchikaAccessMock).not.toHaveBeenCalled();
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("pins a document after owner check passes", async () => {
    getOwnedDocumentMock.mockResolvedValueOnce({ id: "doc-1", userId: "user-1", guestId: null });

    const { POST } = await import("./route");
    const response = await POST(makeRequest("POST", {
      entityType: "document",
      entityId: "doc-1",
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(dbInsertMock).toHaveBeenCalled();
  });

  it("rejects pinning a gakuchika entry without access", async () => {
    verifyGakuchikaAccessMock.mockResolvedValueOnce(false);

    const { POST } = await import("./route");
    const response = await POST(makeRequest("POST", {
      entityType: "gakuchika",
      entityId: "gaku-1",
    }));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error.code).toBe("PIN_TARGET_NOT_FOUND");
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("does not require target owner check when deleting an owned pin row", async () => {
    const { DELETE } = await import("./route");
    const response = await DELETE(makeRequest("DELETE", {
      entityType: "document",
      entityId: "doc-1",
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(getOwnedDocumentMock).not.toHaveBeenCalled();
    expect(dbDeleteMock).toHaveBeenCalled();
  });
});
