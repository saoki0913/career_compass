function stableStringify(value) {
  if (Array.isArray(value)) {
    return JSON.stringify(value.map((entry) => JSON.parse(stableStringify(entry))));
  }
  if (value && typeof value === "object") {
    return JSON.stringify(
      Object.keys(value)
        .sort()
        .reduce((acc, key) => {
          acc[key] = JSON.parse(stableStringify(value[key]));
          return acc;
        }, {}),
    );
  }
  return JSON.stringify(value);
}

function valuesEqual(actual, expected) {
  return stableStringify(actual) === stableStringify(expected);
}

function sortedStrings(values = []) {
  return [...values].sort();
}

function pushDiff(diffs, field, actual, expected) {
  if (!valuesEqual(actual, expected)) {
    diffs.push({ field, actual, expected });
  }
}

function priceSignature(price) {
  return `${price.unit_amount}:${price.recurring?.interval ?? ""}:${price.currency ?? ""}`;
}

export function resolveStripeSecretKey({
  environment,
  env = process.env,
}) {
  const candidates =
    environment === "live"
      ? [
          env.STRIPE_SECRET_KEY_LIVE,
          env.STRIPE_LIVE_SECRET_KEY,
          env.STRIPE_SECRET_KEY,
        ]
      : [
          env.STRIPE_SECRET_KEY_TEST,
          env.STRIPE_TEST_SECRET_KEY,
          env.STRIPE_SECRET_KEY,
        ];
  const key = candidates.find((candidate) => typeof candidate === "string" && candidate.length > 0);
  const expectedPrefix = environment === "live" ? "sk_live_" : "sk_test_";

  if (!key) {
    throw new Error(
      `${environment} 用の Stripe secret key が見つかりません。${expectedPrefix}... を STRIPE_SECRET_KEY${environment === "live" ? "_LIVE" : "_TEST"} か STRIPE_SECRET_KEY に設定してください。`,
    );
  }
  if (!key.startsWith(expectedPrefix)) {
    throw new Error(
      `${environment} 環境では ${expectedPrefix}... が必要です。受け取ったキーは ${key.slice(0, 8)}... です。`,
    );
  }
  return key;
}

export function findManagedProduct(products, expectedConfig) {
  return (
    products.find(
      (product) =>
        product.metadata?.[expectedConfig.product.metadataKey] ===
        expectedConfig.product.metadataValue,
    ) ?? products.find((product) => product.name === expectedConfig.product.name) ?? null
  );
}

export function planProductSync({
  expectedConfig,
  products,
  prices,
}) {
  const managedProduct = findManagedProduct(products, expectedConfig);
  const productDiffs = [];

  if (managedProduct) {
    pushDiff(productDiffs, "name", managedProduct.name ?? null, expectedConfig.product.name);
    pushDiff(
      productDiffs,
      "description",
      managedProduct.description ?? null,
      expectedConfig.product.description,
    );
    pushDiff(
      productDiffs,
      `metadata.${expectedConfig.product.metadataKey}`,
      managedProduct.metadata?.[expectedConfig.product.metadataKey] ?? null,
      expectedConfig.product.metadataValue,
    );
  }

  const productAction = managedProduct ? (productDiffs.length > 0 ? "update" : "noop") : "create";
  const managedPrices = managedProduct
    ? prices.filter((price) => price.product === managedProduct.id)
    : [];

  const pricePlans = expectedConfig.prices.map((spec) => {
    const match =
      managedPrices.find(
        (price) =>
          price.currency === "jpy" &&
          price.unit_amount === spec.unitAmount &&
          price.recurring?.interval === spec.interval,
      ) ?? null;

    return {
      envVar: spec.envVar,
      lookupKey: spec.lookupKey,
      action: match ? "noop" : "create",
      existingId: match?.id ?? null,
      unitAmount: spec.unitAmount,
      interval: spec.interval,
    };
  });

  return {
    product: {
      action: productAction,
      id: managedProduct?.id ?? null,
      diffs: productDiffs,
    },
    prices: pricePlans,
  };
}

export function planWebhookSync({
  expectedConfig,
  endpoints,
}) {
  const matches = endpoints.filter((endpoint) => endpoint.url === expectedConfig.webhook.url);
  const endpoint = matches[0] ?? null;
  const actualEvents = sortedStrings(endpoint?.enabled_events ?? []);
  const expectedEvents = sortedStrings(expectedConfig.webhook.events);
  const missingEvents = expectedEvents.filter((event) => !actualEvents.includes(event));
  const extraEvents = actualEvents.filter((event) => !expectedEvents.includes(event));
  const duplicateEndpointIds = matches.slice(1).map((match) => match.id);

  return {
    action: endpoint
      ? missingEvents.length > 0 || extraEvents.length > 0 || duplicateEndpointIds.length > 0
        ? "update"
        : "noop"
      : "create",
    id: endpoint?.id ?? null,
    missingEvents,
    extraEvents,
    duplicateEndpointIds,
  };
}

export function buildExpectedPortalPayload({
  expectedConfig,
  productId,
  priceIds,
}) {
  return {
    active: true,
    default_return_url: expectedConfig.portal.returnUrl,
    business_profile: {
      headline: expectedConfig.portal.businessProfile.headline,
      privacy_policy_url: expectedConfig.portal.businessProfile.privacyPolicyUrl,
      terms_of_service_url: expectedConfig.portal.businessProfile.termsOfServiceUrl,
    },
    features: {
      customer_update: {
        enabled: expectedConfig.portal.features.customer_update.enabled,
        allowed_updates: sortedStrings(
          expectedConfig.portal.features.customer_update.allowed_updates,
        ),
      },
      invoice_history: {
        enabled: expectedConfig.portal.features.invoice_history.enabled,
      },
      payment_method_update: {
        enabled: expectedConfig.portal.features.payment_method_update.enabled,
      },
      subscription_cancel: {
        enabled: expectedConfig.portal.features.subscription_cancel.enabled,
        mode: expectedConfig.portal.features.subscription_cancel.mode,
        proration_behavior:
          expectedConfig.portal.features.subscription_cancel.proration_behavior,
      },
      subscription_update: {
        enabled: expectedConfig.portal.features.subscription_update.enabled,
        default_allowed_updates: sortedStrings(
          expectedConfig.portal.features.subscription_update.default_allowed_updates,
        ),
        proration_behavior:
          expectedConfig.portal.features.subscription_update.proration_behavior,
        products:
          productId && priceIds.length > 0
            ? [{ product: productId, prices: sortedStrings(priceIds) }]
            : [],
      },
    },
  };
}

function normalizePortalConfiguration(configuration) {
  if (!configuration) return null;
  return {
    active: configuration.active ?? true,
    default_return_url: configuration.default_return_url ?? null,
    business_profile: {
      headline: configuration.business_profile?.headline ?? null,
      privacy_policy_url: configuration.business_profile?.privacy_policy_url ?? null,
      terms_of_service_url: configuration.business_profile?.terms_of_service_url ?? null,
    },
    features: {
      customer_update: {
        enabled: configuration.features?.customer_update?.enabled ?? false,
        allowed_updates: sortedStrings(
          configuration.features?.customer_update?.allowed_updates ?? [],
        ),
      },
      invoice_history: {
        enabled: configuration.features?.invoice_history?.enabled ?? false,
      },
      payment_method_update: {
        enabled: configuration.features?.payment_method_update?.enabled ?? false,
      },
      subscription_cancel: {
        enabled: configuration.features?.subscription_cancel?.enabled ?? false,
        mode: configuration.features?.subscription_cancel?.mode ?? null,
        proration_behavior:
          configuration.features?.subscription_cancel?.proration_behavior ?? null,
      },
      subscription_update: {
        enabled: configuration.features?.subscription_update?.enabled ?? false,
        default_allowed_updates: sortedStrings(
          configuration.features?.subscription_update?.default_allowed_updates ?? [],
        ),
        proration_behavior:
          configuration.features?.subscription_update?.proration_behavior ?? null,
        products: (configuration.features?.subscription_update?.products ?? []).map(
          (product) => ({
            product: product.product ?? null,
            prices: sortedStrings(product.prices ?? []),
          }),
        ),
      },
    },
  };
}

export function planPortalSync({
  expectedConfig,
  productId,
  priceIds,
  configurations,
}) {
  const configuration =
    configurations.find((entry) => entry.is_default) ?? configurations[0] ?? null;
  const expectedPayload = buildExpectedPortalPayload({
    expectedConfig,
    productId,
    priceIds,
  });
  const expectedComparable = normalizePortalConfiguration(expectedPayload);
  const actualComparable = normalizePortalConfiguration(configuration);
  const diffs = [];

  if (configuration) {
    pushDiff(
      diffs,
      "default_return_url",
      actualComparable.default_return_url,
      expectedComparable.default_return_url,
    );
    pushDiff(
      diffs,
      "business_profile.headline",
      actualComparable.business_profile.headline,
      expectedComparable.business_profile.headline,
    );
    pushDiff(
      diffs,
      "business_profile.privacy_policy_url",
      actualComparable.business_profile.privacy_policy_url,
      expectedComparable.business_profile.privacy_policy_url,
    );
    pushDiff(
      diffs,
      "business_profile.terms_of_service_url",
      actualComparable.business_profile.terms_of_service_url,
      expectedComparable.business_profile.terms_of_service_url,
    );
    pushDiff(
      diffs,
      "features.customer_update.allowed_updates",
      actualComparable.features.customer_update.allowed_updates,
      expectedComparable.features.customer_update.allowed_updates,
    );
    pushDiff(
      diffs,
      "features.subscription_update.products",
      actualComparable.features.subscription_update.products,
      expectedComparable.features.subscription_update.products,
    );
    pushDiff(
      diffs,
      "features.subscription_cancel.mode",
      actualComparable.features.subscription_cancel.mode,
      expectedComparable.features.subscription_cancel.mode,
    );
    pushDiff(
      diffs,
      "features.subscription_cancel.proration_behavior",
      actualComparable.features.subscription_cancel.proration_behavior,
      expectedComparable.features.subscription_cancel.proration_behavior,
    );
  }

  return {
    action: configuration ? (diffs.length > 0 ? "update" : "noop") : "create",
    id: configuration?.id ?? null,
    diffs,
    payload: expectedPayload,
  };
}

export function getAccountDiffs({
  expectedConfig,
  account,
}) {
  const diffs = [];

  pushDiff(
    diffs,
    "business_profile.name",
    account?.business_profile?.name ?? null,
    expectedConfig.account.businessProfileName,
  );
  pushDiff(
    diffs,
    "business_profile.support_email",
    account?.business_profile?.support_email ?? null,
    expectedConfig.account.supportEmail,
  );
  pushDiff(
    diffs,
    "business_profile.support_url",
    account?.business_profile?.support_url ?? null,
    expectedConfig.account.supportUrl,
  );
  pushDiff(
    diffs,
    "business_profile.url",
    account?.business_profile?.url ?? null,
    expectedConfig.account.websiteUrl,
  );
  pushDiff(
    diffs,
    "settings.payments.statement_descriptor",
    account?.settings?.payments?.statement_descriptor ?? null,
    expectedConfig.account.statementDescriptor,
  );
  pushDiff(
    diffs,
    "settings.card_payments.statement_descriptor_prefix",
    account?.settings?.card_payments?.statement_descriptor_prefix ?? null,
    expectedConfig.account.statementDescriptor,
  );

  return diffs;
}

export function planAccountSync({
  expectedConfig,
  account,
}) {
  const diffs = getAccountDiffs({ expectedConfig, account });

  return {
    action: diffs.length > 0 ? "manual" : "noop",
    diffs,
    reason:
      diffs.length > 0
        ? "Stripe の自アカウント更新は Dashboard 運用を正本にするため、v1 は監査のみ対応"
        : null,
  };
}

export function auditManagedState({
  expectedConfig,
  account,
  products,
  prices,
  webhookEndpoints,
  portalConfigurations,
}) {
  const productPlan = planProductSync({
    expectedConfig,
    products,
    prices,
  });
  const managedProduct = findManagedProduct(products, expectedConfig);
  const priceIds = productPlan.prices
    .map((entry) => entry.existingId)
    .filter((entry) => typeof entry === "string");
  const webhookPlan = planWebhookSync({
    expectedConfig,
    endpoints: webhookEndpoints,
  });
  const portalPlan = planPortalSync({
    expectedConfig,
    productId: managedProduct?.id ?? null,
    priceIds,
    configurations: portalConfigurations,
  });
  const accountPlan = planAccountSync({
    expectedConfig,
    account,
  });

  const productHasDiff =
    productPlan.product.action !== "noop" ||
    productPlan.prices.some((entry) => entry.action !== "noop");
  const webhookHasDiff = webhookPlan.action !== "noop";
  const portalHasDiff = portalPlan.action !== "noop";
  const accountHasDiff = accountPlan.action !== "noop";

  const manualChecks = [
    {
      id: "commerce_disclosure_dashboard",
      title: "Commerce Disclosure URL が Dashboard に登録されているか",
      action:
        "Stripe Dashboard で Commerce Disclosure / 商取引に関する開示 URL を確認する",
      expected: expectedConfig.compliance.legalUrl,
      manual_check_required: true,
    },
  ];

  if (accountHasDiff) {
    manualChecks.push({
      id: "business_profile_dashboard",
      title: "Stripe の business profile / statement descriptor の整合",
      action: "Stripe Dashboard の事業者情報・サポート情報・明細表記を expected 値に合わせる",
      expected: expectedConfig.account,
      manual_check_required: true,
    });
  }

  const ok = !productHasDiff && !webhookHasDiff && !portalHasDiff && !accountHasDiff;
  const nextActions = [];

  if (productHasDiff) nextActions.push("scripts/stripe/sync-products.mjs を実行");
  if (webhookHasDiff) nextActions.push("scripts/stripe/sync-webhook.mjs を実行");
  if (portalHasDiff) nextActions.push("scripts/stripe/sync-portal.mjs を実行");
  if (accountHasDiff) nextActions.push("Dashboard で business profile / statement descriptor を確認");
  nextActions.push("Commerce Disclosure は Dashboard 上で手動確認");

  return {
    ok,
    summary: {
      products: productHasDiff ? "drift" : "ok",
      webhook: webhookHasDiff ? "drift" : "ok",
      portal: portalHasDiff ? "drift" : "ok",
      account: accountHasDiff ? "manual_review" : "ok",
      manualCheckCount: manualChecks.length,
    },
    diffs: {
      account: accountPlan.diffs,
      products: productPlan,
      webhook: webhookPlan,
      portal: portalPlan,
    },
    manualChecks,
    nextActions,
  };
}
