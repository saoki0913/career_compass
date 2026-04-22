---
topic: security-auth
review_date: 2026-04-14
category: security
supersedes: null
status: active
---

# 認証・データ保護セキュリティ詳細

**監査日**: 2026-04-14
**対象**: 認証・認可（Better Auth, Guest Auth）、セッション管理、データ暗号化、セキュリティヘッダー

---

## Needs verification

### V-4: Better Auth レート制限の IP 解決

**Impact**

Better Auth v1.5.6 は本番環境でデフォルト rate limiting が有効であり、sign-in/sign-up に対して 10秒間に3回の制限が組み込まれている。ただし、reverse proxy（Vercel Edge Network）背後で `getIp()` が IP アドレスの取得に失敗した場合、**警告ログのみでレート制限がスキップされる**。アプリ側で `trustedProxies` は未設定。

**Evidence**

1. `src/lib/auth/index.ts` — `betterAuth()` の設定に `rateLimit` / `trustedProxies` の明示的設定なし
2. `package.json` — `"better-auth": "^1.5.6"`
3. Better Auth ソース（`node_modules/better-auth/dist/context/create-context.mjs:168`）:
   ```javascript
   enabled: options.rateLimit?.enabled ?? isProduction
   ```
4. Better Auth rate limiter（`node_modules/better-auth/dist/api/rate-limiter/index.mjs:109-114`）:
   ```javascript
   const ip = getIp(req, ctx.options);
   if (!ip) {
     if (!ipWarningLogged) {
       ctx.logger.warn("Rate limiting skipped: could not determine client IP...");
       ipWarningLogged = true;
     }
     return null;  // レート制限スキップ
   }
   ```
5. Better Auth デフォルトルール（同ファイル l.186-200）:
   - sign-in/sign-up/change-password/change-email: 10秒3回
   - password-reset/verification-email: 60秒3回

**Verification status**: Needs verification

**検証方法**

1. 本番環境（Vercel）のログで `"Rate limiting skipped: could not determine client IP"` の警告を検索
2. 本番で `POST /api/auth/sign-in/email` を短時間に4回以上送信し、429 が返るか確認
3. Vercel Edge Network が `x-forwarded-for` ヘッダーを付与しているか確認

**Recommendation**

`src/lib/auth/index.ts` の Better Auth 設定に以下を追加:

```typescript
export const auth = betterAuth({
  // ... 既存設定
  advanced: {
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
    },
  },
});
```

これにより Vercel Edge Network が付与する `x-forwarded-for` から IP を正しく取得できる。

---

## Design/ops concerns

### D-1: FastAPI localhost 認証バイパス

**Impact**

`INTERNAL_API_JWT_SECRET` 未設定 + localhost からのアクセス時に JWT 認証をスキップする開発用フォールバック。secret 未設定 + localhost 以外のホストからは 503 を返す。本番環境では `INTERNAL_API_JWT_SECRET` が設定されており、このフォールバックに到達しない。

**Evidence**

- `backend/app/security/internal_service.py:62-71`:
  ```python
  if not secret:
      if host in LOCAL_HOSTS:
          return {"service": INTERNAL_SERVICE_SUBJECT, "mode": "local-dev"}
      raise HTTPException(status_code=503, detail="internal service auth is not configured")
  ```
- `LOCAL_HOSTS = {"localhost", "127.0.0.1"}` (l.14)

**Verification status**: Confirmed（設計意図通り、本番リスクなし）

**Recommendation**

defense-in-depth として、`ENVIRONMENT=production` 時はフォールバックを無効化するガードを追加すると安全性が向上する。ただし現状で本番脆弱性ではない。

```python
if not secret:
    if os.getenv("ENVIRONMENT") == "production":
        raise HTTPException(status_code=503, detail="JWT secret required in production")
    if host in LOCAL_HOSTS:
        return {"service": INTERNAL_SERVICE_SUBJECT, "mode": "local-dev"}
```

---

### D-2: リクエストペイロードサイズ制限

**Impact**

API ルートに明示的なペイロードサイズ上限が設定されていない。Next.js App Router のデフォルト body parser 制限（通常 1MB for JSON）に依存。FastAPI 側にも明示的な制限なし。

**Evidence**

- `src/proxy.ts` — Content-Length チェックなし
- `backend/app/main.py` — body size middleware なし
- Next.js App Router のデフォルト制限は存在するが、明示的に設定されていない

**Verification status**: Fixed (2026-04-16)

**Recommendation**

Next.js proxy に Content-Length チェックを追加し、FastAPI に body size middleware を追加することを推奨。auth 系は 1MB、ファイルアップロードは 10MB 等のエンドポイント別制限が望ましい。

**Resolution (2026-04-16)**

Next / FastAPI × JSON / upload の 4 象限で個別に上限を明示し、いずれも境界で
413 + 構造化エラーを返す設計に改めた。詳細は [`docs/ops/SECURITY.md`](../../ops/SECURITY.md#ペイロードサイズ上限d-2) 節を参照。

| 象限 | 上限 | 実装 |
|------|------|------|
| ① Next JSON API | 1 MiB | [`src/proxy.ts`](../../../src/proxy.ts) の `validatePayloadSize()`。`Transfer-Encoding: chunked` も JSON では一律 413。 |
| ② Next upload API | 個別 20 MiB / 合計 50 MiB | [`src/app/api/companies/[id]/fetch-corporate-upload/route.ts`](../../../src/app/api/companies/%5Bid%5D/fetch-corporate-upload/route.ts)。Content-Length と `file.size` の 2 段検証。 |
| ③ FastAPI JSON API | 1 MiB | [`backend/app/security/payload_limits.py`](../../../backend/app/security/payload_limits.py) の `JsonPayloadSizeLimitMiddleware`。 |
| ④ FastAPI upload API | PDF 20 MiB | [`backend/app/security/upload_limits.py`](../../../backend/app/security/upload_limits.py) に中央化し、`enforce_pdf_upload_size()` を全 UploadFile 経路から呼ぶ。 |

関連テスト:

- `src/proxy.test.ts` — JSON 1MB 超 / chunked / multipart passthrough
- `src/app/api/companies/[id]/fetch-corporate-upload/route.test.ts` — 合計サイズ超過
- `backend/tests/shared/test_payload_limits.py` — FastAPI middleware

---

### D-3: ゲストトークン UUID 早期バリデーション

**Impact**

`readGuestDeviceTokenFromCookieHeader()` が cookie 値の UUID 形式を検証せずに返す。不正な形式のトークンは後段の `getGuestUser()` 内 `isValidDeviceToken()` で検証されるため、実害はない。不必要な DB 問い合わせが発生する可能性のみ。

**Evidence**

- `src/lib/auth/guest-cookie.ts:14-29` — cookie 値をそのまま返却
- `src/lib/auth/guest.ts:33-34` `isValidDeviceToken()` — UUID v4 形式を検証

**Verification status**: Confirmed（実害なし）

**Recommendation**

`readGuestDeviceTokenFromCookieHeader()` に UUID 形式チェックを追加し、不正な値を早期に null として返す。DB 問い合わせの無駄を防ぐマイクロ最適化。

---

### D-4: OAuth リフレッシュトークンのローテーション

**Impact**

Google OAuth のリフレッシュトークン年齢を追跡する仕組みがなく、長期間同じリフレッシュトークンが使用される。トークン自体は AES-256-GCM で暗号化されて保存されている。

**Evidence**

- `src/lib/calendar/connection.ts:210-234` `storeGoogleCalendarTokens()` — リフレッシュトークンを暗号化して保存。発行日時の追跡なし
- `src/lib/db/schema.ts` — `calendarSettings` テーブルに `googleRefreshTokenIssuedAt` 列なし

**Verification status**: Fixed (2026-04-16)

**Recommendation**

`calendarSettings` に `googleRefreshTokenIssuedAt` 列を追加し、90日以上経過したトークンに対して `googleCalendarNeedsReconnect: true` を設定してユーザーに再認証を促す。Google 側のトークン失効ポリシーにも依存するため、優先度は低い。

**Resolution (2026-04-16)**

- `calendarSettings.googleRefreshTokenIssuedAt` 列を追加（`src/lib/db/schema.ts` + `drizzle_pg/` 配下の migration）。
- `storeGoogleCalendarTokens()` は Google から新しい refresh token を受け取った
  ときに限り `issuedAt` を更新し、既存トークン保持時は変更しない。
- `getValidGoogleCalendarAccessToken()`（sync 経路）冒頭で 365 日超過を判定し、
  `markCalendarReconnectNeeded()` を呼んで `googleCalendarNeedsReconnect: true`
  をセット → UI から再接続を促す。Google 側の標準的な refresh-token ローテーション
  ポリシーと同期させつつ、GET 系 API では write を起こさない設計。
- 関連実装: [`src/lib/calendar/connection.ts`](../../../src/lib/calendar/connection.ts)。

---

### D-11: `/api/auth/` 配下のカスタムルートの CSRF 免除

**Impact**

`proxy.ts:40-44` の `CSRF_EXEMPT_PATHS` は `/api/auth/` で始まる全パスの CSRF 検証（Origin チェック + Double-Submit Cookie チェック）をスキップする。Better Auth の CSRF 保護は `src/app/api/auth/[...all]/route.ts` 経由のリクエストにのみ適用される。しかし `/api/auth/plan`、`/api/auth/onboarding`、`/api/auth/guest` は独立した Next.js API ルートであり、Better Auth の保護対象外。

結果として、これらのエンドポイントは CSRF 保護が一切なく、セッション cookie の `SameSite: lax` 属性のみに依存して cross-origin 攻撃を防いでいる。`SameSite: lax` は cross-origin POST では cookie を送信しないため、現状のブラウザ実装ではフォームベース CSRF は成立しないが、defense-in-depth として不十分。

**Evidence**

1. `src/proxy.ts:40-44` — `CSRF_EXEMPT_PATHS = ["/api/auth/", ...]` で CSRF 検証をスキップ
2. `src/proxy.ts:127-129` — `validateCsrf()` が Origin チェック前に early return するため Origin も検証されない
3. `src/app/api/auth/[...all]/route.ts` — Better Auth の catch-all ルート（CSRF 保護あり）
4. `src/app/api/auth/plan/route.ts` — 独立した Next.js ルート（Better Auth 管理外、CSRF 保護なし）
5. `src/app/api/auth/onboarding/route.ts` — 同上
6. `src/app/api/auth/guest/route.ts` — 同上（ただしゲストルートのため影響は限定的）

**対象ルート**

| ルート | メソッド | 影響度 |
|--------|---------|--------|
| `/api/auth/plan` | POST | High（C-1 と結合して plan escalation が CSRF-free で可能） |
| `/api/auth/onboarding` | POST | Low（onboarding データの上書きのみ） |
| `/api/auth/guest` | POST/GET | Low（ゲスト作成・検証のみ、rate limit あり） |

**Verification status**: Fixed (2026-04-16)

**Recommendation**

選択肢A（推奨）: `/api/auth/plan` と `/api/auth/onboarding` を `/api/settings/plan` と `/api/settings/onboarding` に移動し、`CSRF_EXEMPT_PATHS` の適用範囲から外す。

選択肢B: `CSRF_EXEMPT_PATHS` の `/api/auth/` を削除し、Better Auth の catch-all ルートには個別に `X-CSRF-Token` 検証スキップのロジックを設ける（Better Auth v1.5.6 は独自の CSRF 保護を持つため）。

選択肢C（最小変更）: `/api/auth/plan/route.ts` と `/api/auth/onboarding/route.ts` の冒頭で `getCsrfFailureReason(request)` を直接呼び出し、個別に CSRF 検証を行う。

**Resolution (2026-04-16)**

選択肢 B 寄りの方針で解消: [`src/proxy.ts`](../../../src/proxy.ts) の
`isBetterAuthManagedPath()` が `/api/auth/[...all]` 配下（Better Auth catch-all）
のみを short-circuit 対象とし、カスタムルート（`/api/auth/guest`、
`/api/auth/onboarding`、`/api/auth/plan`）は proxy の CSRF 検証を必ず通るよう
にした。`CSRF_EXEMPT_PATHS` から `/api/auth/` を削除し、代わりに
`CUSTOM_AUTH_ROUTE_PATHS` を明示列挙することで、将来カスタムルートが増えた場合
にも CSRF 穴が空きにくいホワイトリスト構造にした。

追加で route 側でも defense-in-depth として `getCsrfFailureReason()` 呼び出しを
残置している（C-1 対応の一部でもある）。

関連テスト: [`src/proxy.test.ts`](../../../src/proxy.test.ts) の
"proxy CSRF short-circuit (D-11)" describe ブロック。

---

### D-12: `/api/credits` のゲスト識別がヘッダー依存

**Impact**

`/api/credits` ルート（GET のみ）はゲスト識別に `request.headers.get("x-device-token")` を使用しており、標準の `getRequestIdentity()` / `readGuestDeviceTokenFromCookieHeader()` パターンを使用していない。`x-device-token` ヘッダーはクライアント JavaScript から設定されるため、HttpOnly cookie と比較してセキュリティレベルが低い。

ただし、この API は GET（読み取り専用）であり、ゲストのクレジット残高（常に 0）と無料枠情報を返すのみ。機密情報の漏洩やデータ変更のリスクは低い。

**Evidence**

1. `src/app/api/credits/route.ts:94` — `request.headers.get("x-device-token")` を直接使用
2. `src/app/api/_shared/request-identity.ts:39-43` — 標準パターンは cookie を優先し、`allowDeviceTokenHeader` オプションで header をフォールバックとして使用
3. 他にも `x-device-token` ヘッダーを直接使用するルートが多数存在（`documents/`, `notifications/`, `companies/[id]/deadlines/` 等）

**Verification status**: Fixed (2026-04-16)

**Recommendation**

長期的には全ルートを `getRequestIdentity()` に統一し、`x-device-token` ヘッダーの直接参照を廃止する。これは既に多数のルートで移行済みであり、残りのルートも順次移行すべき。ただしセキュリティ緊急度は低い（GET のみ、かつゲスト情報は機密性が低い）。

**Resolution (2026-04-16)**

`x-device-token` header の用途を次の 3 分類に棚卸しし、route 層から public header
参照を排除した。

- **Class I (identity 解決)**: `getRequestIdentity(request)` に統一。既定では
  public header を拒否し、HttpOnly `guest_device_token` cookie のみを信頼する。
  契約は [`src/app/api/_shared/request-identity.test.ts`](../../../src/app/api/_shared/request-identity.test.ts) で維持。
- **Class R (rate limit key)**: `readGuestDeviceToken(request)` 経由で cookie
  由来の device token を key にし、攻撃者が header を差し替えて制限を回避できる
  余地を塞いだ。
- **Class F (下流 FastAPI への forwarding)**: V-1 解消に伴い、企業所有権認可は
  `X-Career-Principal` 署名ヘッダに一本化。proxy が cookie から内部 header を
  再構成する経路のみ残す。

関連実装: `src/app/api/credits/route.ts`、`src/app/api/notifications/route.ts`、
`src/app/api/documents/[id]/threads/route.ts`、`src/app/api/companies/[id]/search-pages/route.ts`
ほか。

---

## 良好な実装の記録

### 認証基盤

| 項目 | 実装内容 | 根拠 |
|------|---------|------|
| セッション管理 | Better Auth による HttpOnly, Secure, SameSite: lax cookie | `src/lib/auth/ci-e2e.ts:32-38` (`getBetterAuthSessionCookieAttributes`) |
| ゲスト認証 | UUID v4 トークン、SHA-256 ハッシュ化して DB 保存、7日有効期限 | `src/lib/auth/guest.ts`, `src/lib/auth/guest-cookie.ts` |
| OAuth | Google OAuth 2.0、スコープ最小限（openid, email, profile） | `src/lib/auth/index.ts` |
| CSRF | Double-Submit Cookie + Origin 検証 + timing-safe 比較 | `src/lib/csrf.ts`, `src/proxy.ts:117-175` |
| 内部 JWT | HS256, 60秒有効期限, issuer/audience/subject 検証, timing-safe HMAC | `backend/app/security/internal_service.py` |
| リクエスト ID | 全リクエストに `X-Request-Id` 付与、エラーレスポンスに含有 | `src/app/api/_shared/error-response.ts` |

### データ保護

| 項目 | 実装内容 | 根拠 |
|------|---------|------|
| 暗号化 | AES-256-GCM（IV: 12byte, AuthTag: 16byte）で mypage パスワードと Google OAuth トークンを暗号化 | `src/lib/crypto.ts` |
| 所有権検証 | `userId XOR guestId` による排他的所有権モデル、全 API ルートで検証 | `src/app/api/_shared/owner-access.ts` |
| データ削除 | CASCADE DELETE でユーザー削除時に全関連データを自動削除 | `src/lib/db/schema.ts` |
| ログ秘匿化 | API キー、JWT、Bearer トークン、メールアドレスをマスク | `src/lib/logger.ts`, `backend/app/utils/secure_logger.py` |
| エラーレスポンス | 構造化エラー（`userMessage` + `action`）、本番で `developerMessage` / スタックトレース非表示 | `src/app/api/_shared/error-response.ts` |
| 資格情報分離 | `stripCompanyCredentials()` で API レスポンスから mypage パスワードを除去 | `src/lib/db/sanitize.ts` |

### セキュリティヘッダー

| ヘッダー | 値 | 設定場所 |
|---------|---|---------|
| Strict-Transport-Security | max-age=63072000 (2年) | `next.config.ts` |
| X-Frame-Options | DENY | `next.config.ts` |
| X-Content-Type-Options | nosniff | `next.config.ts`, `backend/app/main.py` |
| Content-Security-Policy | nonce-based, strict-dynamic | `src/proxy.ts:200-207` |
| Referrer-Policy | strict-origin-when-cross-origin | `next.config.ts` |
| Permissions-Policy | camera=(), microphone=(), geolocation=() | `next.config.ts` |
| Cross-Origin-Opener-Policy | same-origin-allow-popups | `next.config.ts` |
| Cross-Origin-Resource-Policy | same-site | `next.config.ts` |
| X-Robots-Tag | noindex, nofollow（auth/API パス） | `next.config.ts` |

### CI/E2E テスト認証

| 項目 | 実装内容 |
|------|---------|
| 本番ガード | `shupass.jp` / `www.shupass.jp` では無効化 |
| 認証 | `CI_E2E_AUTH_SECRET` + Bearer token + timing-safe 比較 |
| スコープ分離 | `+<scope>` email で並列テスト間のデータ分離 |
