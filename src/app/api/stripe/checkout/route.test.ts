import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  csrfMock,
  getSessionMock,
  createApiErrorResponseMock,
  stripeCheckoutCreateMock,
  stripeCustomerCreateMock,
  stripeSubscriptionsListMock,
  dbSelectLimitMock,
} = vi.hoisted(() => ({
  csrfMock: vi.fn(),
  getSessionMock: vi.fn(),
  createApiErrorResponseMock: vi.fn(),
  stripeCheckoutCreateMock: vi.fn(),
  stripeCustomerCreateMock: vi.fn(),
  stripeSubscriptionsListMock: vi.fn(),
  dbSelectLimitMock: vi.fn(),
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
    checkout: {
      sessions: {
        create: stripeCheckoutCreateMock,
      },
    },
    customers: {
      create: stripeCustomerCreateMock,
    },
    subscriptions: {
      list: stripeSubscriptionsListMock,
    },
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: dbSelectLimitMock,
        })),
      })),
    })),
  },
}));

vi.mock("@/lib/stripe/config", () => ({
  getPriceId: vi.fn(() => "price_test"),
}));

vi.mock("@/lib/app-url", () => ({
  getAppUrl: vi.fn(() => "http://localhost:3000"),
}));

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

vi.mock("@/bff/api/error-response", () => ({
  createApiErrorResponse: createApiErrorResponseMock,
}));

describe("POST /api/stripe/checkout", () => {
  beforeEach(() => {
    vi.resetModules();
    csrfMock.mockReset();
    getSessionMock.mockReset();
    createApiErrorResponseMock.mockReset();
    stripeCheckoutCreateMock.mockReset();
    stripeCustomerCreateMock.mockReset();
    stripeSubscriptionsListMock.mockReset();
    dbSelectLimitMock.mockReset();
    csrfMock.mockReturnValue(null);
    getSessionMock.mockResolvedValue({ user: { id: "user-1", email: "user@example.com" } });
    dbSelectLimitMock.mockResolvedValue([]);
    stripeCustomerCreateMock.mockResolvedValue({ id: "cus_1" });
    stripeSubscriptionsListMock.mockResolvedValue({ data: [] });
    stripeCheckoutCreateMock.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" });
    createApiErrorResponseMock.mockImplementation((request: unknown, payload: { status: number }) =>
      NextResponse.json(payload, { status: payload.status }),
    );
  });

  it("rejects missing CSRF before reading the session", async () => {
    csrfMock.mockReturnValue("missing");
    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost:3000/api/stripe/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: "standard" }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.code).toBe("CSRF_VALIDATION_FAILED");
    expect(getSessionMock).not.toHaveBeenCalled();
    expect(stripeCheckoutCreateMock).not.toHaveBeenCalled();
  });

  it("creates checkout with final-confirmation legal copy and required terms consent", async () => {
    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost:3000/api/stripe/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: "standard", period: "monthly" }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.url).toBe("https://checkout.stripe.test/cs_1");
    expect(stripeCheckoutCreateMock).toHaveBeenCalledTimes(1);
    const checkoutPayload = stripeCheckoutCreateMock.mock.calls[0][0];
    expect(checkoutPayload).toMatchObject({
      mode: "subscription",
      locale: "ja",
      consent_collection: {
        terms_of_service: "required",
      },
    });
    expect(checkoutPayload.custom_text.submit.message).toContain("自動更新");
    expect(checkoutPayload.custom_text.submit.message).toContain("お申込み時に即時決済");
    expect(checkoutPayload.custom_text.submit.message).toContain("更新日に自動請求");
    expect(checkoutPayload.custom_text.submit.message).toContain("解約");
    expect(checkoutPayload.custom_text.submit.message).toContain("次回更新日");
    expect(checkoutPayload.custom_text.submit.message).toContain("返金");
    expect(checkoutPayload.custom_text.submit.message).toContain("https://www.shupass.jp/legal");
    expect(checkoutPayload.custom_text.terms_of_service_acceptance.message).toContain("https://www.shupass.jp/terms");
    expect(checkoutPayload.custom_text.terms_of_service_acceptance.message).toContain("https://www.shupass.jp/legal");
  });

  it("rejects invalid billing period before creating a customer", async () => {
    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost:3000/api/stripe/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: "standard", period: "weekly" }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.code).toBe("STRIPE_CHECKOUT_INVALID_PERIOD");
    expect(stripeCustomerCreateMock).not.toHaveBeenCalled();
    expect(stripeCheckoutCreateMock).not.toHaveBeenCalled();
  });

  it("rejects checkout when the user already has an active subscription", async () => {
    dbSelectLimitMock.mockResolvedValue([
      {
        stripeCustomerId: "cus_existing",
        stripeSubscriptionId: "sub_existing",
        status: "active",
      },
    ]);

    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost:3000/api/stripe/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: "standard", period: "monthly" }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.code).toBe("STRIPE_CHECKOUT_ACTIVE_SUBSCRIPTION");
    expect(stripeSubscriptionsListMock).not.toHaveBeenCalled();
    expect(stripeCustomerCreateMock).not.toHaveBeenCalled();
    expect(stripeCheckoutCreateMock).not.toHaveBeenCalled();
  });

  it("rejects checkout when Stripe already has an active subscription for the customer", async () => {
    dbSelectLimitMock.mockResolvedValue([
      {
        stripeCustomerId: "cus_existing",
        stripeSubscriptionId: null,
        status: "free",
      },
    ]);
    stripeSubscriptionsListMock
      .mockResolvedValueOnce({ data: [{ id: "sub_active" }] })
      .mockResolvedValueOnce({ data: [] });

    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost:3000/api/stripe/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: "pro", period: "annual" }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.code).toBe("STRIPE_CHECKOUT_ACTIVE_SUBSCRIPTION");
    expect(stripeSubscriptionsListMock).toHaveBeenCalledTimes(2);
    expect(stripeSubscriptionsListMock).toHaveBeenCalledWith({
      customer: "cus_existing",
      status: "active",
      limit: 1,
    });
    expect(stripeSubscriptionsListMock).toHaveBeenCalledWith({
      customer: "cus_existing",
      status: "trialing",
      limit: 1,
    });
    expect(stripeCustomerCreateMock).not.toHaveBeenCalled();
    expect(stripeCheckoutCreateMock).not.toHaveBeenCalled();
  });

  it("rejects checkout when Stripe has a trialing subscription for the customer", async () => {
    dbSelectLimitMock.mockResolvedValue([
      {
        stripeCustomerId: "cus_existing",
        stripeSubscriptionId: null,
        status: "free",
      },
    ]);
    stripeSubscriptionsListMock
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ id: "sub_trialing" }] });

    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost:3000/api/stripe/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: "standard", period: "monthly" }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.code).toBe("STRIPE_CHECKOUT_ACTIVE_SUBSCRIPTION");
    expect(stripeCustomerCreateMock).not.toHaveBeenCalled();
    expect(stripeCheckoutCreateMock).not.toHaveBeenCalled();
  });
});
