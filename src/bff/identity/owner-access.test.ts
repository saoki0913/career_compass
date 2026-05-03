import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbSelectMock } = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
  },
}));

describe("owner-access", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects null owner identity", async () => {
    const { getOwnedDocument, hasOwnedCompany, isOwnedByIdentity } = await import("./owner-access");

    const identity = { userId: null, guestId: null };

    expect(isOwnedByIdentity({ userId: "user-1", guestId: null }, identity)).toBe(false);
    expect(isOwnedByIdentity({ userId: null, guestId: null }, identity)).toBe(false);
    await expect(hasOwnedCompany("company-1", identity)).resolves.toBe(false);
    await expect(getOwnedDocument("doc-1", identity)).resolves.toBeNull();
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("rejects mixed user and guest identity", async () => {
    const { hasOwnedApplication, isOwnedByIdentity } = await import("./owner-access");

    const identity = { userId: "user-1", guestId: "guest-1" };

    expect(isOwnedByIdentity({ userId: "user-1", guestId: null }, identity)).toBe(false);
    expect(isOwnedByIdentity({ userId: null, guestId: "guest-1" }, identity)).toBe(false);
    await expect(hasOwnedApplication("app-1", identity)).resolves.toBe(false);
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("matches authenticated user ownership only", async () => {
    const { isOwnedByIdentity } = await import("./owner-access");

    expect(
      isOwnedByIdentity(
        { userId: "user-1", guestId: null },
        { userId: "user-1", guestId: null },
      ),
    ).toBe(true);
    expect(
      isOwnedByIdentity(
        { userId: "user-2", guestId: null },
        { userId: "user-1", guestId: null },
      ),
    ).toBe(false);
  });

  it("matches guest ownership only", async () => {
    const { isOwnedByIdentity } = await import("./owner-access");

    expect(
      isOwnedByIdentity(
        { userId: null, guestId: "guest-1" },
        { userId: null, guestId: "guest-1" },
      ),
    ).toBe(true);
    expect(
      isOwnedByIdentity(
        { userId: null, guestId: "guest-2" },
        { userId: null, guestId: "guest-1" },
      ),
    ).toBe(false);
  });
});
