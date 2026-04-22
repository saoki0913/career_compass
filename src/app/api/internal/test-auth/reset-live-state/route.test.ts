import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  isCiE2EAuthEnabledMock,
  ensureCiE2ETestUserMock,
  resetCiE2ELiveStateMock,
} = vi.hoisted(() => ({
  isCiE2EAuthEnabledMock: vi.fn(),
  ensureCiE2ETestUserMock: vi.fn(),
  resetCiE2ELiveStateMock: vi.fn(),
}));

vi.mock("@/lib/auth/ci-e2e", () => ({
  isCiE2EAuthEnabled: isCiE2EAuthEnabledMock,
}));

vi.mock("@/app/api/internal/test-auth/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/api/internal/test-auth/shared")>();
  return {
    ...actual,
    ensureCiE2ETestUser: ensureCiE2ETestUserMock,
    resetCiE2ELiveState: resetCiE2ELiveStateMock,
  };
});

describe("api/internal/test-auth/reset-live-state", () => {
  beforeEach(() => {
    vi.resetModules();
    isCiE2EAuthEnabledMock.mockReset();
    ensureCiE2ETestUserMock.mockReset();
    resetCiE2ELiveStateMock.mockReset();

    process.env.CI_E2E_AUTH_SECRET = "top-secret";
    process.env.BETTER_AUTH_SECRET = "better-auth-secret";

    isCiE2EAuthEnabledMock.mockReturnValue(true);
    ensureCiE2ETestUserMock.mockResolvedValue({
      userId: "user-1",
      email: "ci@example.com",
      name: "CI",
      plan: "standard",
    });
    resetCiE2ELiveStateMock.mockResolvedValue({
      userId: "user-1",
      creditBalance: 1000,
      deletedCounts: {
        companies: 2,
        gakuchikaContents: 3,
        motivationConversationsReset: 1,
        interviewConversationsReset: 1,
        interviewFeedbackHistories: 4,
        interviewTurnEvents: 5,
        creditTransactionsDeleted: 6,
      },
    });
  });

  it("returns 404 when the route is disabled", async () => {
    isCiE2EAuthEnabledMock.mockReturnValue(false);
    const { POST } = await import("@/app/api/internal/test-auth/reset-live-state/route");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/internal/test-auth/reset-live-state", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CI_TEST_AUTH_DISABLED" },
    });
  });

  it("returns 401 when the bearer secret is invalid", async () => {
    const { POST } = await import("@/app/api/internal/test-auth/reset-live-state/route");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/internal/test-auth/reset-live-state", {
        method: "POST",
        headers: {
          Authorization: "Bearer wrong-secret",
        },
      }),
    );

    expect(response.status).toBe(401);
    expect(ensureCiE2ETestUserMock).not.toHaveBeenCalled();
    expect(resetCiE2ELiveStateMock).not.toHaveBeenCalled();
  });

  it("ensures the CI user and returns reset counts with the seeded credit balance", async () => {
    const { POST } = await import("@/app/api/internal/test-auth/reset-live-state/route");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/internal/test-auth/reset-live-state", {
        method: "POST",
        headers: {
          Authorization: "Bearer top-secret",
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      userId: "user-1",
      creditBalance: 1000,
      deletedCounts: {
        companies: 2,
        gakuchikaContents: 3,
        motivationConversationsReset: 1,
        interviewConversationsReset: 1,
      },
    });
    expect(ensureCiE2ETestUserMock).toHaveBeenCalledOnce();
    expect(resetCiE2ELiveStateMock).toHaveBeenCalledWith("user-1");
  });

  it("passes the CI scope header to test user resolution", async () => {
    const { POST } = await import("@/app/api/internal/test-auth/reset-live-state/route");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/internal/test-auth/reset-live-state", {
        method: "POST",
        headers: {
          Authorization: "Bearer top-secret",
          "x-ci-e2e-scope": "ai-live-123-gakuchika",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(ensureCiE2ETestUserMock).toHaveBeenCalledWith("ai-live-123-gakuchika");
  });
});
