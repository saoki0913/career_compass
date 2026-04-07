import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  constructEventMock,
  dbInsertValuesMock,
  dbDeleteWhereMock,
  dbSelectLimitMock,
  dbUpdateWhereMock,
  updatePlanAllocationMock,
} = vi.hoisted(() => ({
  constructEventMock: vi.fn(),
  dbInsertValuesMock: vi.fn(),
  dbDeleteWhereMock: vi.fn(),
  dbSelectLimitMock: vi.fn(),
  dbUpdateWhereMock: vi.fn(),
  updatePlanAllocationMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "stripe-signature": "sig_test" })),
}));

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: {
      constructEvent: constructEventMock,
    },
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: dbInsertValuesMock,
    })),
    delete: vi.fn(() => ({
      where: dbDeleteWhereMock,
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: dbSelectLimitMock,
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: dbUpdateWhereMock,
      })),
    })),
  },
}));

vi.mock("@/lib/credits", () => ({
  updatePlanAllocation: updatePlanAllocationMock,
}));

describe("api/webhooks/stripe subscription.updated", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    vi.stubEnv("STRIPE_PRICE_STANDARD_MONTHLY", "price_std_month");
    vi.stubEnv("STRIPE_PRICE_STANDARD_ANNUAL", "price_std_year");
    vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "price_pro_month");
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", "price_pro_year");
    constructEventMock.mockReset();
    dbInsertValuesMock.mockReset();
    dbDeleteWhereMock.mockReset();
    dbSelectLimitMock.mockReset();
    dbUpdateWhereMock.mockReset();
    updatePlanAllocationMock.mockReset();

    dbInsertValuesMock.mockResolvedValue(undefined);
    dbDeleteWhereMock.mockResolvedValue(undefined);
    dbSelectLimitMock.mockResolvedValue([
      {
        userId: "user-1",
        stripePriceId: "price_std_month",
      },
    ]);
    dbUpdateWhereMock.mockResolvedValue(undefined);
  });

  it("does not reallocate credits on renewal when the price id is unchanged", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_1",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          status: "active",
          cancel_at_period_end: false,
          items: {
            data: [
              {
                current_period_end: 1777561200,
                price: { id: "price_std_month" },
              },
            ],
          },
        },
      },
    });

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(new Request("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationMock).not.toHaveBeenCalled();
  });

  it("releases the claimed event when processing fails so Stripe can retry", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_retryable",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_retryable",
          status: "active",
          cancel_at_period_end: false,
          items: {
            data: [
              {
                current_period_end: 1777561200,
                price: { id: "price_pro_month" },
              },
            ],
          },
        },
      },
    });
    updatePlanAllocationMock.mockRejectedValueOnce(new Error("credits unavailable"));

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(new Request("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(500);
    expect(dbDeleteWhereMock).toHaveBeenCalledTimes(1);
  });
});
