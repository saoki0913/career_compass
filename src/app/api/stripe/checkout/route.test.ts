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
  dbInsertValuesMock,
  dbOnConflictDoUpdateMock,
} = vi.hoisted(() => ({
  csrfMock: vi.fn(),
  getSessionMock: vi.fn(),
  createApiErrorResponseMock: vi.fn(),
  stripeCheckoutCreateMock: vi.fn(),
  stripeCustomerCreateMock: vi.fn(),
  stripeSubscriptionsListMock: vi.fn(),
  dbSelectLimitMock: vi.fn(),
  dbInsertValuesMock: vi.fn(),
  dbOnConflictDoUpdateMock: vi.fn(),
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
    insert: vi.fn(() => ({
      values: dbInsertValuesMock,
    })),
  },
}));

vi.mock("@/lib/stripe/config", () => ({
  getPriceId: vi.fn(() => "price_test"),
}));

vi.mock("@/lib/app-url", () => ({
  getAppUrl: vi.fn(() => "http://localhost:3000"),
  getAppOrigin: vi.fn(() => "http://localhost:3000"),
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
    dbInsertValuesMock.mockReset();
    dbOnConflictDoUpdateMock.mockReset();
    csrfMock.mockReturnValue(null);
    getSessionMock.mockResolvedValue({ user: { id: "user-1", email: "user@example.com" } });
    let selectCallCount = 0;
    dbSelectLimitMock.mockImplementation(async () => {
      selectCallCount += 1;
      return selectCallCount === 1 ? [] : [{ stripeCustomerId: "cus_1" }];
    });
    dbInsertValuesMock.mockReturnValue({
      onConflictDoUpdate: dbOnConflictDoUpdateMock,
    });
    dbOnConflictDoUpdateMock.mockResolvedValue(undefined);
    stripeCustomerCreateMock.mockResolvedValue({ id: "cus_1" });
    stripeSubscriptionsListMock.mockResolvedValue({ data: [] });
    stripeCheckoutCreateMock.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" });
    createApiErrorResponseMock.mockImplementation((request: unknown, payload: { status: number }) =>
      NextResponse.json(payload, { status: payload.status }),
    );
  });

  function makeCheckoutRequest(body: unknown) {
    return new NextRequest("http://localhost:3000/api/stripe/checkout", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        Origin: "http://localhost:3000",
      },
    });
  }

  it("rejects missing CSRF before reading the session", async () => {
    csrfMock.mockReturnValue("missing");
    const { POST } = await import("./route");
    const request = makeCheckoutRequest({ plan: "standard" });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.code).toBe("CSRF_VALIDATION_FAILED");
    expect(getSessionMock).not.toHaveBeenCalled();
    expect(stripeCheckoutCreateMock).not.toHaveBeenCalled();
  });

  it("creates checkout with final-confirmation legal copy and required terms consent", async () => {
    const { POST } = await import("./route");
    const request = makeCheckoutRequest({ plan: "standard", period: "monthly" });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.url).toBe("https://checkout.stripe.test/cs_1");
    expect(dbOnConflictDoUpdateMock).toHaveBeenCalledTimes(1);
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
    expect(checkoutPayload.success_url).toBe("http://localhost:3000/dashboard?checkout=return&session_id={CHECKOUT_SESSION_ID}&plan=standard");
    expect(checkoutPayload.cancel_url).toBe("http://localhost:3000/pricing?canceled=true");
  });

  it("uses the stored customer id after first-checkout customer persistence races", async () => {
    dbSelectLimitMock
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ stripeCustomerId: "cus_db_winner" }]);
    stripeCustomerCreateMock.mockResolvedValueOnce({ id: "cus_created_loser" });

    const { POST } = await import("./route");
    const request = makeCheckoutRequest({ plan: "standard", period: "monthly" });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(stripeCustomerCreateMock).toHaveBeenCalledTimes(1);
    expect(dbOnConflictDoUpdateMock).toHaveBeenCalledTimes(1);
    expect(stripeCheckoutCreateMock.mock.calls[0][0].customer).toBe("cus_db_winner");
  });

  it("returns LP pricing visitors to the LP pricing section on checkout cancel", async () => {
    const { POST } = await import("./route");
    const request = makeCheckoutRequest({
      plan: "standard",
      period: "monthly",
      cancelSource: "lp-pricing",
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    const checkoutPayload = stripeCheckoutCreateMock.mock.calls[0][0];
    expect(checkoutPayload.cancel_url).toBe("http://localhost:3000/?checkout=canceled&source=lp-pricing#pricing");
  });

  it("ignores unknown cancel sources instead of accepting arbitrary redirects", async () => {
    const { POST } = await import("./route");
    const request = makeCheckoutRequest({
      plan: "pro",
      period: "monthly",
      cancelSource: "https://evil.example/return",
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    const checkoutPayload = stripeCheckoutCreateMock.mock.calls[0][0];
    expect(checkoutPayload.cancel_url).toBe("http://localhost:3000/pricing?canceled=true");
  });

  it("passes an idempotencyKey derived from user, plan, period, and time bucket", async () => {
    const { POST } = await import("./route");
    const request = makeCheckoutRequest({ plan: "pro", period: "annual" });

    await POST(request);

    expect(stripeCheckoutCreateMock).toHaveBeenCalledTimes(1);
    const opts = stripeCheckoutCreateMock.mock.calls[0][1];
    expect(opts).toBeDefined();
    expect(typeof opts.idempotencyKey).toBe("string");
    expect(opts.idempotencyKey.length).toBe(64); // SHA-256 hex digest
  });

  it("rejects invalid billing period before creating a customer", async () => {
    const { POST } = await import("./route");
    const request = makeCheckoutRequest({ plan: "standard", period: "weekly" });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.code).toBe("STRIPE_CHECKOUT_INVALID_PERIOD");
    expect(stripeCustomerCreateMock).not.toHaveBeenCalled();
    expect(stripeCheckoutCreateMock).not.toHaveBeenCalled();
  });

  it("rejects a banned user before creating a customer", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "user-1", email: "user@example.com", banned: true, banExpires: null },
    });
    const { POST } = await import("./route");
    const request = makeCheckoutRequest({ plan: "standard", period: "monthly" });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.code).toBe("AUTH_REQUIRED");
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
    const request = makeCheckoutRequest({ plan: "standard", period: "monthly" });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.code).toBe("STRIPE_CHECKOUT_ACTIVE_SUBSCRIPTION");
    expect(stripeSubscriptionsListMock).not.toHaveBeenCalled();
    expect(stripeCustomerCreateMock).not.toHaveBeenCalled();
    expect(stripeCheckoutCreateMock).not.toHaveBeenCalled();
  });

  it("rejects checkout when the user already has a past_due subscription", async () => {
    dbSelectLimitMock.mockResolvedValue([
      {
        stripeCustomerId: "cus_existing",
        stripeSubscriptionId: "sub_existing",
        status: "past_due",
      },
    ]);

    const { POST } = await import("./route");
    const response = await POST(makeCheckoutRequest({ plan: "standard", period: "monthly" }));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.code).toBe("STRIPE_CHECKOUT_ACTIVE_SUBSCRIPTION");
    expect(stripeSubscriptionsListMock).not.toHaveBeenCalled();
    expect(stripeCheckoutCreateMock).not.toHaveBeenCalled();
  });

  it("rejects checkout when Stripe already has a non-terminal subscription for the customer", async () => {
    dbSelectLimitMock.mockResolvedValue([
      {
        stripeCustomerId: "cus_existing",
        stripeSubscriptionId: null,
        status: "free",
      },
    ]);
    stripeSubscriptionsListMock.mockResolvedValueOnce({
      data: [
        { id: "sub_canceled", status: "canceled" },
        { id: "sub_unpaid", status: "unpaid" },
      ],
    });

    const { POST } = await import("./route");
    const request = makeCheckoutRequest({ plan: "pro", period: "annual" });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.code).toBe("STRIPE_CHECKOUT_ACTIVE_SUBSCRIPTION");
    expect(stripeSubscriptionsListMock).toHaveBeenCalledTimes(1);
    expect(stripeSubscriptionsListMock).toHaveBeenCalledWith({
      customer: "cus_existing",
      status: "all",
      limit: 100,
    });
    expect(stripeCustomerCreateMock).not.toHaveBeenCalled();
    expect(stripeCheckoutCreateMock).not.toHaveBeenCalled();
  });

  it("creates checkout when Stripe only has terminal subscriptions for the customer", async () => {
    dbSelectLimitMock.mockResolvedValue([
      {
        stripeCustomerId: "cus_existing",
        stripeSubscriptionId: null,
        status: "free",
      },
    ]);
    stripeSubscriptionsListMock.mockResolvedValueOnce({
      data: [
        { id: "sub_canceled", status: "canceled" },
        { id: "sub_expired", status: "incomplete_expired" },
      ],
    });

    const { POST } = await import("./route");
    const request = makeCheckoutRequest({ plan: "standard", period: "monthly" });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(stripeCustomerCreateMock).not.toHaveBeenCalled();
    expect(stripeCheckoutCreateMock).toHaveBeenCalledTimes(1);
  });
});
