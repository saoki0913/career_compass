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

- **marketing/public 面** も **product + auth 面** も nonce-based CSP を使います。
- `script-src` は `nonce + strict-dynamic` を使い、`unsafe-inline` は許可しません。
- route 判定と nonce 生成は [`src/lib/security/csp.ts`](../../src/lib/security/csp.ts) と [`src/proxy.ts`](../../src/proxy.ts) が担当します。
- JSON-LD と Google Analytics も nonce を付与して描画します。

### CSP の残課題

- `style-src 'unsafe-inline'` は現状維持です。今回の対象は `script-src` の厳格化に限定しています。
- third-party script の棚卸しと hash/SRI の併用は今後の hardening 候補です。

### HSTS preload

`preload` ディレクティブは [hstspreload.org](https://hstspreload.org/) の要件を満たす場合のみ付与してください。現状の設定は `preload` なしです。

## ログとシークレット

- [`src/lib/logger.ts`](../../src/lib/logger.ts) の `logError` は、API キー・Bearer・メール形式などをパターンで `[REDACTED]` に置換してから出力します。
- 本番ではスタックトレースは開発環境のみに限定する実装です。
- Claude Code での `codex-company/.secrets/` 配下への直接 Read / cat / grep などは `.claude/hooks/secrets-guard.sh` が PreToolUse で block します。インベントリ確認は `zsh scripts/release/sync-career-compass-secrets.sh --check` のみ許可です。詳細は [`docs/ops/AI_HARNESS.md`](./AI_HARNESS.md) 5.3 節を参照してください。

## レート制限

- 分散 rate limit は [`src/lib/rate-limit.ts`](../../src/lib/rate-limit.ts) を使い、本番は Upstash Redis、本番で Upstash 障害時は in-memory fallback に切り替える fail-soft です。
- layered limiter と構造化 429 は [`src/lib/rate-limit-spike.ts`](../../src/lib/rate-limit-spike.ts) が担当します。
- FastAPI 側は [`backend/app/limiter.py`](../../backend/app/limiter.py) と各 router の explicit `@limiter.limit(...)` で coarse-grained に保護します。
- 主な対象は次です。
  - `review` / `conversation` / `draft` などの AI 呼び出し
  - `fetch-info` / `search-pages` / `search-corporate-pages` / `source-compliance/check`
  - `fetch-corporate` / `fetch-corporate-upload` / `delete-corporate-urls`
  - backend status poll (`fetch-corporate` GET, `es-review-status`)
- `source-compliance/check` は 1 request あたり最大 10 URL に制限しています。
- 429 は `RATE_LIMITED` の構造化 API error と `Retry-After` ヘッダを返し、`userMessage` は `しばらく待ってから再試行してください。` に統一します。

## BFF → FastAPI の principal 伝播（V-1 / D-10）

2026-04-14 セキュリティ監査で V-1（RAG テナント越境）と D-10（SSE 同時接続数
制御）の残論点として残っていた「サービス JWT だけでは actor 認可が表現でき
ない」問題を、新しい署名ヘッダ `X-Career-Principal` で解決しました。詳細仕
様は [`docs/security/principal_spec.md`](../security/principal_spec.md) を参
照。

- 実装（BFF）: [`src/lib/fastapi/career-principal.ts`](../../src/lib/fastapi/career-principal.ts) + [`src/lib/fastapi/client.ts`](../../src/lib/fastapi/client.ts) の `fetchFastApiWithPrincipal()`。
- 実装（FastAPI）: [`backend/app/security/career_principal.py`](../../backend/app/security/career_principal.py) の `require_career_principal("company" | "ai-stream")`。
- 鍵管理: `CAREER_PRINCIPAL_HMAC_SECRET` は `INTERNAL_API_JWT_SECRET` と独立
  して回転します。BFF と FastAPI で同値を設定してください。
- 適用範囲:
  - scope `"company"`: company-info RAG 系 11 エンドポイント（`/rag/build`、
    `/rag/context`、`/rag/upload-pdf` など）。principal の `company_id` が
    path の `company_id` と一致しない場合は 403。
  - scope `"ai-stream"`: ES review / motivation / gakuchika の SSE ハンドラ。
    `principal.actor.id` と `plan` で同時接続数制御（D-10）のキーを解決し
    ます。interview（start/turn/feedback/continue）は後続タスクで追従予定。
- フェイルオープン条件: principal 未送信でも service JWT 経路は従来どおり動
  作します（back-compat）。principal を**送った**リクエストが署名不正・期限
  切れ・scope 不一致・`company_id` 不一致なら即 4xx で拒否します。

### SSE 同時接続リース（D-10）

- 実装: [`backend/app/security/sse_concurrency.py`](../../backend/app/security/sse_concurrency.py) の `SseLease`。
- 方式: `SET concurrent_sse:{actor_id}:{lease_id} "1" EX 30` でリースを作成
  し、`SCAN MATCH` で現在数を数え、プラン別上限を超えたら 429 + `Retry-After`
  を返します。ストリーム中は 10 秒ごとに TTL を `EXPIRE` で延長し、`finally`
  で `DEL` します。クライアント切断やクラッシュでも TTL が掃除します。
- プラン別上限: guest=1, free=2, standard=3, pro=5。未知プランは最も厳しい
  `guest` にフォールバックして特権昇格を防止します。
- Redis 未設定時は no-op リースを返す fail-open です（既存 `cache` と同方針）。

## ペイロードサイズ上限（D-2）

大きな JSON / multipart を境界でブロックして、ルートレベル以前で DoS 的な
メモリ割り当てを防ぎます。

| 対象 | 上限 | 実装 |
|------|------|------|
| ① Next JSON API | 1 MiB | [`src/proxy.ts`](../../src/proxy.ts) の `validatePayloadSize()`。`Content-Type: application/json` の state-changing メソッドに適用。`Transfer-Encoding: chunked` は JSON では一律 413。 |
| ② Next upload API | 個別 20 MiB / 合計 50 MiB | [`src/app/api/companies/[id]/fetch-corporate-upload/route.ts`](../../src/app/api/companies/%5Bid%5D/fetch-corporate-upload/route.ts)。Content-Length と `file.size` 累積の 2 段で検証。 |
| ③ FastAPI JSON API | 1 MiB | [`backend/app/security/payload_limits.py`](../../backend/app/security/payload_limits.py) の `JsonPayloadSizeLimitMiddleware`。`application/json` のみ検査、multipart はルートに委譲。 |
| ④ FastAPI upload API | PDF 20 MiB（`MAX_PDF_UPLOAD_BYTES`） | [`backend/app/security/upload_limits.py`](../../backend/app/security/upload_limits.py) に集中。`enforce_pdf_upload_size()` を全 UploadFile 経路から呼ぶ。 |

4 象限すべてで 413 + 構造化エラーを返し、サーバー側ではログに bytes 数を記録
します。チャンク JSON は送信側の設定ミス／SSRF まがいの挙動なので、例外なく
拒否しています。

## 日次トークン消費上限

- 実装: [`src/lib/llm-cost-limit.ts`](../../src/lib/llm-cost-limit.ts) + [`src/app/api/_shared/llm-cost-guard.ts`](../../src/app/api/_shared/llm-cost-guard.ts)
- Upstash Redis でユーザー/ゲスト単位の日次トークンカウンタを管理。JST 0:00 でリセット。
- プラン別上限: guest 100K / free 500K / standard 2M / pro 5M tokens/day
- 上限超過時: HTTP 429 + `Retry-After` ヘッダ + `{ error: "daily_token_limit_exceeded" }`。LLM 呼び出し前に拒否。
- カウンタ更新: 各 AI ルートの成功パスで `incrementDailyTokenCount()` を fire-and-forget 実行。
- Fail-open: Upstash 障害時やエラー時は制限なしで通す（rate-limit.ts と同じ方針）。
- キルスイッチ: `DISABLE_TOKEN_LIMIT=true` 環境変数で全チェック+カウンタ更新を即座に無効化。デプロイ不要。
- FastAPI 側は `X-LLM-Tokens-Used` レスポンスヘッダ + SSE `internal_telemetry` でトークン数を Next.js へ伝達。

## 法令・問い合わせ先（現行実装メモ）

就活Pass の本番方針は [`docs/release/INDIVIDUAL_BUSINESS_COMPLIANCE.md`](../release/INDIVIDUAL_BUSINESS_COMPLIANCE.md) を正本とし、`/legal` の公開文面はページ本文に直接記載します。

一方、現行コードでは [`getCommerceDisclosure`](../../src/lib/legal/commerce-disclosure.ts) が `process.env` から文言を組み立てる実装も残っています。以下の `LEGAL_*` は、現行実装やフォーク環境で使うためのメモであり、就活Pass 本番公開方針の正本ではありません。

| 変数 | 用途 |
|------|------|
| `LEGAL_SUPPORT_EMAIL` | サポート・表記用メール |
| `LEGAL_SUPPORT_URL` | 問い合わせ URL（省略時はサイト内 `/contact`） |
| `LEGAL_REFUND_POLICY_URL` | 返金ポリシーへのリンク |
| `LEGAL_BUSINESS_NAME` | Stripe の Commerce Disclosure で表示する販売事業者名 |
| `LEGAL_REPRESENTATIVE_NAME` | Stripe の Commerce Disclosure で表示する運営責任者名 |
| `LEGAL_BUSINESS_ADDRESS` | Stripe の Commerce Disclosure で表示する所在地 |
| `LEGAL_PHONE_NUMBER` | Stripe の Commerce Disclosure で表示する電話番号 |
| `LEGAL_DISCLOSURE_REQUEST_EMAIL` | 開示請求受付メール（省略時はサポートメールと同じ） |
| `LEGAL_DISCLOSURE_REQUEST_NOTICE` | 販売事業者・運営責任者・所在地・電話番号を「請求時に開示」とする注記文 |
| `LEGAL_SALES_URL` | 特商法ページの販売 URL（省略時は `https://www.shupass.jp`） |

テンプレートは [`.env.example`](../../.env.example) を参照。就活Pass 本番の特商法ページ文言を確定させるときは、環境変数ではなく `/legal` の本文を更新してください。

## 公開マーケ素材と PII

- LP 用画像の差し替え手順と注意事項は [`docs/marketing/README.md`](../marketing/README.md) の「ランディングメディア」節。
- マーケ用モックに**実名・顔写真・個人の連絡先**を入れない方針です（`docs/SPEC.md` 第 24 章にも記載）。

## 次のフェーズ（インフラ・アプリ外）

- WAF / Bot 対策（Vercel / Cloudflare 等）
- Host / Origin / service JWT 前提の運用監視強化
- 依存パッケージの定期更新と脆弱性スキャン（`npm audit` 等）
