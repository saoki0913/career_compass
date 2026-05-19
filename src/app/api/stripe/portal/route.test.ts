import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  csrfMock,
  dbLimitMock,
  getSessionMock,
  getPortalConfigurationIdMock,
  createApiErrorResponseMock,
  getAppUrlMock,
  getAppOriginMock,
  stripeCustomerRetrieveMock,
  stripeSubscriptionRetrieveMock,
  stripePortalCreateMock,
} = vi.hoisted(() => ({
  csrfMock: vi.fn(),
  dbLimitMock: vi.fn(),
  getSessionMock: vi.fn(),
  getPortalConfigurationIdMock: vi.fn(),
  createApiErrorResponseMock: vi.fn(),
  getAppUrlMock: vi.fn(),
  getAppOriginMock: vi.fn(),
  stripeCustomerRetrieveMock: vi.fn(),
  stripeSubscriptionRetrieveMock: vi.fn(),
  stripePortalCreateMock: vi.fn(),
}));

vi.mock("@/lib/csrf", () => ({
  getCsrfFailureReason: csrfMock,
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: getSessionMock,
    },
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    customers: {
      retrieve: stripeCustomerRetrieveMock,
    },
    subscriptions: {
      retrieve: stripeSubscriptionRetrieveMock,
    },
    billingPortal: {
      sessions: {
        create: stripePortalCreateMock,
      },
    },
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: dbLimitMock,
        })),
      })),
    })),
  },
}));

vi.mock("@/lib/app-url", () => ({
  getAppUrl: getAppUrlMock,
  getAppOrigin: getAppOriginMock,
}));

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

vi.mock("@/lib/stripe/config", () => ({
  getPortalConfigurationId: getPortalConfigurationIdMock,
}));

vi.mock("@/bff/api/error-response", () => ({
  createApiErrorResponse: createApiErrorResponseMock,
}));

const csrfHeaders = {
  Origin: "http://localhost:3000",
  cookie: "csrf_token=test-csrf",
  "x-csrf-token": "test-csrf",
};

describe("POST /api/stripe/portal", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    csrfMock.mockReset();
    dbLimitMock.mockReset();
    getSessionMock.mockReset();
    getPortalConfigurationIdMock.mockReset();
    createApiErrorResponseMock.mockReset();
    getAppUrlMock.mockReset();
    getAppOriginMock.mockReset();
    stripeCustomerRetrieveMock.mockReset();
    stripeSubscriptionRetrieveMock.mockReset();
    stripePortalCreateMock.mockReset();
    csrfMock.mockReturnValue(null);
    dbLimitMock.mockResolvedValue([]);
    getPortalConfigurationIdMock.mockReturnValue(null);
    getAppUrlMock.mockReturnValue("http://localhost:3000");
    getAppOriginMock.mockReturnValue("http://localhost:3000");
    createApiErrorResponseMock.mockImplementation((request: unknown, payload: { status: number }) =>
      NextResponse.json(payload, { status: payload.status }),
    );
  });

  it("rejects missing CSRF before reading the session", async () => {
    csrfMock.mockReturnValue("missing");
    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost:3000/api/stripe/portal", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
      },
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.code).toBe("CSRF_VALIDATION_FAILED");
    expect(getSessionMock).not.toHaveBeenCalled();
    expect(stripePortalCreateMock).not.toHaveBeenCalled();
  });

  it("rejects missing portal configuration in production before DB or Stripe calls", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "https://www.shupass.jp,https://shupass.jp");
    getAppOriginMock.mockReturnValue("https://www.shupass.jp");
    getSessionMock.mockResolvedValue({
      user: { id: "user_1", email: "user@example.com" },
      session: {},
    });
    const { POST } = await import("./route");

    const response = await POST(new NextRequest("http://localhost:3000/api/stripe/portal", {
      method: "POST",
      headers: {
        Origin: "https://www.shupass.jp",
        cookie: "csrf_token=test-csrf",
        "x-csrf-token": "test-csrf",
      },
    }));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.code).toBe("STRIPE_PORTAL_CONFIGURATION_REQUIRED");
    expect(dbLimitMock).not.toHaveBeenCalled();
    expect(stripePortalCreateMock).not.toHaveBeenCalled();
  });

  it("does not require portal configuration in staging", async () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "staging");
    vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "https://stg.shupass.jp");
    getAppUrlMock.mockReturnValue("https://stg.shupass.jp");
    getAppOriginMock.mockReturnValue("https://stg.shupass.jp");
    getSessionMock.mockResolvedValue({
      user: { id: "user_1", email: "user@example.com" },
      session: {},
    });
    dbLimitMock.mockResolvedValue([]);
    const { POST } = await import("./route");

    const response = await POST(new NextRequest("https://stg.shupass.jp/api/stripe/portal", {
      method: "POST",
      headers: {
        Origin: "https://stg.shupass.jp",
        cookie: "csrf_token=test-csrf",
        "x-csrf-token": "test-csrf",
      },
    }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.code).toBe("STRIPE_PORTAL_SUBSCRIPTION_REQUIRED");
    expect(dbLimitMock).toHaveBeenCalledOnce();
  });

  it("rejects Stripe customer owner mismatch before creating a portal session", async () => {
    getPortalConfigurationIdMock.mockReturnValue("bpc_live_123");
    getSessionMock.mockResolvedValue({
      user: { id: "user_1", email: "user@example.com" },
      session: {},
    });
    dbLimitMock.mockResolvedValue([{
      userId: "user_1",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
    }]);
    stripeCustomerRetrieveMock.mockResolvedValue({
      id: "cus_123",
      metadata: { userId: "user_2" },
    });
    const { POST } = await import("./route");

    const response = await POST(new NextRequest("http://localhost:3000/api/stripe/portal", {
      method: "POST",
      headers: csrfHeaders,
    }));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.code).toBe("STRIPE_PORTAL_CUSTOMER_OWNER_MISMATCH");
    expect(stripePortalCreateMock).not.toHaveBeenCalled();
  });

  it("rejects deleted Stripe customers before creating a portal session", async () => {
    getPortalConfigurationIdMock.mockReturnValue("bpc_live_123");
    getSessionMock.mockResolvedValue({
      user: { id: "user_1", email: "user@example.com" },
      session: {},
    });
    dbLimitMock.mockResolvedValue([{
      userId: "user_1",
      stripeCustomerId: "cus_deleted",
      stripeSubscriptionId: null,
    }]);
    stripeCustomerRetrieveMock.mockResolvedValue({ id: "cus_deleted", deleted: true });
    const { POST } = await import("./route");

    const response = await POST(new NextRequest("http://localhost:3000/api/stripe/portal", {
      method: "POST",
      headers: csrfHeaders,
    }));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.code).toBe("STRIPE_PORTAL_CUSTOMER_UNAVAILABLE");
    expect(stripePortalCreateMock).not.toHaveBeenCalled();
  });

  it("creates a portal session with a pinned configuration after ownership checks", async () => {
    getPortalConfigurationIdMock.mockReturnValue("bpc_live_123");
    getSessionMock.mockResolvedValue({
      user: { id: "user_1", email: "user@example.com" },
      session: {},
    });
    dbLimitMock.mockResolvedValue([{
      userId: "user_1",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
    }]);
    stripeCustomerRetrieveMock.mockResolvedValue({
      id: "cus_123",
      metadata: { userId: "user_1" },
    });
    stripeSubscriptionRetrieveMock.mockResolvedValue({
      id: "sub_123",
      customer: "cus_123",
    });
    stripePortalCreateMock.mockResolvedValue({ url: "https://billing.stripe.com/session" });
    const { POST } = await import("./route");

    const response = await POST(new NextRequest("http://localhost:3000/api/stripe/portal", {
      method: "POST",
      headers: csrfHeaders,
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.url).toBe("https://billing.stripe.com/session");
    expect(stripePortalCreateMock).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: "http://localhost:3000/settings?portal=return",
      configuration: "bpc_live_123",
    });
  });
});
