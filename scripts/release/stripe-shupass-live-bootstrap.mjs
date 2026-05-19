#!/usr/bin/env node

import {
  collectManagedState,
  createStripeClient,
  loadResolvedManagedConfig,
  parseCliArgs,
  syncPortal,
  syncProducts,
  syncWebhook,
} from "../stripe/shared.mjs";

async function main() {
  console.log("Stripe 本番ブートストラップ（就活Pass）\n");
  const args = parseCliArgs(["--target", "production", "--env", "live", ...process.argv.slice(2)]);
  const config = await loadResolvedManagedConfig(args);
  const stripe = await createStripeClient({ environment: args.environment, config });
  const state = await collectManagedState({ stripe });

  const productsResult = await syncProducts({
    stripe,
    config,
    state,
    dryRun: false,
  });
  const refreshedState = await collectManagedState({ stripe });
  const webhookResult = await syncWebhook({
    stripe,
    config,
    state: refreshedState,
    dryRun: false,
  });
  const portalResult = await syncPortal({
    stripe,
    config,
    state: refreshedState,
    dryRun: false,
  });

  for (const entry of productsResult.applied) {
    console.log(`Product/Price: ${entry.action} ${entry.id}`);
  }
  for (const entry of webhookResult.applied) {
    console.log(`Webhook: ${entry.action} ${entry.id}`);
  }
  for (const entry of portalResult.applied) {
    console.log(`Portal: ${entry.action} ${entry.id}`);
  }

  console.log("\n--- vercel-production.env 等に追記する行（値は控えてバンドルへ）---\n");
  for (const line of productsResult.envLines) {
    console.log(line);
  }
  if (portalResult.plan?.id) {
    console.log(`STRIPE_PORTAL_CONFIGURATION_ID=${portalResult.plan.id}`);
  }
  if (webhookResult.webhookSecret) {
    console.log("# STRIPE_WEBHOOK_SECRET was created; store it in the canonical secrets bundle only.");
  } else {
    console.log(
      "# STRIPE_WEBHOOK_SECRET: 既存 Webhook の場合は Dashboard → Webhooks → 該当エンドポイント → Signing secret をコピー"
    );
  }

  console.log("\n--- Dashboard での手動確認（Commerce / サポート）---\n");
  console.log(`Commerce / 特商法表記 URL: ${config.compliance.legalUrl}`);
  console.log(`プライバシー: ${config.compliance.privacyUrl}`);
  console.log(`利用規約: ${config.compliance.termsUrl}`);
  console.log(`サポートメール: ${config.account.supportEmail}`);
  console.log(`サポート / 問い合わせページ: ${config.compliance.supportPage}`);
  console.log(
    "\nStripe Dashboard → 設定 → 事業者情報 / Compliance 周辺で、上記と整合しているか確認してください。\n"
  );
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
