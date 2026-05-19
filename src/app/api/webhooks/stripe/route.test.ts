import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  constructEventMock,
  subscriptionsRetrieveMock,
  customersRetrieveMock,
  invoicesRetrieveMock,
  chargesRetrieveMock,
  dbInsertValuesMock,
  dbInsertOnConflictDoNothingMock,
  dbInsertOnConflictDoUpdateMock,
  dbDeleteWhereMock,
  dbSelectLimitMock,
  dbUpdateSetMock,
  dbUpdateWhereMock,
  dbTransactionMock,
  dbTransactionTxs,
  logErrorMock,
  logInfoMock,
  logWarnMock,
  updatePlanAllocationCoreTxMock,
} = vi.hoisted(() => {
  const dbTransactionTxs: Array<unknown> = [];
  return {
    constructEventMock: vi.fn(),
    subscriptionsRetrieveMock: vi.fn(),
    customersRetrieveMock: vi.fn(),
    invoicesRetrieveMock: vi.fn(),
    chargesRetrieveMock: vi.fn(),
    dbInsertValuesMock: vi.fn(),
    dbInsertOnConflictDoNothingMock: vi.fn(),
    dbInsertOnConflictDoUpdateMock: vi.fn(),
    dbDeleteWhereMock: vi.fn(),
    dbSelectLimitMock: vi.fn(),
    dbUpdateSetMock: vi.fn(),
    dbUpdateWhereMock: vi.fn(),
    dbTransactionMock: vi.fn(),
    dbTransactionTxs,
    logErrorMock: vi.fn(),
    logInfoMock: vi.fn(),
    logWarnMock: vi.fn(),
    updatePlanAllocationCoreTxMock: vi.fn(),
  };
});

const futurePeriodEnd = () => Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

vi.mock("@/lib/logger", () => ({
  logError: logErrorMock,
  logInfo: logInfoMock,
  logWarn: logWarnMock,
}));

vi.mock("@/env/server", () => ({
  serverEnv: {
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    STRIPE_PRICE_STANDARD_MONTHLY: "price_std_month",
    STRIPE_PRICE_STANDARD_ANNUAL: "price_std_year",
    STRIPE_PRICE_PRO_MONTHLY: "price_pro_month",
    STRIPE_PRICE_PRO_ANNUAL: "price_pro_year",
  },
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: {
      constructEvent: constructEventMock,
    },
    subscriptions: {
      retrieve: subscriptionsRetrieveMock,
    },
    customers: {
      retrieve: customersRetrieveMock,
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
      set: dbUpdateSetMock.mockImplementation(() => ({
        where: dbUpdateWhereMock,
      })),
    })),
    transaction: dbTransactionMock,
  },
}));

vi.mock("@/lib/credits", () => ({
  updatePlanAllocationCoreTx: updatePlanAllocationCoreTxMock,
}));

function createWebhookTx() {
  return {
    insert: vi.fn(() => ({ values: dbInsertValuesMock })),
    update: vi.fn(() => ({
      set: dbUpdateSetMock.mockImplementation(() => ({
        where: dbUpdateWhereMock,
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: dbSelectLimitMock,
        })),
      })),
    })),
  };
}

function mockDbTransaction() {
  dbTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = createWebhookTx();
    dbTransactionTxs.push(tx);
    return fn(tx);
  });
}

function stripeWebhookRequest(init: RequestInit = {}) {
  return new Request("http://localhost:3000/api/webhooks/stripe", {
    ...init,
    method: init.method ?? "POST",
    headers: {
      "stripe-signature": "sig_test",
      ...(init.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : init.headers),
    },
  });
}

describe("api/webhooks/stripe subscription.updated", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    vi.stubEnv("STRIPE_PRICE_STANDARD_MONTHLY", "price_std_month");
    vi.stubEnv("STRIPE_PRICE_STANDARD_ANNUAL", "price_std_year");
    vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "price_pro_month");
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", "price_pro_year");
    constructEventMock.mockReset();
    subscriptionsRetrieveMock.mockReset();
    customersRetrieveMock.mockReset();
    invoicesRetrieveMock.mockReset();
    chargesRetrieveMock.mockReset();
    dbInsertValuesMock.mockReset();
    dbInsertOnConflictDoNothingMock.mockReset();
    dbInsertOnConflictDoUpdateMock.mockReset();
    dbDeleteWhereMock.mockReset();
    dbSelectLimitMock.mockReset();
    dbUpdateSetMock.mockReset();
    dbUpdateWhereMock.mockReset();
    updatePlanAllocationCoreTxMock.mockReset();
    dbTransactionMock.mockReset();
    dbTransactionTxs.length = 0;
    logErrorMock.mockReset();
    logInfoMock.mockReset();
    logWarnMock.mockReset();
    mockDbTransaction();

    dbInsertValuesMock.mockReturnValue({
      onConflictDoNothing: dbInsertOnConflictDoNothingMock,
      onConflictDoUpdate: dbInsertOnConflictDoUpdateMock,
    });
    dbInsertOnConflictDoNothingMock.mockResolvedValue(undefined);
    dbInsertOnConflictDoUpdateMock.mockResolvedValue(undefined);
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
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationCoreTxMock).toHaveBeenCalledWith(expect.any(Object), "user-1", "standard");
    expect(dbTransactionTxs).toContain(updatePlanAllocationCoreTxMock.mock.calls[0]?.[0]);
  });

  it("pins the route to the Node.js runtime", async () => {
    const mod = await import("@/app/api/webhooks/stripe/route");

    expect(mod.runtime).toBe("nodejs");
  });

  it("keeps configured webhook events in sync with route handlers", async () => {
    const [{ SUPPORTED_STRIPE_EVENT_TYPES }, { default: managedConfig }] = await Promise.all([
      import("@/app/api/webhooks/stripe/route"),
      import("@/lib/stripe/managed-config.json"),
    ]);

    expect([...SUPPORTED_STRIPE_EVENT_TYPES].sort()).toEqual(
      [...managedConfig.webhook.events].sort(),
    );
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
    dbSelectLimitMock.mockResolvedValueOnce([{
      eventId: "evt_duplicate",
      status: "succeeded",
      startedAt: new Date(Date.now() - 60_000),
      processedAt: new Date(),
      attemptCount: 1,
    }]);

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(dbDeleteWhereMock).not.toHaveBeenCalled();
    expect(dbUpdateWhereMock).not.toHaveBeenCalled();
    expect(updatePlanAllocationCoreTxMock).not.toHaveBeenCalled();
  });

  it("acknowledges an already succeeded duplicate event without running handlers", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_succeeded_duplicate",
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
    dbSelectLimitMock.mockResolvedValueOnce([{
      eventId: "evt_succeeded_duplicate",
      status: "succeeded",
      startedAt: new Date(Date.now() - 60_000),
      processedAt: new Date(),
      attemptCount: 1,
    }]);

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ received: true });
    expect(dbDeleteWhereMock).not.toHaveBeenCalled();
    expect(dbUpdateWhereMock).not.toHaveBeenCalled();
    expect(updatePlanAllocationCoreTxMock).not.toHaveBeenCalled();
  });

  it("does not acknowledge an in-flight duplicate event as processed", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_in_flight",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_in_flight",
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
    dbSelectLimitMock.mockResolvedValueOnce([{
      eventId: "evt_in_flight",
      status: "processing",
      startedAt: new Date(),
      processedAt: null,
      attemptCount: 1,
    }]);

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({ received: false, retry: true, reason: "event_in_flight" });
    expect(updatePlanAllocationCoreTxMock).not.toHaveBeenCalled();
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
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(500);
    expect(dbDeleteWhereMock).not.toHaveBeenCalled();
    expect(dbUpdateWhereMock).not.toHaveBeenCalled();
    expect(updatePlanAllocationCoreTxMock).not.toHaveBeenCalled();
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
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(500);
    expect(dbDeleteWhereMock).not.toHaveBeenCalled();
    expect(dbUpdateWhereMock).toHaveBeenCalledTimes(1);
    expect(updatePlanAllocationCoreTxMock).not.toHaveBeenCalled();
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
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(dbUpdateWhereMock).toHaveBeenCalledTimes(2);
    expect(dbInsertOnConflictDoUpdateMock).toHaveBeenCalled();
    expect(updatePlanAllocationCoreTxMock).toHaveBeenCalledWith(expect.any(Object), "user-1", "pro");
    expect(dbUpdateWhereMock.mock.invocationCallOrder[0]).toBeLessThan(
      updatePlanAllocationCoreTxMock.mock.invocationCallOrder[0],
    );
  });

  it("ignores an older subscription.updated event without rolling back the plan", async () => {
    const olderCreated = Math.floor(Date.now() / 1000) - 3600;
    constructEventMock.mockReturnValue({
      id: "evt_old_subscription_update",
      type: "customer.subscription.updated",
      created: olderCreated,
      data: {
        object: {
          id: "sub_retryable",
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
    dbSelectLimitMock.mockResolvedValueOnce([
      {
        userId: "user-1",
        stripePriceId: "price_pro_month",
        billingHoldStripeDisputeId: "dp_1",
        lastStripeEventCreatedAt: new Date((olderCreated + 7200) * 1000),
      },
    ]);

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationCoreTxMock).not.toHaveBeenCalled();
  });

  it("uses the canonical Stripe subscription for same-second same-rank subscription.updated events", async () => {
    const created = Math.floor(Date.now() / 1000);
    constructEventMock.mockReturnValue({
      id: "evt_same_second_subscription_update",
      type: "customer.subscription.updated",
      created,
      data: {
        object: {
          id: "sub_same_second",
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
    subscriptionsRetrieveMock.mockResolvedValue({
      id: "sub_same_second",
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
    });
    dbSelectLimitMock.mockResolvedValueOnce([
      {
        userId: "user-1",
        stripePriceId: "price_std_month",
        billingHoldStripeDisputeId: "dp_1",
        lastStripeEventId: "evt_existing_same_second",
        lastStripeEventCreatedAt: new Date(created * 1000),
        lastStripeEventRank: 30,
        lastStripeEventType: "customer.subscription.updated",
      },
    ]);

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(subscriptionsRetrieveMock).toHaveBeenCalledWith("sub_same_second");
    expect(updatePlanAllocationCoreTxMock).toHaveBeenCalledWith(expect.any(Object), "user-1", "pro");
    expect(dbUpdateSetMock).toHaveBeenCalledWith(expect.objectContaining({
      stripePriceId: "price_pro_month",
      lastStripeEventId: "evt_existing_same_second",
      lastStripeEventCreatedAt: new Date(created * 1000),
      lastStripeEventRank: 30,
      lastStripeEventType: "customer.subscription.updated",
    }));
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
    customersRetrieveMock.mockReset();
    invoicesRetrieveMock.mockReset();
    chargesRetrieveMock.mockReset();
    dbInsertValuesMock.mockReset();
    dbInsertOnConflictDoNothingMock.mockReset();
    dbInsertOnConflictDoUpdateMock.mockReset();
    dbDeleteWhereMock.mockReset();
    dbSelectLimitMock.mockReset();
    dbUpdateSetMock.mockReset();
    dbUpdateWhereMock.mockReset();
    updatePlanAllocationCoreTxMock.mockReset();
    dbTransactionMock.mockReset();
    dbTransactionTxs.length = 0;
    logErrorMock.mockReset();
    mockDbTransaction();

    dbInsertValuesMock.mockReturnValue({
      onConflictDoNothing: dbInsertOnConflictDoNothingMock,
      onConflictDoUpdate: dbInsertOnConflictDoUpdateMock,
    });
    dbInsertOnConflictDoNothingMock.mockResolvedValue(undefined);
    dbInsertOnConflictDoUpdateMock.mockResolvedValue(undefined);
    dbDeleteWhereMock.mockResolvedValue(undefined);
    dbUpdateWhereMock.mockResolvedValue(undefined);
    customersRetrieveMock.mockResolvedValue({
      id: "cus_1",
      metadata: { userId: "user-1" },
    });
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
      customer: "cus_1",
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
      stripeWebhookRequest({
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).toBe(200);
    // metadata.plan was "pro" but priceId maps to "standard" — metadata must be ignored
    expect(updatePlanAllocationCoreTxMock).toHaveBeenCalledWith(expect.any(Object), "user-1", "standard");
    expect(dbTransactionTxs).toContain(updatePlanAllocationCoreTxMock.mock.calls[0]?.[0]);
  });

  it("fails closed when checkout customer metadata does not belong to the user", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_checkout_owner_mismatch",
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { userId: "user-1", plan: "standard" },
          subscription: "sub_checkout_owner_mismatch",
          customer: "cus_1",
        },
      },
    });
    subscriptionsRetrieveMock.mockResolvedValue({
      id: "sub_checkout_owner_mismatch",
      customer: "cus_1",
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
    customersRetrieveMock.mockResolvedValueOnce({
      id: "cus_1",
      metadata: { userId: "user-2" },
    });
    dbSelectLimitMock.mockResolvedValue([]);

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(500);
    expect(updatePlanAllocationCoreTxMock).not.toHaveBeenCalled();
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
      customer: "cus_1",
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
      stripeWebhookRequest({
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).toBe(500);
    expect(dbDeleteWhereMock).not.toHaveBeenCalled();
    expect(dbSelectLimitMock).toHaveBeenCalledTimes(1);
    expect(updatePlanAllocationCoreTxMock).not.toHaveBeenCalled();
  });

  it("records checkout state but does not grant paid entitlement for incomplete subscriptions", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_checkout_incomplete",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "cs_incomplete",
          metadata: { userId: "user-1", plan: "standard" },
          subscription: "sub_checkout_incomplete",
          customer: "cus_1",
        },
      },
    });

    subscriptionsRetrieveMock.mockResolvedValue({
      id: "sub_checkout_incomplete",
      customer: "cus_1",
      status: "incomplete",
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
    dbSelectLimitMock.mockResolvedValue([{
      userId: "user-1",
      stripeCustomerId: "cus_1",
    }]);

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(dbUpdateSetMock).toHaveBeenCalledWith(expect.objectContaining({
      stripeSubscriptionId: "sub_checkout_incomplete",
      status: "incomplete",
      stripePriceId: "price_std_month",
    }));
    expect(updatePlanAllocationCoreTxMock).not.toHaveBeenCalled();
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
    customersRetrieveMock.mockReset();
    invoicesRetrieveMock.mockReset();
    chargesRetrieveMock.mockReset();
    dbInsertValuesMock.mockReset();
    dbInsertOnConflictDoNothingMock.mockReset();
    dbInsertOnConflictDoUpdateMock.mockReset();
    dbDeleteWhereMock.mockReset();
    dbSelectLimitMock.mockReset();
    dbUpdateSetMock.mockReset();
    dbUpdateWhereMock.mockReset();
    updatePlanAllocationCoreTxMock.mockReset();
    dbTransactionMock.mockReset();
    dbTransactionTxs.length = 0;
    logErrorMock.mockReset();
    mockDbTransaction();

    dbInsertValuesMock.mockReturnValue({
      onConflictDoNothing: dbInsertOnConflictDoNothingMock,
      onConflictDoUpdate: dbInsertOnConflictDoUpdateMock,
    });
    dbInsertOnConflictDoNothingMock.mockResolvedValue(undefined);
    dbInsertOnConflictDoUpdateMock.mockResolvedValue(undefined);
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

  it("downgrades to free from the current Stripe subscription state when invoice.payment_failed is received", async () => {
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
    subscriptionsRetrieveMock.mockResolvedValue({
      id: "sub_failed",
      status: "past_due",
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
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationCoreTxMock).toHaveBeenCalledWith(expect.any(Object), "user-1", "free");
  });

  it("ignores an older invoice.payment_failed after a newer entitlement event", async () => {
    const olderCreated = Math.floor(Date.now() / 1000) - 3600;
    constructEventMock.mockReturnValue({
      id: "evt_payment_failed_old",
      type: "invoice.payment_failed",
      created: olderCreated,
      data: {
        object: {
          parent: {
            subscription_details: {
              subscription: "sub_failed_old",
            },
          },
        },
      },
    });
    dbSelectLimitMock.mockResolvedValueOnce([
      {
        userId: "user-1",
        stripePriceId: "price_pro_month",
        billingHoldStripeDisputeId: "dp_1",
        lastStripeEventCreatedAt: new Date((olderCreated + 7200) * 1000),
      },
    ]);
    subscriptionsRetrieveMock.mockResolvedValue({
      id: "sub_failed_old",
      status: "past_due",
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
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationCoreTxMock).not.toHaveBeenCalled();
  });

  it("does not restore paid entitlement from an older payment_succeeded after a refund downgrade", async () => {
    const olderCreated = Math.floor(Date.now() / 1000) - 3600;
    constructEventMock.mockReturnValue({
      id: "evt_payment_succeeded_after_refund_old",
      type: "invoice.payment_succeeded",
      created: olderCreated,
      data: {
        object: {
          parent: {
            subscription_details: {
              subscription: "sub_refunded",
            },
          },
        },
      },
    });
    dbSelectLimitMock.mockResolvedValueOnce([
      {
        userId: "user-1",
        status: "refunded",
        stripePriceId: "price_std_month",
        billingHoldStripeDisputeId: "dp_1",
        lastStripeEventCreatedAt: new Date((olderCreated + 7200) * 1000),
      },
    ]);
    subscriptionsRetrieveMock.mockResolvedValue({
      id: "sub_refunded",
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
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationCoreTxMock).not.toHaveBeenCalled();
  });

  it("does not restore paid entitlement from an older payment_succeeded after a lost dispute downgrade", async () => {
    const olderCreated = Math.floor(Date.now() / 1000) - 3600;
    constructEventMock.mockReturnValue({
      id: "evt_payment_succeeded_after_dispute_old",
      type: "invoice.payment_succeeded",
      created: olderCreated,
      data: {
        object: {
          parent: {
            subscription_details: {
              subscription: "sub_dispute_lost",
            },
          },
        },
      },
    });
    dbSelectLimitMock.mockResolvedValueOnce([
      {
        userId: "user-1",
        status: "dispute_lost",
        stripePriceId: "price_std_month",
        billingHoldStripeDisputeId: "dp_1",
        lastStripeEventCreatedAt: new Date((olderCreated + 7200) * 1000),
      },
    ]);
    subscriptionsRetrieveMock.mockResolvedValue({
      id: "sub_dispute_lost",
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
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationCoreTxMock).not.toHaveBeenCalled();
  });

  it("does not restore paid entitlement from a newer payment_succeeded after a refund downgrade", async () => {
    const eventCreated = Math.floor(Date.now() / 1000);
    constructEventMock.mockReturnValue({
      id: "evt_payment_succeeded_after_refund_newer",
      type: "invoice.payment_succeeded",
      created: eventCreated,
      data: {
        object: {
          parent: {
            subscription_details: {
              subscription: "sub_refunded",
            },
          },
        },
      },
    });
    dbSelectLimitMock.mockResolvedValueOnce([
      {
        userId: "user-1",
        status: "refunded",
        stripePriceId: "price_std_month",
        billingHoldStripeDisputeId: "dp_1",
        lastStripeEventCreatedAt: new Date((eventCreated - 3600) * 1000),
      },
    ]);
    subscriptionsRetrieveMock.mockResolvedValue({
      id: "sub_refunded",
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
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationCoreTxMock).not.toHaveBeenCalled();
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
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationCoreTxMock).toHaveBeenCalledWith(expect.any(Object), "user-1", "free");
  });

  it("records canceled when a financial-downgrade user cancels in the portal", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_subscription_deleted_after_refund",
      type: "customer.subscription.deleted",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "sub_deleted_after_refund",
        },
      },
    });
    dbSelectLimitMock.mockResolvedValueOnce([
      {
        userId: "user-1",
        status: "refunded",
        stripePriceId: "price_std_month",
        billingHoldStripeDisputeId: "dp_1",
        lastStripeEventCreatedAt: new Date(Date.now() - 3600_000),
      },
    ]);

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(dbUpdateSetMock).toHaveBeenCalledWith(expect.objectContaining({
      status: "canceled",
      cancelAtPeriodEnd: true,
    }));
    expect(updatePlanAllocationCoreTxMock).toHaveBeenCalledWith(expect.any(Object), "user-1", "free");
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
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationCoreTxMock).toHaveBeenCalledWith(expect.any(Object), "user-1", "standard");
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
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationCoreTxMock).toHaveBeenCalledWith(expect.any(Object), "user-1", "free");
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
    customersRetrieveMock.mockReset();
    invoicesRetrieveMock.mockReset();
    chargesRetrieveMock.mockReset();
    dbInsertValuesMock.mockReset();
    dbInsertOnConflictDoNothingMock.mockReset();
    dbInsertOnConflictDoUpdateMock.mockReset();
    dbDeleteWhereMock.mockReset();
    dbSelectLimitMock.mockReset();
    dbUpdateSetMock.mockReset();
    dbUpdateWhereMock.mockReset();
    updatePlanAllocationCoreTxMock.mockReset();
    dbTransactionMock.mockReset();
    dbTransactionTxs.length = 0;
    logErrorMock.mockReset();
    mockDbTransaction();

    dbInsertValuesMock.mockReturnValue({
      onConflictDoNothing: dbInsertOnConflictDoNothingMock,
      onConflictDoUpdate: dbInsertOnConflictDoUpdateMock,
    });
    dbInsertOnConflictDoNothingMock.mockResolvedValue(undefined);
    dbInsertOnConflictDoUpdateMock.mockResolvedValue(undefined);
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
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationCoreTxMock).toHaveBeenCalledWith(expect.any(Object), "user-1", "free");
    expect(dbUpdateSetMock).toHaveBeenCalledWith(expect.objectContaining({
      status: "refunded",
      lastStripeEventId: "evt_full_refund",
      lastStripeEventCreatedAt: expect.any(Date),
    }));
    expect(dbInsertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      type: "billing_status",
      userId: "user-1",
      guestId: null,
      data: { kind: "full_refund" },
    }));
  });

  it("preserves the newer event watermark when applying an older financial downgrade", async () => {
    const newerCreatedAt = new Date();
    constructEventMock.mockReturnValue({
      id: "evt_full_refund_older_than_watermark",
      type: "charge.refunded",
      created: Math.floor(newerCreatedAt.getTime() / 1000) - 3600,
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
    const storedSubscription = {
      userId: "user-1",
      stripePriceId: "price_std_month",
      billingHoldStripeDisputeId: "dp_1",
      lastStripeEventId: "evt_newer_subscription_update",
      lastStripeEventCreatedAt: newerCreatedAt,
    };
    dbSelectLimitMock
      .mockResolvedValueOnce([storedSubscription])
      .mockResolvedValueOnce([storedSubscription]);

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(dbUpdateSetMock).toHaveBeenCalledWith(expect.objectContaining({
      status: "refunded",
      lastStripeEventId: "evt_newer_subscription_update",
      lastStripeEventCreatedAt: newerCreatedAt,
    }));
    expect(updatePlanAllocationCoreTxMock).toHaveBeenCalledWith(expect.any(Object), "user-1", "free");
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
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationCoreTxMock).not.toHaveBeenCalled();
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
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationCoreTxMock).not.toHaveBeenCalled();
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
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(chargesRetrieveMock).toHaveBeenCalledWith("ch_1");
    expect(updatePlanAllocationCoreTxMock).not.toHaveBeenCalled();
    expect(dbInsertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      type: "billing_status",
      data: { kind: "dispute_created" },
    }));
  });

  it("applies a same-second dispute hold after a subscription update", async () => {
    const created = Math.floor(Date.now() / 1000);
    dbSelectLimitMock.mockResolvedValueOnce([{
      userId: "user-1",
      stripePriceId: "price_std_month",
      billingHoldStripeDisputeId: null,
      lastStripeEventId: "evt_subscription_same_second",
      lastStripeEventCreatedAt: new Date(created * 1000),
      lastStripeEventRank: 30,
      lastStripeEventType: "customer.subscription.updated",
    }]);
    constructEventMock.mockReturnValue({
      id: "evt_dispute_created_after_subscription",
      type: "charge.dispute.created",
      created,
      data: {
        object: {
          id: "dp_same_second_subscription",
          charge: "ch_1",
          status: "needs_response",
        },
      },
    });

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(dbUpdateSetMock).toHaveBeenCalledWith(expect.objectContaining({
      billingHoldStatus: "dispute",
      billingHoldStripeDisputeId: "dp_same_second_subscription",
      lastStripeEventId: "evt_dispute_created_after_subscription",
      lastStripeEventRank: 90,
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
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationCoreTxMock).not.toHaveBeenCalled();
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
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationCoreTxMock).not.toHaveBeenCalled();
    expect(dbInsertValuesMock).not.toHaveBeenCalledWith(expect.objectContaining({
      type: "billing_status",
      data: { kind: "dispute_won" },
    }));
  });

  it("ignores an older dispute created event after a newer dispute resolution", async () => {
    const olderCreated = Math.floor(Date.now() / 1000) - 3600;
    dbSelectLimitMock.mockResolvedValueOnce([{
      userId: "user-1",
      stripePriceId: "price_std_month",
      billingHoldStripeDisputeId: "dp_old",
      lastStripeEventCreatedAt: new Date((olderCreated + 7200) * 1000),
    }]);
    constructEventMock.mockReturnValue({
      id: "evt_dispute_created_old",
      type: "charge.dispute.created",
      created: olderCreated,
      data: {
        object: {
          id: "dp_old",
          charge: "ch_1",
          status: "needs_response",
        },
      },
    });

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationCoreTxMock).not.toHaveBeenCalled();
    expect(dbUpdateSetMock).not.toHaveBeenCalledWith(expect.objectContaining({
      billingHoldStatus: "dispute",
    }));
    expect(dbInsertValuesMock).not.toHaveBeenCalledWith(expect.objectContaining({
      type: "billing_status",
      data: { kind: "dispute_created" },
    }));
  });

  it("ignores an older dispute created event even when the stored hold id differs", async () => {
    const olderCreated = Math.floor(Date.now() / 1000) - 3600;
    dbSelectLimitMock.mockResolvedValueOnce([{
      userId: "user-1",
      stripePriceId: "price_std_month",
      billingHoldStripeDisputeId: "dp_other",
      lastStripeEventCreatedAt: new Date((olderCreated + 7200) * 1000),
    }]);
    constructEventMock.mockReturnValue({
      id: "evt_dispute_created_old_mismatch",
      type: "charge.dispute.created",
      created: olderCreated,
      data: {
        object: {
          id: "dp_closed_first",
          charge: "ch_1",
          status: "needs_response",
        },
      },
    });

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(dbUpdateSetMock).not.toHaveBeenCalledWith(expect.objectContaining({
      billingHoldStatus: "dispute",
    }));
    expect(dbInsertValuesMock).not.toHaveBeenCalledWith(expect.objectContaining({
      type: "billing_status",
      data: { kind: "dispute_created" },
    }));
  });

  it("records a dispute closed event before the created event so older created cannot reopen a hold", async () => {
    const closedCreated = Math.floor(Date.now() / 1000);
    constructEventMock.mockReturnValue({
      id: "evt_dispute_closed_first",
      type: "charge.dispute.closed",
      created: closedCreated,
      data: {
        object: {
          id: "dp_closed_first",
          charge: "ch_1",
          status: "won",
        },
      },
    });
    dbSelectLimitMock.mockResolvedValueOnce([{
      userId: "user-1",
      stripePriceId: "price_std_month",
      billingHoldStripeDisputeId: "dp_other",
    }]);

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(dbUpdateSetMock).toHaveBeenCalledWith(expect.objectContaining({
      lastStripeEventId: "evt_dispute_closed_first",
      lastStripeEventCreatedAt: expect.any(Date),
    }));
    expect(dbInsertValuesMock).not.toHaveBeenCalledWith(expect.objectContaining({
      type: "billing_status",
      data: { kind: "dispute_won" },
    }));
  });

  it("does not reopen a hold when dispute created has the same second as a processed closed event", async () => {
    const eventCreated = Math.floor(Date.now() / 1000);
    dbSelectLimitMock.mockResolvedValueOnce([{
      userId: "user-1",
      stripePriceId: "price_std_month",
      billingHoldStripeDisputeId: "dp_same_second",
      lastStripeEventCreatedAt: new Date(eventCreated * 1000),
      lastStripeEventType: "charge.dispute.closed",
    }]);
    constructEventMock.mockReturnValue({
      id: "evt_dispute_created_same_second",
      type: "charge.dispute.created",
      created: eventCreated,
      data: {
        object: {
          id: "dp_same_second",
          charge: "ch_1",
          status: "needs_response",
        },
      },
    });

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationCoreTxMock).not.toHaveBeenCalled();
    expect(dbUpdateSetMock).not.toHaveBeenCalledWith(expect.objectContaining({
      billingHoldStatus: "dispute",
    }));
    expect(dbInsertValuesMock).not.toHaveBeenCalledWith(expect.objectContaining({
      type: "billing_status",
      data: { kind: "dispute_created" },
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
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationCoreTxMock).toHaveBeenCalledWith(expect.any(Object), "user-1", "free");
    expect(dbUpdateSetMock).toHaveBeenCalledWith(expect.objectContaining({
      status: "dispute_lost",
      lastStripeEventId: "evt_dispute_lost",
      lastStripeEventCreatedAt: expect.any(Date),
      lastStripeEventRank: 100,
    }));
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
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationCoreTxMock).not.toHaveBeenCalled();
    expect(dbInsertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      type: "billing_status",
      data: { kind: "dispute_closed_no_plan_change", status: "prevented" },
    }));
  });

  it("downgrades when a lost dispute is closed before its hold was created", async () => {
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
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationCoreTxMock).toHaveBeenCalledWith(expect.any(Object), "user-1", "free");
    expect(dbUpdateSetMock).toHaveBeenCalledWith(expect.objectContaining({
      status: "dispute_lost",
      lastStripeEventId: "evt_dispute_lost_mismatch",
      lastStripeEventCreatedAt: expect.any(Date),
    }));
    expect(dbInsertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      type: "billing_status",
      data: { kind: "dispute_lost" },
    }));
  });

  it("preserves a newer event watermark when clearing hold after an older lost dispute", async () => {
    const newerCreatedAt = new Date();
    const storedSubscription = {
      userId: "user-1",
      stripePriceId: "price_std_month",
      billingHoldStripeDisputeId: "dp_1",
      lastStripeEventId: "evt_newer_subscription_update",
      lastStripeEventCreatedAt: newerCreatedAt,
    };
    dbSelectLimitMock
      .mockResolvedValueOnce([storedSubscription])
      .mockResolvedValueOnce([storedSubscription]);
    constructEventMock.mockReturnValue({
      id: "evt_dispute_lost_older_than_watermark",
      type: "charge.dispute.closed",
      created: Math.floor(newerCreatedAt.getTime() / 1000) - 3600,
      data: {
        object: {
          id: "dp_1",
          charge: "ch_1",
          status: "lost",
        },
      },
    });

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const response = await POST(stripeWebhookRequest({
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(updatePlanAllocationCoreTxMock).toHaveBeenCalledWith(expect.any(Object), "user-1", "free");
    expect(dbUpdateSetMock).toHaveBeenCalledWith(expect.objectContaining({
      status: "dispute_lost",
      lastStripeEventId: "evt_newer_subscription_update",
      lastStripeEventCreatedAt: newerCreatedAt,
    }));
    expect(dbUpdateSetMock).toHaveBeenCalledWith(expect.objectContaining({
      billingHoldStatus: "none",
      lastStripeEventId: "evt_newer_subscription_update",
      lastStripeEventCreatedAt: newerCreatedAt,
    }));
  });
});
