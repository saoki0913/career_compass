# `X-Career-Principal` 仕様（BFF → FastAPI 受け渡し）

## 背景

Next.js BFF は、FastAPI に対して **サービス認証**（`Authorization: Bearer <internal-jwt>`）を使って「next-bff から来た呼び出しである」ことを証明している。しかし FastAPI 側の一部エンドポイント（company-info RAG、AI SSE）は、この上にさらに「誰の代わりに呼ばれているのか」を検証する必要がある。

代表例:

- **V-1**: `/rag/context`、`/rag/upload-pdf` などは、`companies.id` の所有者と呼び出し元のアクターが一致することを FastAPI 側でも assert したい。サービス JWT だけだと所有権改ざんが BFF のバグ 1 行で通る。
- **D-10**: SSE 同時接続数制御は actor 単位のリース管理が必要。サービス JWT はリクエスト単位の service context しか持たない。

BFF が発行する HS256 署名付きヘッダ `X-Career-Principal` でこの 2 要件を満たす。サービス JWT と **鍵・target・lifetime を分離**し、どちらか一方が漏れてももう一方でフェイルセーフが効くようにする。

## スコープ分離

用途違いの principal を使い回す攻撃（例: company scope で発行した principal を ai-stream endpoint に replay）を防ぐため、`scope` claim を必須にする。FastAPI 側 dependency は `expected_scope` を引数で受け、一致しない principal は 403 で拒否する。

| scope | 必須 claim | 代表 endpoint |
|------|-----------|-------------|
| `company` | `company_id` 必須 | `/company-info/rag/context`、`/company-info/rag/upload-pdf`、`/company-info/build`、`/company-info/crawl-corporate` 等 |
| `ai-stream` | `actor` + `plan` が必須。`company_id` は optional | `/es-review/stream`、`/motivation/*/stream`、`/interview/*/stream`、`/gakuchika/*/stream` 等 |

## ヘッダ仕様

- **ヘッダ名**: `X-Career-Principal`
- **形式**: `<base64url(header)>.<base64url(payload)>.<base64url(signature)>`
- **署名**: HMAC-SHA256。`header.payload` に対して、 `CAREER_PRINCIPAL_HMAC_SECRET` を鍵に署名
- **header**: `{"alg": "HS256", "typ": "JWT"}`
- **payload claim**:

| claim | 型 | 説明 |
|------|----|------|
| `iss` | string | 固定 `"next-bff"` |
| `aud` | string | 固定 `"career-compass-fastapi"` |
| `scope` | `"company"` \| `"ai-stream"` | 用途 |
| `actor.kind` | `"user"` \| `"guest"` | ログインユーザーかゲストか |
| `actor.id` | string | `users.id` / `guest_users.id` |
| `company_id` | string \| null | `scope == "company"` では必須 |
| `plan` | `"guest"` \| `"free"` \| `"standard"` \| `"pro"` | 同時接続数・レート上限の解決に使う |
| `iat` | int | 発行時刻 (epoch 秒) |
| `nbf` | int | `iat - 5` （時計ずれ許容） |
| `exp` | int | `iat + 60` （60 秒 TTL） |
| `jti` | string | 128bit base64url 乱数。将来 anti-replay を入れるときの key |

## 鍵管理

- **`CAREER_PRINCIPAL_HMAC_SECRET`** を `INTERNAL_API_JWT_SECRET` とは別 secret として管理する
- 正本は `codex-company/.secrets/career_compass`
- Vercel（BFF 側）と Railway（FastAPI 側）で同値を設定する
- 32 文字以上のランダム文字列を推奨

## 実装

### BFF (Next.js)

- `src/lib/fastapi/career-principal.ts`: `createCareerPrincipalHeader({ scope, actor, plan, companyId })`
- `src/lib/fastapi/client.ts`: `fetchFastApiWithPrincipal(path, { principal, ...init })`
- 既存の `fetchFastApiInternal()` は service 認証のみで動作する FastAPI 経路向けにそのまま残す（回帰しない）。

呼び出し例:

```ts
await fetchFastApiWithPrincipal("/company-info/rag/context", {
  method: "POST",
  body: JSON.stringify({ ... }),
  principal: {
    scope: "company",
    actor: { kind: session.user?.id ? "user" : "guest", id: identity.userId ?? identity.guestId! },
    companyId,
    plan,
  },
});
```

### FastAPI

- `backend/app/security/career_principal.py`:
  - `require_career_principal(expected_scope)` を dependency factory として提供
  - 成功時に `CareerPrincipal` dataclass を返す（`scope`, `actor_kind`, `actor_id`, `plan`, `company_id`, `jti`）
  - 失敗時は 401 / 403 / 503
- endpoint 側:
  ```python
  @router.post("/rag/context")
  async def rag_context(
      company_id: str,
      principal: CareerPrincipal = Depends(require_career_principal("company")),
      _service: dict = Depends(require_internal_service),
  ):
      if principal.company_id != company_id:
          raise HTTPException(status_code=403, detail="company_id mismatch")
      ...
  ```

## 攻撃シナリオと対策

| 攻撃 | 対策 |
|-----|-----|
| 署名改ざん（payload 書換え） | HMAC 検証で弾く |
| 別用途の principal を replay | `scope` claim + `expected_scope` 検証 |
| `company_id` 書換えによる他人の RAG アクセス | endpoint 側で path の `company_id` と principal の `company_id` を比較 |
| サービス JWT と principal secret 同時漏洩 | secret を別管理し個別ローテ可能にすることで blast radius を下げる |
| 古い principal の replay | `exp = iat + 60` で短命化。将来の強化策として `jti` を Redis にキャッシュして一度だけ受け付ける方式に拡張可能 |

## 関連ドキュメント

- `docs/review/security/security_audit_2026-04-14.md` — 監査時の V-1 / D-10 / D-12
- `docs/ops/SECURITY.md` — 運用時の総則
- `backend/app/security/internal_service.py` — サービス JWT（独立管理）
