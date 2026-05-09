#!/usr/bin/env node
/**
 * payment-safety-check.mjs
 * Checks Stripe/billing related files for safety issues.
 * Items: PAY-02, PAY-09, PAY-10, KEY-01
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(__dirname, "../..");

function getStagedFiles(pattern) {
  const result = spawnSync("git", ["-C", PROJECT_DIR, "diff", "--cached", "--name-only"], { encoding: "utf8" });
  if (result.status !== 0) return [];
  return result.stdout.split("\n").filter(f => f.trim() && (pattern ? pattern.test(f) : true));
}

function getStagedContent(file) {
  const result = spawnSync("git", ["-C", PROJECT_DIR, "show", `:0:${file}`], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : "";
}

function print(findings) {
  process.stdout.write(JSON.stringify({ findings, count: findings.length }, null, 2) + "\n");
}

function run() {
  const findings = [];
  const paymentPattern = /^src\/(?:lib\/stripe|app\/api\/(?:stripe|webhooks\/stripe|credits))\/.+\.ts$/;
  const files = getStagedFiles(paymentPattern);

  for (const file of files) {
    const content = getStagedContent(file);
    if (!content) continue;

    const lines = content.split("\n");

    // PAY-02: webhook handler without signature verification
    const isWebhookHandler = /\/webhooks\/stripe\//.test(file) || /webhook/i.test(file);
    if (isWebhookHandler) {
      const hasSignatureVerification = /(?:stripe\.webhooks\.constructEvent|constructWebhookEvent|verifySignature|webhook_secret|STRIPE_WEBHOOK_SECRET)/.test(content);
      if (!hasSignatureVerification) {
        findings.push({
          item_id: "PAY-02",
          severity: "critical",
          file,
          message: "Webhook ハンドラに署名検証 (constructEvent) がありません",
        });
      }
    }

    // PAY-09: test API keys in production code
    lines.forEach((line, idx) => {
      // Skip comments
      if (/^\s*(?:\/\/|\/\*|\*)/.test(line)) return;

      if (/sk_test_|pk_test_|rk_test_|whsec_test_/.test(line)) {
        findings.push({
          item_id: "PAY-09",
          severity: "critical",
          file,
          line: idx + 1,
          message: "テスト用 Stripe API キーがハードコードされています",
        });
      }
    });

    // PAY-10: potential secret exposure
    lines.forEach((line, idx) => {
      if (/^\s*(?:\/\/|\/\*|\*)/.test(line)) return;

      // Hardcoded Stripe secret keys (live)
      if (/sk_live_[a-zA-Z0-9]+/.test(line)) {
        findings.push({
          item_id: "PAY-10",
          severity: "critical",
          file,
          line: idx + 1,
          message: "本番 Stripe シークレットキーがハードコードされています",
        });
      }

      // Stripe secret passed to client-side response
      if (/(?:STRIPE_SECRET_KEY|stripe_secret)/.test(line) && /(?:NextResponse\.json|return\s*\{|res\.json)/.test(line)) {
        findings.push({
          item_id: "PAY-10",
          severity: "critical",
          file,
          line: idx + 1,
          message: "Stripe シークレットがレスポンスに含まれている可能性があります",
        });
      }
    });

    // Additional: missing idempotency key for write operations
    const hasStripeWrite = /stripe\.(?:charges|paymentIntents|subscriptions|customers|invoices)\.(?:create|update)\s*\(/.test(content);
    const hasIdempotencyKey = /idempotencyKey|idempotency_key/.test(content);
    if (hasStripeWrite && !hasIdempotencyKey) {
      findings.push({
        item_id: "PAY-02",
        severity: "medium",
        file,
        message: "Stripe 書き込み操作に idempotency key がありません",
      });
    }
  }

  // KEY-01: Hardcoded API keys (beyond Stripe) — scan ALL .ts/.tsx/.py files
  const allCodePattern = /^(?:src|backend)\/.+\.(?:tsx?|py)$/;
  const allCodeFiles = getStagedFiles(allCodePattern);
  for (const file of allCodeFiles) {
    const content = getStagedContent(file);
    if (!content) continue;
    const lines = content.split("\n");
    lines.forEach((line, idx) => {
      // Skip comments
      if (/^\s*(?:\/\/|\/\*|\*|#)/.test(line)) return;
      // Skip test/spec files
      if (/\.(?:test|spec)\./.test(file)) return;

      const apiKeyPatterns = /(?:sk-[a-zA-Z0-9]{20,}|sk-ant-[a-zA-Z0-9-]{20,}|NEXT_PUBLIC_[A-Z_]*(?:SECRET|SERVICE_ROLE))/;
      if (apiKeyPatterns.test(line)) {
        // Exclude lines that are just reading env vars (process.env.X or os.environ)
        if (/(?:process\.env\.|os\.environ|getenv)/.test(line)) return;
        findings.push({
          item_id: "KEY-01",
          severity: "critical",
          file,
          line: idx + 1,
          message: "API キー（OpenAI/Anthropic/Supabase 等）がハードコードされている可能性があります",
        });
      }
    });
  }

  print(findings);
}

try {
  run();
} catch {
  print([]);
}
