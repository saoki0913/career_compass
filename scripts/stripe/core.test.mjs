import test from "node:test";
import assert from "node:assert/strict";

import {
  auditManagedState,
  planAccountSync,
  planPortalSync,
  planProductSync,
  planWebhookSync,
  resolveStripeSecretKey,
} from "./core.mjs";

const expectedConfig = {
  account: {
    businessProfileName: "就活Pass",
    supportEmail: "support@shupass.jp",
    supportUrl: "https://www.shupass.jp/contact",
    websiteUrl: "https://www.shupass.jp",
    statementDescriptor: "SHUPASS",
  },
  product: {
    name: "就活Pass Subscription",
    metadataKey: "shupass_subscription",
    metadataValue: "1",
    description: "就活Pass サブスクリプション（Standard / Pro、月額・年額）",
  },
  prices: [
    {
      envVar: "STRIPE_PRICE_STANDARD_MONTHLY",
      lookupKey: "standard_monthly",
      unitAmount: 1490,
      interval: "month",
    },
    {
      envVar: "STRIPE_PRICE_STANDARD_ANNUAL",
      lookupKey: "standard_annual",
      unitAmount: 14900,
      interval: "year",
    },
    {
      envVar: "STRIPE_PRICE_PRO_MONTHLY",
      lookupKey: "pro_monthly",
      unitAmount: 2980,
      interval: "month",
    },
    {
      envVar: "STRIPE_PRICE_PRO_ANNUAL",
      lookupKey: "pro_annual",
      unitAmount: 29800,
      interval: "year",
    },
  ],
  webhook: {
    url: "https://www.shupass.jp/api/webhooks/stripe",
    events: [
      "checkout.session.completed",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.payment_succeeded",
      "invoice.payment_failed",
    ],
  },
  portal: {
    returnUrl: "https://www.shupass.jp/settings",
    businessProfile: {
      headline: "就活Pass",
      privacyPolicyUrl: "https://www.shupass.jp/privacy",
      termsOfServiceUrl: "https://www.shupass.jp/terms",
    },
    features: {
      customer_update: {
        enabled: true,
        allowed_updates: ["email", "address", "phone", "name", "tax_id"],
      },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
        proration_behavior: "none",
      },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        proration_behavior: "create_prorations",
      },
    },
  },
  compliance: {
    legalUrl: "https://www.shupass.jp/legal",
  },
};

test("resolveStripeSecretKey rejects environment mismatch", () => {
  assert.throws(
    () =>
      resolveStripeSecretKey({
        environment: "live",
        env: { STRIPE_SECRET_KEY: "sk_test_123" },
      }),
    /sk_live_/,
  );
});

test("planProductSync creates managed product and missing prices", () => {
  const plan = planProductSync({
    expectedConfig,
    products: [],
    prices: [],
  });

  assert.equal(plan.product.action, "create");
  assert.equal(plan.prices.length, 4);
  assert.ok(plan.prices.every((entry) => entry.action === "create"));
});

test("planWebhookSync updates events when endpoint exists with wrong subscriptions", () => {
  const plan = planWebhookSync({
    expectedConfig,
    endpoints: [
      {
        id: "we_123",
        url: "https://www.shupass.jp/api/webhooks/stripe",
        enabled_events: ["checkout.session.completed"],
      },
    ],
  });

  assert.equal(plan.action, "update");
  assert.deepEqual(plan.missingEvents, [
    "customer.subscription.deleted",
    "customer.subscription.updated",
    "invoice.payment_failed",
    "invoice.payment_succeeded",
  ]);
});

test("planPortalSync detects default portal drift", () => {
  const plan = planPortalSync({
    expectedConfig,
    productId: "prod_123",
    priceIds: ["price_1", "price_2"],
    configurations: [
      {
        id: "bpc_123",
        is_default: true,
        active: true,
        default_return_url: "https://wrong.example/settings",
        business_profile: {
          headline: "Wrong",
          privacy_policy_url: "https://wrong.example/privacy",
          terms_of_service_url: "https://wrong.example/terms",
        },
        features: {},
      },
    ],
  });

  assert.equal(plan.action, "update");
  assert.ok(
    plan.diffs.some(
      (entry) =>
        entry.field === "default_return_url" &&
        entry.expected === "https://www.shupass.jp/settings",
    ),
  );
});

test("planAccountSync detects support and statement descriptor drift", () => {
  const plan = planAccountSync({
    expectedConfig,
    account: {
      business_profile: {
        name: "Other",
        support_email: "old@example.com",
        support_url: "https://old.example.com/support",
        url: "https://old.example.com",
      },
      settings: {
        payments: { statement_descriptor: "OLD" },
        card_payments: { statement_descriptor_prefix: "OLD" },
      },
    },
  });

  assert.equal(plan.action, "manual");
  assert.ok(plan.diffs.some((entry) => entry.field === "business_profile.support_email"));
  assert.ok(plan.diffs.some((entry) => entry.field === "settings.payments.statement_descriptor"));
});

test("auditManagedState reports drifts and manual compliance checks", () => {
  const audit = auditManagedState({
    expectedConfig,
    account: {
      business_profile: {
        name: "Other",
        support_email: "old@example.com",
        support_url: "https://old.example.com/support",
        url: "https://old.example.com",
      },
      settings: {
        payments: { statement_descriptor: "OLD" },
        card_payments: { statement_descriptor_prefix: "OLD" },
      },
    },
    products: [],
    prices: [],
    webhookEndpoints: [],
    portalConfigurations: [],
  });

  assert.equal(audit.ok, false);
  assert.equal(audit.diffs.products.product.action, "create");
  assert.equal(
    audit.diffs.products.prices.filter((entry) => entry.action === "create").length,
    4,
  );
  assert.ok(audit.diffs.webhook.action === "create");
  assert.ok(audit.manualChecks.some((check) => check.id === "commerce_disclosure_dashboard"));
});
