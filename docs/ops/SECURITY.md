# セキュリティ・ベースライン（就活Pass）

本番運用時に把握しておくべき、現状の実装ベースの整理です。脅威モデルの全列挙やペネトレーションテストの代替にはなりません。

## HTTP セキュリティヘッダー

`X-Frame-Options` などの共通ヘッダーは [`next.config.ts`](../../next.config.ts) の `headers()` で付与し、`Content-Security-Policy` は [`src/proxy.ts`](../../src/proxy.ts) で route-aware に付与します。

- `X-Frame-Options: DENY`（クリックジャッキング対策）
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security`（HTTPS 強制）
- `Permissions-Policy`（カメラ・マイク・位置情報などを無効化）
- 認証系・API パス向けの `X-Robots-Tag`（クロール抑制）

### CSP の現状

- **marketing/public 面** は static CSP を使います。`script-src` は `unsafe-inline` を残し、Google Analytics / JSON-LD / Stripe を許可します。
- **product + auth 面** は nonce-based CSP を使います。`script-src` は `nonce + strict-dynamic` を使い、`unsafe-inline` は許可しません。
- route 判定と nonce 生成は [`src/lib/security/csp.ts`](../../src/lib/security/csp.ts) と [`src/proxy.ts`](../../src/proxy.ts) が担当します。
- Next.js の nonce 方針に合わせ、product 面は route group layout 側で dynamic rendering に寄せています（`src/app/(product)/layout.tsx`, `src/app/(auth)/layout.tsx`）。

### CSP の残課題

- `style-src 'unsafe-inline'` は現状維持です。今回の対象は `script-src` の厳格化に限定しています。
- marketing/public 面の `unsafe-inline` 除去は次フェーズです。候補は hash/SRI 併用ですが、静的最適化と third-party script の棚卸しが必要です。

### HSTS preload

`preload` ディレクティブは [hstspreload.org](https://hstspreload.org/) の要件を満たす場合のみ付与してください。現状の設定は `preload` なしです。

## ログとシークレット

- [`src/lib/logger.ts`](../../src/lib/logger.ts) の `logError` は、API キー・Bearer・メール形式などをパターンで `[REDACTED]` に置換してから出力します。
- 本番ではスタックトレースは開発環境のみに限定する実装です。

## レート制限

- 分散 rate limit は [`src/lib/rate-limit.ts`](../../src/lib/rate-limit.ts) を使い、本番は Upstash Redis、ローカルは in-memory fallback です。
- layered limiter と構造化 429 は [`src/lib/rate-limit-spike.ts`](../../src/lib/rate-limit-spike.ts) が担当します。
- 主な対象は次です。
  - `review` / `conversation` / `draft` などの AI 呼び出し
  - `fetch-info` / `search-pages` / `search-corporate-pages` / `source-compliance/check`
  - `fetch-corporate` / `fetch-corporate-upload` / `delete-corporate-urls`
  - backend status poll (`fetch-corporate` GET, `es-review-status`)
- `source-compliance/check` は 1 request あたり最大 10 URL に制限しています。
- 429 は `RATE_LIMITED` の構造化 API error と `Retry-After` ヘッダを返します。

## 法令・問い合わせ先（環境変数）

特商法ページや問い合わせ表示で使う文言は [`getCommerceDisclosure`](../../src/lib/legal/commerce-disclosure.ts) が `process.env` から組み立てます。

**本番では次を明示的に設定することを推奨**します（未設定時はコード内デフォルトにフォールバックします）。

| 変数 | 用途 |
|------|------|
| `LEGAL_SUPPORT_EMAIL` | サポート・表記用メール |
| `LEGAL_SUPPORT_URL` | 問い合わせ URL（省略時はサイト内 `/contact`） |
| `LEGAL_REFUND_POLICY_URL` | 返金ポリシーへのリンク |
| `LEGAL_DISCLOSURE_REQUEST_EMAIL` | 開示請求受付メール（省略時はサポートメールと同じ） |
| `LEGAL_DISCLOSURE_REQUEST_NOTICE` | 販売事業者・運営責任者・所在地・電話番号を「請求時に開示」とする注記文 |
| `LEGAL_SALES_URL` | 特商法ページの販売 URL（省略時は `https://www.shupass.jp`） |

テンプレートは [`.env.example`](../../.env.example) を参照。フォークやステージングでは、誤って本番の連絡先が載らないよう必ず上書きしてください。

## 公開マーケ素材と PII

- LP 用画像の差し替え手順と注意事項は [`docs/marketing/README.md`](../marketing/README.md) の「ランディングメディア」節。
- マーケ用モックに**実名・顔写真・個人の連絡先**を入れない方針です（`docs/SPEC.md` 第 24 章にも記載）。

## 次のフェーズ（インフラ・アプリ外）

- WAF / Bot 対策（Vercel / Cloudflare 等）
- marketing/public 面の `unsafe-inline` 段階的撤廃
- 依存パッケージの定期更新と脆弱性スキャン（`npm audit` 等）
