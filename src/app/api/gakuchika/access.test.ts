import { describe, expect, it, vi } from "vitest";

const { getRequestIdentityMock, dbSelectMock } = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  dbSelectMock: vi.fn(),
}));

vi.mock("@/app/api/_shared/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
  },
}));

describe("api/gakuchika/access", () => {
  it("delegates to the shared request identity helper", async () => {
    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    const { getIdentity } = await import("./access");

    const identity = await getIdentity(new Request("http://localhost/api/gakuchika") as never);

    expect(identity).toEqual({ userId: "user-1", guestId: null });
  });

  it("allows access when guest ownership matches", async () => {
    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ id: "g-1", userId: null, guestId: "guest-1" }]),
        })),
      })),
    });

    const { verifyGakuchikaAccess } = await import("./access");

    await expect(verifyGakuchikaAccess("g-1", null, "guest-1")).resolves.toBe(true);
  });
});
