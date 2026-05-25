#!/usr/bin/env node
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
const keys = ["STRIPE_SECRET_KEY", "STRIPE_SECRET_KEY_LIVE"];
const preloadedKeys = new Set(keys.filter((key) => process.env[key]));

// `next dev` と同じ手順でローカル環境変数を読み込む。Stripe secret の全文は
// 表示しない。prefix と length を手元の実値と照合し、必要なら
// `stripe whoami --api-key <実値>` でアカウントを確認する。
const result = loadEnvConfig(process.cwd(), true);

function describeEnvValue(key) {
  const value = process.env[key];
  if (!value) {
    return {
      key,
      configured: false,
      preloaded: preloadedKeys.has(key),
      prefix: "(missing)",
      length: 0,
    };
  }

  return {
    key,
    configured: true,
    preloaded: preloadedKeys.has(key),
    prefix: value.slice(0, 12),
    length: value.length,
  };
}

function formatDescription(description) {
  const status = description.configured ? "configured" : "missing";
  return `${description.key}: ${status}, prefix=${description.prefix}, length=${description.length}, preloadedBeforeNextEnv=${description.preloaded}`;
}

const loadedFiles = (result.loadedEnvFiles ?? []).map((file) => file.path);

for (const description of keys.map(describeEnvValue)) {
  process.stdout.write(`${formatDescription(description)}\n`);
}

process.stdout.write(
  `Loaded env files: ${loadedFiles.length > 0 ? loadedFiles.join(", ") : "(none)"}\n`,
);
process.stdout.write(
  [
    "",
    "次の作業:",
    "1. secret の全文をログやチャットに貼らないでください。",
    "2. 上の prefix と length を、手元の実値と照合してください。",
    "3. preloadedBeforeNextEnv=true の場合は、その変数を unset してから npm run dev を起動してください。",
    "4. 実値は stripe whoami --api-key <実値> でアカウントを確認してください。",
    "5. stripe listen は、そのコマンドが返したアカウントと同じアカウントで起動してください。",
    "",
  ].join("\n"),
);
