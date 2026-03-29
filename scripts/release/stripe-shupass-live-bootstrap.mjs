#!/usr/bin/env node
/**
 * Stripe 本番: 就活Pass 用の商品・4 Price・Webhook・Customer Portal（デフォルト設定）を揃える。
 *
 * 前提:
 * - STRIPE_SECRET_KEY は sk_live_...（シークレットキー）。Stripe CLI プロファイルの rk_live だけだと --live が不安定なことがある。
 * - Commerce Disclosure（特商法 URL）は Dashboard の Compliance 系から登録（API に無い場合あり）。このスクリプト終了時に URL を表示する。
 *
 * 実行例:
 *   STRIPE_SECRET_KEY=sk_live_xxx node scripts/release/stripe-shupass-live-bootstrap.mjs
 *   npm run stripe:bootstrap-live
 */

import Stripe from "stripe";

const WEBHOOK_URL = "https://www.shupass.jp/api/webhooks/stripe";
const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
];

const PRODUCT_NAME = "就活Pass Subscription";
const PRODUCT_METADATA_KEY = "shupass_subscription";
const PRODUCT_METADATA_VALUE = "1";

const RETURN_URL = "https://www.shupass.jp/settings";
const PRIVACY_URL = "https://www.shupass.jp/privacy";
const TERMS_URL = "https://www.shupass.jp/terms";
const LEGAL_URL = "https://www.shupass.jp/legal";
const SUPPORT_EMAIL = "support@shupass.jp";
const SUPPORT_PAGE = "https://www.shupass.jp/contact";

/** @type {{ envVar: string, unitAmount: number, interval: 'month' | 'year', label: string }[]} */
const PRICE_SPECS = [
  {
    envVar: "STRIPE_PRICE_STANDARD_MONTHLY",
    unitAmount: 1480,
    interval: "month",
    label: "standard_monthly",
  },
  {
    envVar: "STRIPE_PRICE_STANDARD_ANNUAL",
    unitAmount: 14980,
    interval: "year",
    label: "standard_annual",
  },
  {
    envVar: "STRIPE_PRICE_PRO_MONTHLY",
    unitAmount: 2980,
    interval: "month",
    label: "pro_monthly",
  },
  {
    envVar: "STRIPE_PRICE_PRO_ANNUAL",
    unitAmount: 29800,
    interval: "year",
    label: "pro_annual",
  },
];

function die(msg) {
  console.error(msg);
  process.exit(1);
}

const key = process.env.STRIPE_SECRET_KEY || "";
if (!key.startsWith("sk_live_")) {
  die(
    "STRIPE_SECRET_KEY に sk_live_... のシークレットキーを設定してください（rk_live ではなく sk_live）。\n例: dotenv -e .env.local -- npm run stripe:bootstrap-live"
  );
}

const stripe = new Stripe(key, { apiVersion: "2025-12-15.clover" });

async function ensureProduct() {
  const list = await stripe.products.list({ limit: 100, active: true });
  let product = list.data.find(
    (p) =>
      p.metadata?.[PRODUCT_METADATA_KEY] === PRODUCT_METADATA_VALUE ||
      p.name === PRODUCT_NAME
  );
  if (product) {
    console.log(`商品: 既存 ${product.id} (${product.name})`);
    if (product.metadata?.[PRODUCT_METADATA_KEY] !== PRODUCT_METADATA_VALUE) {
      product = await stripe.products.update(product.id, {
        metadata: { [PRODUCT_METADATA_KEY]: PRODUCT_METADATA_VALUE },
      });
      console.log(`  metadata.${PRODUCT_METADATA_KEY} を付与しました`);
    }
    return product;
  }
  product = await stripe.products.create({
    name: PRODUCT_NAME,
    description:
      "就活Pass サブスクリプション（Standard / Pro、月額・年額）",
    metadata: { [PRODUCT_METADATA_KEY]: PRODUCT_METADATA_VALUE },
  });
  console.log(`商品: 新規作成 ${product.id}`);
  return product;
}

/**
 * @param {string} productId
 * @returns {Promise<Record<string, string>>}
 */
async function ensurePrices(productId) {
  const existing = await stripe.prices.list({
    product: productId,
    limit: 100,
    active: true,
  });
  /** @type {Record<string, string>} */
  const out = {};

  for (const spec of PRICE_SPECS) {
    const found = existing.data.find(
      (p) =>
        p.currency === "jpy" &&
        p.unit_amount === spec.unitAmount &&
        p.recurring?.interval === spec.interval
    );
    if (found) {
      out[spec.envVar] = found.id;
      console.log(`価格: 既存 ${spec.envVar}=${found.id} (¥${spec.unitAmount}/${spec.interval})`);
      continue;
    }
    const created = await stripe.prices.create({
      product: productId,
      currency: "jpy",
      unit_amount: spec.unitAmount,
      recurring: { interval: spec.interval },
      metadata: { shupass_price: spec.label },
    });
    out[spec.envVar] = created.id;
    console.log(`価格: 新規 ${spec.envVar}=${created.id} (¥${spec.unitAmount}/${spec.interval})`);
  }
  return out;
}

async function ensureWebhook() {
  const list = await stripe.webhookEndpoints.list({ limit: 100 });
  const match = list.data.find((e) => e.url === WEBHOOK_URL);
  if (match) {
    await stripe.webhookEndpoints.update(match.id, {
      enabled_events: WEBHOOK_EVENTS,
    });
    console.log(
      `Webhook: 既存エンドポイント ${match.id} の購読イベントを更新しました（署名シークレットは Dashboard で確認してください）`
    );
    return null;
  }
  const created = await stripe.webhookEndpoints.create({
    url: WEBHOOK_URL,
    enabled_events: WEBHOOK_EVENTS,
  });
  console.log(`Webhook: 新規 ${created.id}`);
  return created.secret || null;
}

/**
 * @param {string} productId
 * @param {string[]} priceIds
 */
async function ensurePortalConfiguration(productId, priceIds) {
  const list = await stripe.billingPortal.configurations.list({ limit: 20 });
  const cfg =
    list.data.find((c) => c.is_default) || list.data[0] || null;
  const features = {
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
      products: [{ product: productId, prices: priceIds }],
    },
  };
  const business_profile = {
    headline: "就活Pass",
    privacy_policy_url: PRIVACY_URL,
    terms_of_service_url: TERMS_URL,
  };

  if (cfg) {
    await stripe.billingPortal.configurations.update(cfg.id, {
      active: true,
      default_return_url: RETURN_URL,
      business_profile,
      features,
    });
    console.log(`Customer Portal: デフォルト設定を更新しました (${cfg.id})`);
    return;
  }

  const created = await stripe.billingPortal.configurations.create({
    name: "就活Pass default",
    metadata: { shupass: "portal" },
    default_return_url: RETURN_URL,
    business_profile,
    features,
  });
  console.log(
    `Customer Portal: 設定を新規作成しました (${created.id})。Dashboard でデフォルトにしていない場合は、設定を確認してください。`
  );
}

async function main() {
  console.log("Stripe 本番ブートストラップ（就活Pass）\n");
  const product = await ensureProduct();
  const priceMap = await ensurePrices(product.id);
  const priceIds = PRICE_SPECS.map((s) => priceMap[s.envVar]);
  const whSecret = await ensureWebhook();
  await ensurePortalConfiguration(product.id, priceIds);

  console.log("\n--- vercel-production.env 等に追記する行（値は控えてバンドルへ）---\n");
  for (const spec of PRICE_SPECS) {
    console.log(`${spec.envVar}=${priceMap[spec.envVar]}`);
  }
  if (whSecret) {
    console.log(`STRIPE_WEBHOOK_SECRET=${whSecret}`);
  } else {
    console.log(
      "# STRIPE_WEBHOOK_SECRET: 既存 Webhook の場合は Dashboard → Webhooks → 該当エンドポイント → Signing secret をコピー"
    );
  }

  console.log("\n--- Dashboard での手動確認（Commerce / サポート）---\n");
  console.log(`Commerce / 特商法表記 URL: ${LEGAL_URL}`);
  console.log(`プライバシー: ${PRIVACY_URL}`);
  console.log(`利用規約: ${TERMS_URL}`);
  console.log(`サポートメール: ${SUPPORT_EMAIL}`);
  console.log(`サポート / 問い合わせページ: ${SUPPORT_PAGE}`);
  console.log(
    "\nStripe Dashboard → 設定 → 事業者情報 / Compliance 周辺で、上記と整合しているか確認してください。\n"
  );
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
