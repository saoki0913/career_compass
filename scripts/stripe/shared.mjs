import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Stripe from "stripe";

import {
  auditManagedState,
  buildExpectedPortalPayload,
  findManagedProducts,
  planPortalSync,
  planProductSync,
  planWebhookSync,
  resolveManagedStripeTarget,
  resolveStripeSecretKey,
} from "./core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const managedConfigPath = path.join(repoRoot, "src", "lib", "stripe", "managed-config.json");

export async function loadManagedConfig() {
  const raw = await readFile(managedConfigPath, "utf8");
  return JSON.parse(raw);
}

export async function loadResolvedManagedConfig(args) {
  const baseConfig = await loadManagedConfig();
  const resolved = resolveManagedStripeTarget({
    expectedConfig: {
      ...baseConfig,
      environmentExplicit: args.environmentExplicit,
    },
    target: args.target,
    environment: args.environment,
  });
  args.environment = resolved.environment;
  args.target = resolved.target?.name ?? args.target ?? null;
  return resolved.config;
}

export function parseCliArgs(argv) {
  const args = {
    environment: "test",
    environmentExplicit: false,
    target: null,
    json: false,
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (entry === "--env") {
      args.environment = argv[index + 1] ?? args.environment;
      args.environmentExplicit = true;
      index += 1;
    } else if (entry === "--target") {
      args.target = argv[index + 1] ?? args.target;
      index += 1;
    } else if (entry === "--json") {
      args.json = true;
    } else if (entry === "--dry-run") {
      args.dryRun = true;
    } else if (entry === "--help" || entry === "-h") {
      args.help = true;
    }
  }

  if (args.environment !== "test" && args.environment !== "live") {
    throw new Error(`--env には test か live を指定してください。受け取った値: ${args.environment}`);
  }

  return args;
}

export function printResult(result, { json }) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`# ${result.summary?.title ?? "Stripe Result"}`);
  console.log("");
  console.log(JSON.stringify(result, null, 2));
}

export async function createStripeClient({ environment, env = process.env, config }) {
  const secretKey = resolveStripeSecretKey({ environment, env });
  return new Stripe(secretKey, { apiVersion: config.apiVersion });
}

export async function collectManagedState({ stripe }) {
  const [account, products, prices, webhookEndpoints, portalConfigurations] = await Promise.all([
    stripe.accounts.retrieve(),
    stripe.products.list({ limit: 100, active: true }),
    stripe.prices.list({ limit: 100, active: true }),
    stripe.webhookEndpoints.list({ limit: 100 }),
    stripe.billingPortal.configurations.list({ limit: 20 }),
  ]);

  return {
    account,
    products: products.data,
    prices: prices.data,
    webhookEndpoints: webhookEndpoints.data,
    portalConfigurations: portalConfigurations.data,
  };
}

export function buildInspectSummary({ config, state }) {
  const matched = findManagedProducts(state.products, config);
  const webhookMatches = state.webhookEndpoints.filter(
    (endpoint) => endpoint.url === config.webhook.url,
  );
  const portalDefault =
    state.portalConfigurations.find((entry) => entry.is_default) ??
    state.portalConfigurations[0] ??
    null;

  const managedProducts = matched.map(({ spec, stripeProduct }) => {
    const managedPrices = stripeProduct
      ? state.prices.filter((price) => price.product === stripeProduct.id)
      : [];
    return {
      plan: spec.plan,
      product: stripeProduct
        ? {
            id: stripeProduct.id,
            name: stripeProduct.name,
            metadata: stripeProduct.metadata,
          }
        : null,
      prices: managedPrices.map((price) => ({
        id: price.id,
        unitAmount: price.unit_amount,
        interval: price.recurring?.interval ?? null,
        active: price.active,
        signature: `${price.unit_amount}:${price.recurring?.interval ?? ""}`,
      })),
    };
  });

  return {
    title: "Stripe inspect",
    target: config.activeTarget ?? null,
    managedProducts,
    webhookMatches: webhookMatches.map((endpoint) => ({
      id: endpoint.id,
      url: endpoint.url,
      enabledEvents: endpoint.enabled_events,
      apiVersion: endpoint.api_version ?? null,
      status: endpoint.status ?? null,
    })),
    staleWebhookEndpoints: planWebhookSync({
      expectedConfig: config,
      endpoints: state.webhookEndpoints,
    }).staleEndpoints,
    portalDefault: portalDefault
      ? {
          id: portalDefault.id,
          defaultReturnUrl: portalDefault.default_return_url,
          isDefault: portalDefault.is_default,
          active: portalDefault.active,
        }
      : null,
    account: {
      id: state.account.id,
      businessProfile: {
        name: state.account.business_profile?.name ?? null,
        supportEmail: state.account.business_profile?.support_email ?? null,
        supportUrl: state.account.business_profile?.support_url ?? null,
        websiteUrl: state.account.business_profile?.url ?? null,
      },
      statementDescriptor: state.account.settings?.payments?.statement_descriptor ?? null,
      statementDescriptorPrefix:
        state.account.settings?.card_payments?.statement_descriptor_prefix ?? null,
    },
    manualChecks: [
      {
        title: "Commerce Disclosure / legal URL は Dashboard で手動確認",
        expected: config.compliance.legalUrl,
      },
    ],
  };
}

export async function syncProducts({ stripe, config, state, dryRun }) {
  const plan = planProductSync({
    expectedConfig: config,
    products: state.products,
    prices: state.prices,
  });

  const matched = findManagedProducts(state.products, config);
  const applied = [];

  if (!dryRun) {
    for (const productPlan of plan.products) {
      const spec = productPlan.product.spec;
      let stripeProduct =
        matched.find((m) => m.spec.plan === spec.plan)?.stripeProduct ?? null;

      if (productPlan.product.action === "create") {
        stripeProduct = await stripe.products.create({
          name: spec.name,
          description: spec.description,
          metadata: { [spec.metadataKey]: spec.metadataValue },
        });
        productPlan.product.id = stripeProduct.id;
        applied.push({ type: "product", action: "create", id: stripeProduct.id, plan: spec.plan });
      } else if (productPlan.product.action === "update" && stripeProduct) {
        stripeProduct = await stripe.products.update(stripeProduct.id, {
          name: spec.name,
          description: spec.description,
          metadata: { [spec.metadataKey]: spec.metadataValue },
        });
        applied.push({ type: "product", action: "update", id: stripeProduct.id, plan: spec.plan });
      }

      for (const pricePlan of productPlan.prices) {
        if (pricePlan.action !== "create") continue;
        const created = await stripe.prices.create({
          product: stripeProduct.id,
          currency: "jpy",
          unit_amount: pricePlan.unitAmount,
          recurring: { interval: pricePlan.interval },
          metadata: { shupass_price: pricePlan.lookupKey },
        });
        pricePlan.existingId = created.id;
        applied.push({ type: "price", action: "create", id: created.id, envVar: pricePlan.envVar });
      }
    }
  }

  const envLines = plan.prices
    .map((entry) => (entry.existingId ? `${entry.envVar}=${entry.existingId}` : null))
    .filter(Boolean);

  return {
    ok: true,
    summary: {
      title: "Stripe sync-products",
      action: dryRun ? "dry-run" : "applied",
    },
    plan,
    applied,
    envLines,
  };
}

export async function syncWebhook({ stripe, config, state, dryRun }) {
  const plan = planWebhookSync({
    expectedConfig: config,
    endpoints: state.webhookEndpoints,
  });
  const applied = [];
  let secret = null;

  if (!dryRun) {
    if (plan.action === "create") {
      const created = await stripe.webhookEndpoints.create({
        url: config.webhook.url,
        enabled_events: config.webhook.events,
      });
      secret = created.secret ?? null;
      applied.push({ type: "webhook", action: "create", id: created.id });
      plan.id = created.id;
    } else if (plan.action === "update" && plan.id) {
      const updatePayload = {
        enabled_events: config.webhook.events,
        ...(plan.shouldEnable ? { disabled: false } : {}),
      };
      await stripe.webhookEndpoints.update(plan.id, updatePayload);
      applied.push({ type: "webhook", action: "update", id: plan.id });
    }
  }

  return {
    ok: true,
    summary: {
      title: "Stripe sync-webhook",
      action: dryRun ? "dry-run" : "applied",
    },
    plan,
    applied,
    webhookSecret: secret,
  };
}

export async function syncPortal({ stripe, config, state, dryRun }) {
  const productPlan = planProductSync({
    expectedConfig: config,
    products: state.products,
    prices: state.prices,
  });

  const totalExpectedPrices = config.products.reduce((sum, p) => sum + p.prices.length, 0);
  const productEntries = productPlan.products.map((entry) => ({
    productId: entry.product.id,
    priceIds: entry.prices
      .map((p) => p.existingId)
      .filter((id) => typeof id === "string"),
  }));
  const totalFoundPrices = productEntries.reduce((sum, e) => sum + e.priceIds.length, 0);

  if (
    productEntries.some((e) => !e.productId) ||
    totalFoundPrices !== totalExpectedPrices
  ) {
    return {
      ok: false,
      summary: {
        title: "Stripe sync-portal",
        action: "blocked",
      },
      reason: `managed products または ${totalExpectedPrices} Price が揃っていません。先に sync-products を実行してください。`,
      plan: null,
      applied: [],
    };
  }

  const plan = planPortalSync({
    expectedConfig: config,
    productEntries,
    configurations: state.portalConfigurations,
  });
  const applied = [];

  if (!dryRun) {
    if (plan.action === "create") {
      const created = await stripe.billingPortal.configurations.create({
        name: "就活Pass default",
        metadata: { shupass: "portal" },
        ...buildExpectedPortalPayload({
          expectedConfig: config,
          productEntries,
        }),
      });
      applied.push({ type: "portal", action: "create", id: created.id });
      plan.id = created.id;
    } else if (plan.action === "update" && plan.id) {
      await stripe.billingPortal.configurations.update(plan.id, {
        ...buildExpectedPortalPayload({
          expectedConfig: config,
          productEntries,
        }),
      });
      applied.push({ type: "portal", action: "update", id: plan.id });
    }
  }

  return {
    ok: true,
    summary: {
      title: "Stripe sync-portal",
      action: dryRun ? "dry-run" : "applied",
    },
    plan,
    applied,
  };
}

export function buildAuditResult({ config, state }) {
  const audit = auditManagedState({
    expectedConfig: config,
    account: state.account,
    products: state.products,
    prices: state.prices,
    webhookEndpoints: state.webhookEndpoints,
    portalConfigurations: state.portalConfigurations,
  });

  return {
    ...audit,
    summary: {
      title: "Stripe audit",
      ...audit.summary,
    },
  };
}
