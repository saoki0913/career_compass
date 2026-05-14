#!/usr/bin/env node
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

const localTrustedOrigins = "http://localhost:3000,http://127.0.0.1:3000";

function clean(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseOriginEntries(value) {
  const trimmed = clean(value);
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new Error("JSON array expected");
    }
    return parsed.map((entry) => String(entry));
  }

  return trimmed.split(",");
}

function validateOriginList(value) {
  const origins = parseOriginEntries(value);
  if (origins.length === 0) {
    return false;
  }

  for (const origin of origins) {
    const parsed = new URL(origin.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
  }

  return true;
}

const checks = [
  {
    key: "NEXT_PUBLIC_APP_URL",
    required: false,
    validate: (value) => {
      new URL(value);
      return true;
    },
    reason: "設定されている場合は公開アプリURLとして有効な URL である必要があります。",
    action: ".env.local の NEXT_PUBLIC_APP_URL を URL 形式に直してください。未設定なら localhost が使われます。",
  },
  {
    key: "BETTER_AUTH_URL",
    required: false,
    validate: (value) => {
      new URL(value);
      return true;
    },
    reason: "設定されている場合は Better Auth の baseURL として有効な URL である必要があります。",
    action: ".env.local の BETTER_AUTH_URL を URL 形式に直してください。未設定なら localhost が使われます。",
  },
  {
    key: "BETTER_AUTH_TRUSTED_ORIGINS",
    required: false,
    validate: validateOriginList,
    reason: "設定されている場合は Better Auth の CSRF / origin 検証で使える origin 形式である必要があります。",
    action: `.env.local の BETTER_AUTH_TRUSTED_ORIGINS を修正してください。ローカル例: ${localTrustedOrigins}`,
  },
  {
    key: "DATABASE_URL",
    required: false,
    validate: (value) => {
      new URL(value);
      return true;
    },
    reason: "設定されている場合は Postgres 接続 URL として有効な URL である必要があります。",
    action: ".env.local の DATABASE_URL を修正してください。DB を使わない画面確認だけなら未設定でも起動できます。",
  },
  {
    key: "BETTER_AUTH_SECRET",
    required: false,
    validate: (value) => value.trim().length >= 32,
    reason: "設定されている場合は Better Auth の署名用 secret として 32 文字以上が必要です。",
    action: "Google ログインをローカルで使う場合は 32 文字以上の BETTER_AUTH_SECRET を設定してください。",
  },
];

const failures = [];

for (const check of checks) {
  const value = clean(process.env[check.key]);
  if (!value) {
    if (check.required) {
      failures.push({ ...check, problem: "未設定です。" });
    }
    continue;
  }

  try {
    if (!check.validate(value)) {
      failures.push({ ...check, problem: "値の形式が不正です。" });
    }
  } catch {
    failures.push({ ...check, problem: "値の形式が不正です。" });
  }
}

if (failures.length > 0) {
  const lines = [
    "",
    "Next.js local dev の起動前チェックで環境変数の問題を検出しました。",
    "secret の値は表示していません。以下の項目を .env.local で修正してから npm run dev を再実行してください。",
    "",
    ...failures.flatMap((failure) => [
      `- ${failure.key}: ${failure.problem}`,
      `  理由: ${failure.reason}`,
      `  次の作業: ${failure.action}`,
    ]),
    "",
  ];
  process.stderr.write(`${lines.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("Next.js local dev env preflight: OK\n");
