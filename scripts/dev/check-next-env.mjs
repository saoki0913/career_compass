#!/usr/bin/env node
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

const localTrustedOrigins = "http://localhost:3000,http://127.0.0.1:3000";
const appEnvValues = new Set(["local", "staging", "production"]);
const deployedAppEnvValues = new Set(["staging", "production"]);

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

function parseAppEnv(value) {
  const env = clean(value);
  if (!env) return undefined;
  return appEnvValues.has(env) ? env : null;
}

function hasLocalhostOrigin(value) {
  try {
    return parseOriginEntries(value).some((origin) => {
      const parsed = new URL(origin.trim());
      return (
        parsed.protocol === "http:" &&
        (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1")
      );
    });
  } catch {
    return false;
  }
}

function normalizeOriginEntries(value) {
  return parseOriginEntries(value).map((origin) => new URL(origin.trim()).origin);
}

function originsExactlyMatch(value, expectedOrigins) {
  try {
    const origins = new Set(normalizeOriginEntries(value));
    return origins.size === expectedOrigins.length && expectedOrigins.every((origin) => origins.has(origin));
  } catch {
    return false;
  }
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

const appEnv = parseAppEnv(process.env.APP_ENV);
const publicAppEnv = parseAppEnv(process.env.NEXT_PUBLIC_APP_ENV);
if (appEnv === null) {
  failures.push({
    key: "APP_ENV",
    problem: "値の形式が不正です。",
    reason: "local / staging / production のいずれかである必要があります。",
    action: ".env.local の APP_ENV を local / staging / production のいずれかにしてください。",
  });
}
if (publicAppEnv === null) {
  failures.push({
    key: "NEXT_PUBLIC_APP_ENV",
    problem: "値の形式が不正です。",
    reason: "local / staging / production のいずれかである必要があります。",
    action: ".env.local の NEXT_PUBLIC_APP_ENV を local / staging / production のいずれかにしてください。",
  });
}
if (appEnv && publicAppEnv && appEnv !== publicAppEnv) {
  failures.push({
    key: "APP_ENV / NEXT_PUBLIC_APP_ENV",
    problem: "値が一致していません。",
    reason: "サーバー側とクライアント側で論理環境がずれると、認証や外部連携の検証が壊れます。",
    action: "APP_ENV と NEXT_PUBLIC_APP_ENV を同じ値にしてください。",
  });
}
if (
  (deployedAppEnvValues.has(appEnv) || deployedAppEnvValues.has(publicAppEnv)) &&
  hasLocalhostOrigin(process.env.BETTER_AUTH_TRUSTED_ORIGINS)
) {
  failures.push({
    key: "BETTER_AUTH_TRUSTED_ORIGINS",
    problem: "デプロイ環境向けの値に localhost が含まれています。",
    reason: "staging / production の認証信頼オリジンに localhost を含めると CSRF 境界が曖昧になります。",
    action: "staging は https://stg.shupass.jp、production は https://www.shupass.jp,https://shupass.jp にしてください。",
  });
}
const resolvedAppEnv = appEnv || publicAppEnv;
const expectedTrustedOrigins =
  resolvedAppEnv === "staging"
    ? ["https://stg.shupass.jp"]
    : resolvedAppEnv === "production"
      ? ["https://www.shupass.jp", "https://shupass.jp"]
      : null;
if (
  expectedTrustedOrigins &&
  !originsExactlyMatch(process.env.BETTER_AUTH_TRUSTED_ORIGINS, expectedTrustedOrigins)
) {
  failures.push({
    key: "BETTER_AUTH_TRUSTED_ORIGINS",
    problem: "デプロイ環境向けの値が期待値と一致していません。",
    reason: "staging / production の信頼オリジンは余分な origin を含めず、固定値に揃える必要があります。",
    action: `BETTER_AUTH_TRUSTED_ORIGINS=${expectedTrustedOrigins.join(",")} にしてください。`,
  });
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
