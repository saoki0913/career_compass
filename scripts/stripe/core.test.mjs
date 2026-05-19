import test from "node:test";
import assert from "node:assert/strict";

import {
  auditManagedState,
  planAccountSync,
  planPortalSync,
  planProductSync,
  planWebhookSync,
  resolveManagedStripeTarget,
  resolveStripeSecretKey,
} from "./core.mjs";

const STRIPE_SECRET_KEY_ENV = "STRIPE_SECRET_KEY";

const expectedConfig = {
  account: {
    businessProfileName: "就活Pass",
    supportEmail: "support@shupass.jp",
    supportUrl: "https://www.shupass.jp/contact",
    websiteUrl: "https://www.shupass.jp",
    statementDescriptor: "SHUPASS",
  },
  products: [
    {
      name: "就活Pass Standard",
      plan: "standard",
      metadataKey: "shupass_plan",
      metadataValue: "standard",
      description: "就活Pass Standard プラン（月額・年額）",
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
      ],
    },
    {
      name: "就活Pass Pro",
      plan: "pro",
      metadataKey: "shupass_plan",
      metadataValue: "pro",
      description: "就活Pass Pro プラン（月額・年額）",
      prices: [
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

const targetAwareConfig = {
  ...expectedConfig,
  targets: {
    staging: {
      stripeMode: "test",
      appUrl: "https://stg.shupass.jp",
      webhookUrl: "https://stg.shupass.jp/api/webhooks/stripe",
      portalReturnUrl: "https://stg.shupass.jp/settings",
    },
    production: {
      stripeMode: "live",
      appUrl: "https://www.shupass.jp",
      webhookUrl: "https://www.shupass.jp/api/webhooks/stripe",
      portalReturnUrl: "https://www.shupass.jp/settings",
    },
  },
};

test("resolveStripeSecretKey rejects environment mismatch", () => {
  assert.throws(
    () =>
      resolveStripeSecretKey({
        environment: "live",
        env: { [STRIPE_SECRET_KEY_ENV]: "stripe-test-key-placeholder" },
      }),
    /sk_live_/,
  );
});

test("planProductSync creates managed products and missing prices", () => {
  const plan = planProductSync({
    expectedConfig,
    products: [],
    prices: [],
  });

  assert.equal(plan.products.length, 2);
  assert.equal(plan.products[0].product.action, "create");
  assert.equal(plan.products[1].product.action, "create");
  assert.equal(plan.prices.length, 4);
  assert.ok(plan.prices.every((entry) => entry.action === "create"));
  assert.equal(plan.products[0].prices.length, 2);
  assert.equal(plan.products[1].prices.length, 2);
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

test("resolveManagedStripeTarget maps staging to test-mode stable URLs", () => {
  const resolved = resolveManagedStripeTarget({
    expectedConfig: targetAwareConfig,
    target: "staging",
    environment: "test",
  });

  assert.equal(resolved.environment, "test");
  assert.equal(resolved.target.name, "staging");
  assert.equal(resolved.config.webhook.url, "https://stg.shupass.jp/api/webhooks/stripe");
  assert.equal(resolved.config.portal.returnUrl, "https://stg.shupass.jp/settings");
});

test("resolveManagedStripeTarget lets target imply Stripe mode when --env is omitted", () => {
  const resolved = resolveManagedStripeTarget({
    expectedConfig: targetAwareConfig,
    target: "production",
    environment: "test",
  });

  assert.equal(resolved.environment, "live");
  assert.equal(resolved.target.name, "production");
  assert.equal(resolved.config.webhook.url, "https://www.shupass.jp/api/webhooks/stripe");
});

test("resolveManagedStripeTarget rejects explicit env mismatches", () => {
  assert.throws(
    () =>
      resolveManagedStripeTarget({
        expectedConfig: {
          ...targetAwareConfig,
          environmentExplicit: true,
        },
        target: "production",
        environment: "test",
      }),
    /uses Stripe live, but --env test was requested/,
  );
});

test("resolveManagedStripeTarget rejects preview webhook URLs", () => {
  assert.throws(
    () =>
      resolveManagedStripeTarget({
        expectedConfig: {
          ...targetAwareConfig,
          targets: {
            staging: {
              ...targetAwareConfig.targets.staging,
              webhookUrl: "https://preview-example.vercel.app/api/webhooks/stripe",
            },
          },
        },
        target: "staging",
        environment: "test",
      }),
    /must not use an ephemeral vercel\.app URL/,
  );
});

test("planWebhookSync reports active stale Vercel webhook endpoints", () => {
  const plan = planWebhookSync({
    expectedConfig: {
      ...expectedConfig,
      webhook: {
        ...expectedConfig.webhook,
        url: "https://stg.shupass.jp/api/webhooks/stripe",
      },
    },
    endpoints: [
      {
        id: "we_staging",
        url: "https://stg.shupass.jp/api/webhooks/stripe",
        enabled_events: expectedConfig.webhook.events,
        status: "enabled",
      },
      {
        id: "we_preview",
        url: "https://old-preview.vercel.app/api/webhooks/stripe",
        enabled_events: ["checkout.session.completed"],
        status: "enabled",
      },
      {
        id: "we_disabled_preview",
        url: "https://disabled-preview.vercel.app/api/webhooks/stripe",
        enabled_events: ["checkout.session.completed"],
        status: "disabled",
      },
    ],
  });

  assert.equal(plan.action, "noop");
  assert.deepEqual(plan.staleEndpointIds, ["we_preview"]);
});

test("planWebhookSync prefers enabled endpoint over disabled duplicate with same URL", () => {
  const plan = planWebhookSync({
    expectedConfig,
    endpoints: [
      {
        id: "we_disabled",
        url: "https://www.shupass.jp/api/webhooks/stripe",
        enabled_events: ["checkout.session.completed"],
        status: "disabled",
      },
      {
        id: "we_enabled",
        url: "https://www.shupass.jp/api/webhooks/stripe",
        enabled_events: expectedConfig.webhook.events,
        status: "enabled",
      },
    ],
  });

  assert.equal(plan.id, "we_enabled");
  assert.equal(plan.action, "update");
  assert.equal(plan.shouldEnable, false);
  assert.deepEqual(plan.duplicateEndpointIds, ["we_disabled"]);
});

test("planWebhookSync marks a lone disabled matching endpoint for re-enable", () => {
  const plan = planWebhookSync({
    expectedConfig,
    endpoints: [
      {
        id: "we_disabled",
        url: "https://www.shupass.jp/api/webhooks/stripe",
        enabled_events: expectedConfig.webhook.events,
        status: "disabled",
      },
    ],
  });

  assert.equal(plan.id, "we_disabled");
  assert.equal(plan.action, "update");
  assert.equal(plan.shouldEnable, true);
});

test("planPortalSync detects default portal drift", () => {
  const plan = planPortalSync({
    expectedConfig,
    productEntries: [
      { productId: "prod_standard", priceIds: ["price_1", "price_2"] },
      { productId: "prod_pro", priceIds: ["price_3", "price_4"] },
    ],
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
  assert.equal(audit.diffs.products.products.length, 2);
  assert.equal(audit.diffs.products.products[0].product.action, "create");
  assert.equal(audit.diffs.products.products[1].product.action, "create");
  assert.equal(
    audit.diffs.products.prices.filter((entry) => entry.action === "create").length,
    4,
  );
  assert.ok(audit.diffs.webhook.action === "create");
  assert.ok(audit.manualChecks.some((check) => check.id === "commerce_disclosure_dashboard"));
});
