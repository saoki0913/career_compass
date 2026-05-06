import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  csrfMock,
  getSessionMock,
  createApiErrorResponseMock,
  stripeCheckoutCreateMock,
  stripeCustomerCreateMock,
} = vi.hoisted(() => ({
  csrfMock: vi.fn(),
  getSessionMock: vi.fn(),
  createApiErrorResponseMock: vi.fn(),
  stripeCheckoutCreateMock: vi.fn(),
  stripeCustomerCreateMock: vi.fn(),
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
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
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
    csrfMock.mockReturnValue(null);
    getSessionMock.mockResolvedValue({ user: { id: "user-1", email: "user@example.com" } });
    stripeCustomerCreateMock.mockResolvedValue({ id: "cus_1" });
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
});
