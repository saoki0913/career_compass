---
topic: security
review_date: 2026-04-14
category: security
supersedes: null
status: active
---

# 就活Pass セキュリティ監査報告書

**実施日**: 2026-04-14
**対象**: career_compass リポジトリ (`develop` ブランチ, commit `eb50ecd`)
**手法**: 静的コード解析（認証・決済・AI/RAG・データ保護の4領域を網羅的に調査）

---

## エグゼクティブサマリ

就活Pass のセキュリティ基盤は全体として堅牢であり、CSRF・SSRF・SQLi・XSS・プロンプトインジェクション等の主要攻撃ベクトルに対して適切な防御が実装されている。一方、Stripe 課金を経ずにプラン entitlement を拡大できる認可不備（C-1）、未使用だが到達可能な legacy checkout エンドポイント（C-2）、LLM コスト上限の不在（C-3）の3件が Confirmed な脆弱性として特定された。加えて、RAG の tenant 境界設計や Better Auth のレート制限 IP 解決など4件が要検証として残る。

## 2026-04-16 追補: 修復ステータス

2026-04-14 時点で 20 issue が報告され、S-1 hotfix ほかで 11 件が先行して解消済み。
2026-04-16 の remediation ラウンドで運用堅牢性・defense-in-depth 系 7 件を
次の通り解消した（詳細は各 issue 節の「Resolution」を参照）。

| ID | 状態 | 対応概要 | 主な実装 |
|----|------|---------|---------|
| A-1 | Fixed | `confirmReservation()` を `db.transaction()` で原子化 | `src/lib/credits/reservations.ts` |
| D-2 | Fixed | Next / FastAPI × JSON / upload の 4 象限でサイズ上限を明示 | `src/proxy.ts`, `src/app/api/companies/[id]/fetch-corporate-upload/route.ts`, `backend/app/security/payload_limits.py`, `backend/app/security/upload_limits.py` |
| D-4 | Fixed | `calendarSettings.googleRefreshTokenIssuedAt` を追加し 365 日超で再接続要求 | `src/lib/db/schema.ts`, `src/lib/calendar/connection.ts` |
| D-10 | Fixed | SSE に TTL 付き lease + heartbeat + プラン別同時接続上限 | `backend/app/security/sse_concurrency.py`, ES review / motivation / gakuchika ルーター |
| D-11 | Fixed | `/api/auth/*` の CSRF short-circuit を Better Auth catch-all のみに限定 | `src/proxy.ts` |
| D-12 | Fixed | `x-device-token` header 依存を identity / rate-limit / downstream の 3 分類で棚卸し | `src/app/api/_shared/request-identity.ts`, 各 route |
| V-1 | Fixed | company-info RAG に `X-Career-Principal` 署名ヘッダを要求し `company_id` 認可を FastAPI で強制 | `backend/app/security/career_principal.py`, `src/lib/fastapi/career-principal.ts`, `docs/security/principal_spec.md` |

残 issue は C-1 / C-2 / C-3（Tier 1 すべて先行対応済み）、V-2 / V-3 / V-4、
D-1 / D-3 / D-5 / D-6 / D-7 / D-8 / D-9 のいずれも「対応見送り」もしくは
「ロードマップに計上」のステータスで、この監査ラウンドのスコープ外である。

---

## 発見事項一覧

### Tier 1: Confirmed by code

| ID | 概要 | OWASP | 詳細 |
|----|------|-------|------|
| C-1 | Stripe 未課金でのサーバサイド entitlement 拡大（D-11 で CSRF 免除も判明） | A01, A05 | [stripe_payment_security.md#C-1](stripe_payment_security.md#c-1-stripe-未課金でのサーバサイド-entitlement-拡大) |
| C-2 | Legacy checkout エンドポイント残存 | A01 | [stripe_payment_security.md#C-2](stripe_payment_security.md#c-2-legacy-checkout-エンドポイント残存) |
| C-3 | LLM コスト上限不在 | A04 | [llm_ai_security.md#C-3](llm_ai_security.md#c-3-llm-コスト上限不在) |

### Tier 2: Needs verification

| ID | 概要 | 詳細 |
|----|------|------|
| V-1 | RAG tenant 境界の設計リスク（**Fixed 2026-04-16**） | [llm_ai_security.md#V-1](llm_ai_security.md#v-1-rag-tenant-境界の設計リスク) |
| V-2 | 参考ES間接抽出（仮説） | [llm_ai_security.md#V-2](llm_ai_security.md#v-2-参考es間接抽出仮説) |
| V-3 | Unicode 正規化バイパス（仮説） | [llm_ai_security.md#V-3](llm_ai_security.md#v-3-unicode-正規化バイパス仮説) |
| V-4 | Better Auth レート制限の IP 解決 | [auth_data_protection.md#V-4](auth_data_protection.md#v-4-better-auth-レート制限の-ip-解決) |

### Tier 3: Design/ops concerns

| ID | 概要 | 詳細 |
|----|------|------|
| D-1 | FastAPI localhost 認証バイパス（開発用） | [auth_data_protection.md#D-1](auth_data_protection.md#d-1-fastapi-localhost-認証バイパス) |
| D-2 | リクエストペイロードサイズ制限（**Fixed 2026-04-16**） | [auth_data_protection.md#D-2](auth_data_protection.md#d-2-リクエストペイロードサイズ制限) |
| D-3 | ゲストトークン UUID 早期バリデーション | [auth_data_protection.md#D-3](auth_data_protection.md#d-3-ゲストトークン-uuid-早期バリデーション) |
| D-4 | OAuth リフレッシュトークンのローテーション（**Fixed 2026-04-16**） | [auth_data_protection.md#D-4](auth_data_protection.md#d-4-oauth-リフレッシュトークンのローテーション) |
| D-5 | サブスクリプション解約後のアクセス | [stripe_payment_security.md#D-5](stripe_payment_security.md#d-5-サブスクリプション解約後のアクセス) |
| D-6 | Webhook metadata からのプラン判定 | [stripe_payment_security.md#D-6](stripe_payment_security.md#d-6-webhook-metadata-からのプラン判定) |
| D-7 | アカウント削除時の Stripe 解約失敗 | [stripe_payment_security.md#D-7](stripe_payment_security.md#d-7-アカウント削除時の-stripe-解約失敗) |
| D-8 | ベクトルストアへの毒入れリスク | [llm_ai_security.md#D-8](llm_ai_security.md#d-8-ベクトルストアへの毒入れリスク) |
| D-9 | LLM 出力のコンテンツフィルタリング | [llm_ai_security.md#D-9](llm_ai_security.md#d-9-llm-出力のコンテンツフィルタリング) |
| D-10 | ストリーミング接続管理（**Fixed 2026-04-16**） | [llm_ai_security.md#D-10](llm_ai_security.md#d-10-ストリーミング接続管理) |
| D-11 | `/api/auth/` 配下のカスタムルートの CSRF 免除（**Fixed 2026-04-16**） | [auth_data_protection.md#D-11](auth_data_protection.md#d-11-apiauth-配下のカスタムルートの-csrf-免除) |
| D-12 | `/api/credits` のゲスト識別がヘッダー依存（**Fixed 2026-04-16**） | [auth_data_protection.md#D-12](auth_data_protection.md#d-12-apicredits-のゲスト識別がヘッダー依存) |

### Integrity / Auditability

| ID | 概要 | 詳細 |
|----|------|------|
| A-1 | クレジット残高の監査ログ整合性（**Fixed 2026-04-16**） | [stripe_payment_security.md#A-1](stripe_payment_security.md#a-1-クレジット残高の監査ログ整合性) |

---

## 良好な対策一覧

以下の領域は適切に実装されており、現時点で脆弱性は確認されていない。

| 領域 | 実装内容 | 根拠 |
|------|---------|------|
| CSRF 保護 | Double-Submit Cookie + Origin 検証 + Better Auth 自前保護（**注**: `/api/auth/` 配下のカスタムルートは D-11 参照） | `src/lib/csrf.ts`, `src/proxy.ts:117-175` |
| SSRF 防御 | private IP ブロック + HTTPS 強制 + リダイレクト検証 | `backend/app/utils/public_url_guard.py` |
| SQL インジェクション防御 | Drizzle ORM パラメタライズドクエリ | `src/lib/db/` 全体 |
| XSS 防御 | React 自動エスケープ + nonce-based CSP | `src/proxy.ts:200-207`, `next.config.ts` |
| 暗号化 | AES-256-GCM（mypage パスワード、Google OAuth トークン） | `src/lib/crypto.ts` |
| セキュリティヘッダー | HSTS 2年, X-Frame-Options: DENY, CSP strict-dynamic, Permissions-Policy | `next.config.ts`, `backend/app/main.py` |
| ログ秘匿化 | API キー・JWT・メールアドレスのマスク、本番スタックトレース非表示 | `src/lib/logger.ts`, `backend/app/utils/secure_logger.py` |
| Stripe Webhook | 署名検証 + 冪等性保護（`processedStripeEvents`） | `src/app/api/webhooks/stripe/route.ts` |
| プロンプトインジェクション | 日英バイリンガル検知、HIGH/MEDIUM 分類 + サニタイズ | `backend/app/utils/llm_prompt_safety.py` |
| 内部サービス認証 | HS256 JWT（60秒有効期限, timing-safe 比較） | `backend/app/security/internal_service.py` |
| Cookie | HttpOnly, Secure, SameSite: lax/strict | `src/lib/auth/guest-cookie.ts`, `src/lib/csrf.ts` |
| エラーレスポンス | 構造化エラー、本番で内部情報非公開、X-Request-Id | `src/app/api/_shared/error-response.ts` |
| Stripe 正規導線 | サーバ側 plan→priceId 解決 | `src/app/api/stripe/checkout/route.ts` |
| Better Auth レート制限 | sign-in: 10秒3回、パスワードリセット: 60秒3回（本番デフォルト有効） | Better Auth v1.5.6 組み込み |

---

## 推奨対応優先順位

| 優先度 | 対象 | 推奨アクション |
|--------|------|---------------|
| 1 (即時) | C-1 + D-11 | `/api/auth/plan` で有料プラン設定時に Stripe subscription status を検証 + CSRF 保護を追加（ルート移動またはインライン CSRF チェック） |
| 2 (即時) | C-2 | `src/app/api/checkout/route.ts` を削除、または priceId whitelist を追加 |
| 3 (短期) | C-3 | ユーザーあたりの日次トークン上限・月次コスト上限を実装 |
| 4 (短期) | V-4 | Better Auth の `trustedProxies` / `ipAddress.ipAddressHeaders` を設定し、本番での IP 解決を確認 |
| 5 (中期) | V-1 | Next.js → FastAPI の全 proxy 導線で所有権検証の網羅性を確認 |
| 6 (中期) | V-3 | プロンプトインジェクション検知に NFKC 正規化を追加、再現試験 |
| 7 (計画) | V-2 | 参考ES統計値の情報量評価、必要に応じてジッタ追加 |
| 8 (計画) | D-1〜D-12 | 設計・運用懸念の優先順位付けと個別対応 |
