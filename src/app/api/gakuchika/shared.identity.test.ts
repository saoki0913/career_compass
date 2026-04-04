import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getRequestIdentityMock } = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
}));

vi.mock("@/app/api/_shared/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

describe("api/gakuchika/shared getIdentity", () => {
  beforeEach(() => {
    vi.resetModules();
    getRequestIdentityMock.mockReset();
  });

  it("delegates to the shared request identity helper", async () => {
    const identity = { userId: "user-1", guestId: null };
    getRequestIdentityMock.mockResolvedValue(identity);

    const { getIdentity } = await import("./shared");
    const request = new NextRequest("http://localhost:3000/api/gakuchika/test-id/conversation/stream", {
      method: "POST",
    });

    await expect(getIdentity(request)).resolves.toEqual(identity);
    expect(getRequestIdentityMock).toHaveBeenCalledWith(request);
  });
});
