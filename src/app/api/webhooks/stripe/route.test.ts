import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  constructEventMock,
  subscriptionsRetrieveMock,
  invoicesRetrieveMock,
  chargesRetrieveMock,
  dbInsertValuesMock,
  dbDeleteWhereMock,
  dbSelectLimitMock,
  dbUpdateWhereMock,
  updatePlanAllocationMock,
} = vi.hoisted(() => ({
  constructEventMock: vi.fn(),
  subscriptionsRetrieveMock: vi.fn(),
  invoicesRetrieveMock: vi.fn(),
  chargesRetrieveMock: vi.fn(),
  dbInsertValuesMock: vi.fn(),
  dbDeleteWhereMock: vi.fn(),
  dbSelectLimitMock: vi.fn(),
  dbUpdateWhereMock: vi.fn(),
  updatePlanAllocationMock: vi.fn(),
}));

const futurePeriodEnd = () => Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

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
    subscriptions: {
      retrieve: subscriptionsRetrieveMock,
    },
    invoices: {
      retrieve: invoicesRetrieveMock,
    },
    charges: {
      retrieve: chargesRetrieveMock,
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
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        insert: vi.fn(() => ({ values: vi.fn() })),
        update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
      };
      await fn(tx);
    }),
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
    subscriptionsRetrieveMock.mockReset();
    invoicesRetrieveMock.mockReset();
    chargesRetrieveMock.mockReset();
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
        billingHoldStripeDisputeId: "dp_1",
      },
    ]);
    dbUpdateWhereMock.mockResolvedValue(undefined);
  });

  it("ensures plan allocation on renewal through an idempotent helper", async () => {
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
                current_period_end: futurePeriodEnd(),
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
    expect(updatePlanAllocationMock).toHaveBeenCalledWith("user-1", "standard");
  });

  it("treats unique idempotency claim failure as a duplicate event", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_duplicate",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_duplicate",
          status: "active",
          cancel_at_period_end: false,
          items: {
            data: [
              {
                current_period_end: futurePeriodEnd(),
                price: { id: "price_std_month" },
              },
            ],
          },
        },
      },
    });
    dbInsertValuesMock.mockRejectedValueOnce({ code: "23505" });

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(new Request("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(dbDeleteWhereMock).not.toHaveBeenCalled();
    expect(dbUpdateWhereMock).not.toHaveBeenCalled();
    expect(updatePlanAllocationMock).not.toHaveBeenCalled();
  });

  it("fails closed when idempotency claim fails for a non-unique database error", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_claim_failure",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_claim_failure",
          status: "active",
          cancel_at_period_end: false,
          items: {
            data: [
              {
                current_period_end: futurePeriodEnd(),
                price: { id: "price_std_month" },
              },
            ],
          },
        },
      },
    });
    dbInsertValuesMock.mockRejectedValueOnce(new Error("database unavailable"));

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(new Request("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(500);
    expect(dbDeleteWhereMock).not.toHaveBeenCalled();
    expect(dbUpdateWhereMock).not.toHaveBeenCalled();
    expect(updatePlanAllocationMock).not.toHaveBeenCalled();
  });

  it("fails closed before updating subscription state when the price id is unknown", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_unknown_price",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_unknown_price",
          status: "active",
          cancel_at_period_end: false,
          items: {
            data: [
              {
                current_period_end: futurePeriodEnd(),
                price: { id: "price_unknown" },
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

    expect(response.status).toBe(500);
    expect(dbDeleteWhereMock).not.toHaveBeenCalled();
    expect(dbSelectLimitMock).toHaveBeenCalledTimes(1);
    expect(dbUpdateWhereMock).toHaveBeenCalledTimes(1);
    expect(updatePlanAllocationMock).not.toHaveBeenCalled();
  });

  it("updates subscription price before ensuring credit allocation", async () => {
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
                current_period_end: futurePeriodEnd(),
                price: { id: "price_pro_month" },
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
    expect(dbUpdateWhereMock).toHaveBeenCalledTimes(3);
    expect(updatePlanAllocationMock).toHaveBeenCalledWith("user-1", "pro");
    expect(dbUpdateWhereMock.mock.invocationCallOrder[0]).toBeLessThan(
      updatePlanAllocationMock.mock.invocationCallOrder[0],
    );
  });
});

describe("api/webhooks/stripe checkout.session.completed", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    vi.stubEnv("STRIPE_PRICE_STANDARD_MONTHLY", "price_std_month");
    vi.stubEnv("STRIPE_PRICE_STANDARD_ANNUAL", "price_std_year");
    vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "price_pro_month");
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", "price_pro_year");
    constructEventMock.mockReset();
    subscriptionsRetrieveMock.mockReset();
    invoicesRetrieveMock.mockReset();
    chargesRetrieveMock.mockReset();
    dbInsertValuesMock.mockReset();
    dbDeleteWhereMock.mockReset();
    dbSelectLimitMock.mockReset();
    dbUpdateWhereMock.mockReset();
    updatePlanAllocationMock.mockReset();

    dbInsertValuesMock.mockResolvedValue(undefined);
    dbDeleteWhereMock.mockResolvedValue(undefined);
    dbUpdateWhereMock.mockResolvedValue(undefined);
  });

  it("resolves plan from priceId, ignoring metadata.plan", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_checkout_1",
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { userId: "user-1", plan: "pro" },
          subscription: "sub_checkout_1",
          customer: "cus_1",
        },
      },
    });

    subscriptionsRetrieveMock.mockResolvedValue({
      id: "sub_checkout_1",
      status: "active",
      cancel_at_period_end: false,
      items: {
        data: [
          {
            current_period_end: futurePeriodEnd(),
            price: { id: "price_std_month" },
          },
        ],
      },
    });

    // No existing subscription — new insert path
    dbSelectLimitMock.mockResolvedValue([]);

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(
      new Request("http://localhost:3000/api/webhooks/stripe", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).toBe(200);
    // metadata.plan was "pro" but priceId maps to "standard" — metadata must be ignored
    expect(updatePlanAllocationMock).toHaveBeenCalledWith("user-1", "standard");
  });

  it("fails closed and releases the claimed event when checkout price id is unknown", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_checkout_unknown",
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { userId: "user-1", plan: "standard" },
          subscription: "sub_checkout_unknown",
          customer: "cus_1",
        },
      },
    });

    subscriptionsRetrieveMock.mockResolvedValue({
      id: "sub_checkout_unknown",
      status: "active",
      cancel_at_period_end: false,
      items: {
        data: [
          {
            current_period_end: futurePeriodEnd(),
            price: { id: "price_unknown" },
          },
        ],
      },
    });

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(
      new Request("http://localhost:3000/api/webhooks/stripe", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).toBe(500);
    expect(dbDeleteWhereMock).not.toHaveBeenCalled();
    expect(dbSelectLimitMock).not.toHaveBeenCalled();
    expect(updatePlanAllocationMock).not.toHaveBeenCalled();
  });
});

describe("api/webhooks/stripe entitlement downgrade and restore", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    vi.stubEnv("STRIPE_PRICE_STANDARD_MONTHLY", "price_std_month");
    vi.stubEnv("STRIPE_PRICE_STANDARD_ANNUAL", "price_std_year");
    vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "price_pro_month");
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", "price_pro_year");
    constructEventMock.mockReset();
    subscriptionsRetrieveMock.mockReset();
    invoicesRetrieveMock.mockReset();
    chargesRetrieveMock.mockReset();
    dbInsertValuesMock.mockReset();
    dbDeleteWhereMock.mockReset();
    dbSelectLimitMock.mockReset();
    dbUpdateWhereMock.mockReset();
    updatePlanAllocationMock.mockReset();

    dbInsertValuesMock.mockResolvedValue(undefined);
    dbDeleteWhereMock.mockResolvedValue(undefined);
    dbUpdateWhereMock.mockResolvedValue(undefined);
    dbSelectLimitMock.mockResolvedValue([
      {
        userId: "user-1",
        stripePriceId: "price_std_month",
        billingHoldStripeDisputeId: "dp_1",
      },
    ]);
  });

  it("downgrades to free when invoice.payment_failed is received", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_payment_failed",
      type: "invoice.payment_failed",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          parent: {
            subscription_details: {
              subscription: "sub_failed",
            },
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
    expect(updatePlanAllocationMock).toHaveBeenCalledWith("user-1", "free");
  });

  it("downgrades to free when customer.subscription.deleted is received", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_subscription_deleted",
      type: "customer.subscription.deleted",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "sub_deleted",
        },
      },
    });

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(new Request("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationMock).toHaveBeenCalledWith("user-1", "free");
  });

  it("restores paid entitlement after invoice.payment_succeeded only for active known-price subscription", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_payment_succeeded",
      type: "invoice.payment_succeeded",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          parent: {
            subscription_details: {
              subscription: "sub_recovered",
            },
          },
        },
      },
    });
    subscriptionsRetrieveMock.mockResolvedValue({
      id: "sub_recovered",
      status: "active",
      cancel_at_period_end: false,
      items: {
        data: [
          {
            current_period_end: futurePeriodEnd(),
            price: { id: "price_std_month" },
          },
        ],
      },
    });

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(new Request("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationMock).toHaveBeenCalledWith("user-1", "standard");
  });

  it("keeps free entitlement after invoice.payment_succeeded for expired active subscription", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_payment_succeeded_expired",
      type: "invoice.payment_succeeded",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          parent: {
            subscription_details: {
              subscription: "sub_expired",
            },
          },
        },
      },
    });
    subscriptionsRetrieveMock.mockResolvedValue({
      id: "sub_expired",
      status: "active",
      cancel_at_period_end: false,
      items: {
        data: [
          {
            current_period_end: Math.floor(Date.now() / 1000) - 60,
            price: { id: "price_std_month" },
          },
        ],
      },
    });

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(new Request("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationMock).toHaveBeenCalledWith("user-1", "free");
  });
});

describe("api/webhooks/stripe refund and dispute events", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    vi.stubEnv("STRIPE_PRICE_STANDARD_MONTHLY", "price_std_month");
    vi.stubEnv("STRIPE_PRICE_STANDARD_ANNUAL", "price_std_year");
    vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "price_pro_month");
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", "price_pro_year");
    constructEventMock.mockReset();
    subscriptionsRetrieveMock.mockReset();
    invoicesRetrieveMock.mockReset();
    chargesRetrieveMock.mockReset();
    dbInsertValuesMock.mockReset();
    dbDeleteWhereMock.mockReset();
    dbSelectLimitMock.mockReset();
    dbUpdateWhereMock.mockReset();
    updatePlanAllocationMock.mockReset();

    dbInsertValuesMock.mockResolvedValue(undefined);
    dbDeleteWhereMock.mockResolvedValue(undefined);
    dbUpdateWhereMock.mockResolvedValue(undefined);
    dbSelectLimitMock.mockResolvedValue([
      {
        userId: "user-1",
        stripePriceId: "price_std_month",
        billingHoldStripeDisputeId: "dp_1",
      },
    ]);
    invoicesRetrieveMock.mockResolvedValue({
      id: "in_1",
      parent: {
        subscription_details: {
          subscription: "sub_1",
        },
      },
    });
    chargesRetrieveMock.mockResolvedValue({
      id: "ch_1",
      invoice: "in_1",
      amount: 1490,
      amount_refunded: 0,
      refunded: false,
    });
    subscriptionsRetrieveMock.mockResolvedValue({
      id: "sub_1",
      latest_invoice: "in_1",
    });
  });

  it("downgrades to free and notifies on a fully refunded charge", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_full_refund",
      type: "charge.refunded",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "ch_1",
          invoice: "in_1",
          amount: 1490,
          amount_refunded: 1490,
          refunded: true,
        },
      },
    });

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(new Request("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationMock).toHaveBeenCalledWith("user-1", "free");
    expect(dbInsertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      type: "billing_status",
      userId: "user-1",
      guestId: null,
      data: { kind: "full_refund" },
    }));
  });

  it("does not downgrade on a partial refund", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_partial_refund",
      type: "charge.refunded",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "ch_1",
          invoice: "in_1",
          amount: 1490,
          amount_refunded: 500,
          refunded: false,
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
    expect(dbInsertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      type: "billing_status",
      data: { kind: "partial_refund" },
    }));
  });

  it("does not downgrade when a full refund belongs to an older invoice", async () => {
    subscriptionsRetrieveMock.mockResolvedValueOnce({
      id: "sub_1",
      latest_invoice: "in_latest",
    });
    constructEventMock.mockReturnValue({
      id: "evt_old_full_refund",
      type: "charge.refunded",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "ch_1",
          invoice: "in_1",
          amount: 1490,
          amount_refunded: 1490,
          refunded: true,
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
    expect(dbInsertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      type: "billing_status",
      data: { kind: "full_refund_no_plan_change" },
    }));
  });

  it("sets a billing hold and notifies on dispute creation", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_dispute_created",
      type: "charge.dispute.created",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "dp_1",
          charge: "ch_1",
          status: "needs_response",
        },
      },
    });

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(new Request("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(chargesRetrieveMock).toHaveBeenCalledWith("ch_1");
    expect(updatePlanAllocationMock).not.toHaveBeenCalled();
    expect(dbInsertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      type: "billing_status",
      data: { kind: "dispute_created" },
    }));
  });

  it("clears a matching billing hold when a dispute is won", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_dispute_won",
      type: "charge.dispute.closed",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "dp_1",
          charge: "ch_1",
          status: "won",
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
    expect(dbInsertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      type: "billing_status",
      data: { kind: "dispute_won" },
    }));
  });

  it("does not notify when a won dispute does not match the active billing hold", async () => {
    dbSelectLimitMock.mockResolvedValueOnce([
      {
        userId: "user-1",
        stripePriceId: "price_std_month",
        billingHoldStripeDisputeId: "dp_other",
      },
    ]);
    constructEventMock.mockReturnValue({
      id: "evt_dispute_won_mismatch",
      type: "charge.dispute.closed",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "dp_1",
          charge: "ch_1",
          status: "won",
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
    expect(dbInsertValuesMock).not.toHaveBeenCalledWith(expect.objectContaining({
      type: "billing_status",
      data: { kind: "dispute_won" },
    }));
  });

  it("downgrades to free when a dispute is lost", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_dispute_lost",
      type: "charge.dispute.closed",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "dp_1",
          charge: "ch_1",
          status: "lost",
        },
      },
    });

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(new Request("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationMock).toHaveBeenCalledWith("user-1", "free");
    expect(dbInsertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      type: "billing_status",
      data: { kind: "dispute_lost" },
    }));
  });

  it("clears the hold without downgrading when a non-lost dispute is closed", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_dispute_prevented",
      type: "charge.dispute.closed",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "dp_1",
          charge: "ch_1",
          status: "prevented",
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
    expect(dbInsertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      type: "billing_status",
      data: { kind: "dispute_closed_no_plan_change", status: "prevented" },
    }));
  });

  it("does not downgrade when a lost dispute does not match the active billing hold", async () => {
    dbSelectLimitMock.mockResolvedValueOnce([
      {
        userId: "user-1",
        stripePriceId: "price_std_month",
        billingHoldStripeDisputeId: "dp_other",
      },
    ]);
    constructEventMock.mockReturnValue({
      id: "evt_dispute_lost_mismatch",
      type: "charge.dispute.closed",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "dp_1",
          charge: "ch_1",
          status: "lost",
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
    expect(dbInsertValuesMock).not.toHaveBeenCalledWith(expect.objectContaining({
      type: "billing_status",
      data: { kind: "dispute_lost" },
    }));
  });
});
