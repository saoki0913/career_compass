---
topic: llm-cost-control
plan_date: 2026-04-14
based_on_review: security/security_audit_2026-04-14.md
status: 実装済み
implementation_level: 手順書レベル
---

# LLM コスト上限 実装ガイド

## 0. このドキュメントの読み方

- **対象読者**: ジュニアエンジニア（Next.js API Route / FastAPI の基本経験あり）
- **前提知識**: TypeScript, Python (FastAPI), Redis の GET/INCRBY 操作, HTTP ヘッダ
- **用語集**: 末尾「8. 用語集」を参照
- **関連ドキュメント**:
  - レビュー根拠: `docs/review/security/security_audit_2026-04-14.md` (C-3)
  - 分離元: `SECURITY_HOTFIX_PLAN.md` S-3
  - 既存レート制限: `src/lib/rate-limit.ts`, `src/lib/rate-limit-spike.ts`
  - トークン計測: `backend/app/utils/llm_usage_cost.py`
  - ID 解決: `src/app/api/_shared/request-identity.ts`

---

## 1. 背景と目的

### なぜ必要か

`backend/app/limiter.py` は IP ベースのリクエスト数制限（slowapi, 60 req/min）のみ。トークン消費量の上限は未実装。推定最大コスト: 60 req/min × 15,000 tokens/req × $3/1M tokens = **$162/hour**（単一ユーザー）。

`backend/app/utils/llm_usage_cost.py` の ContextVar (`_request_llm_cost_summary_var`) でリクエスト単位のコストを追跡しログ出力するが、上限チェックや拒否ロジックはない。

### 完了後の期待状態

- ユーザー/ゲスト単位の日次トークン消費上限が機能している
- 上限超過時に 429 + `Retry-After` ヘッダが返る
- 通常利用（1 日数回のレビュー/添削）では上限に達しない
- Upstash 障害時は fail-open（制限なしで通す）

### スコープ外

- 月次/週次のトークン上限（日次のみ）
- ユーザーへの残量表示 UI（バックエンド＋API のみ）
- トークン消費量のダッシュボード（ログ出力のみ）

---

## 2. 事前準備チェックリスト

- [ ] ブランチ作成: `feature/llm-cost-limit`
- [ ] `npm run build` が PASS すること
- [ ] `cd backend && python -m pytest` が PASS すること
- [ ] Upstash Redis 接続確認: `UPSTASH_REDIS_REST_URL` と `UPSTASH_REDIS_REST_TOKEN` が `.env` にあること（本番は既に設定済み）
- [ ] 依存タスク: SECURITY_HOTFIX_PLAN の S-4 完了が望ましい（必須ではない）

---

## 3. タスク一覧

| ID | タスク名 | 対象ファイル | 推定工数 | 依存 | blast radius |
|----|---------|-------------|---------|------|-------------|
| C-1 | FastAPI: X-LLM-Tokens-Used レスポンスヘッダ追加 | `backend/app/utils/llm_usage_cost.py`, FastAPI middleware | 2h | なし | 低 (ヘッダ追加のみ) |
| C-2 | 新モジュール `src/lib/llm-cost-limit.ts` 作成 | 新規ファイル | 3h | なし | 低 (新規ファイル) |
| C-3 | Proxy 統合: ヘッダ読取り → Upstash カウンタ更新 | `src/proxy.ts` | 2h | C-1 | 中 (全 AI ルートに影響) |
| C-4 | AI stream route にプレチェック組込み | 4 stream route.ts | 2h | C-2 | 中 (全 AI ルートに影響) |

---

## 4. 各タスクの詳細手順

### Task C-1: FastAPI — X-LLM-Tokens-Used レスポンスヘッダ追加

#### 4.1.1 目的

FastAPI が LLM 呼び出し後のレスポンスに `X-LLM-Tokens-Used` ヘッダを付与し、Next.js proxy がトークン消費量を受け取れるようにする。

#### 4.1.2 対象ファイル

| ファイル | 操作 | 概要 |
|---------|------|------|
| `backend/app/utils/llm_usage_cost.py` | 変更 | `consume_request_llm_cost_summary()` のトークン合計計算を公開関数化 |
| `backend/app/main.py` | 変更 | レスポンスヘッダ付与の middleware 追加 |

#### 4.1.3 手順

**Step 1: トークン合計を返す関数を追加**
- ファイル: `backend/app/utils/llm_usage_cost.py`
- `consume_request_llm_cost_summary()` (L245) の近くに新関数を追加
- 関数名: `get_request_total_tokens() -> int`
- 処理: `_request_llm_cost_summary_var.get()` から `input_tokens_total` + `output_tokens_total` + `reasoning_tokens_total` を合計して返す
- ContextVar が None の場合は 0 を返す
- **注意**: `consume_request_llm_cost_summary()` と異なり、ContextVar をリセットしない（peek のみ）

**Step 2: FastAPI middleware でレスポンスヘッダを付与**
- ファイル: `backend/app/main.py`
- 新しい middleware 関数を追加（`@app.middleware("http")` デコレータ）
- 処理:
  1. `response = await call_next(request)` でリクエスト処理
  2. `from app.utils.llm_usage_cost import get_request_total_tokens`
  3. `total = get_request_total_tokens()`
  4. `response.headers["X-LLM-Tokens-Used"] = str(total)`
  5. `return response`
- SSE (streaming) レスポンスの場合: `StreamingResponse` ではヘッダが先に送信されるため、トークン計測は streaming 完了後。streaming route ではこのヘッダは 0 になる可能性がある → **C-3 で別途対応**

**Step 3: streaming route でのトークン報告**
- SSE streaming の場合、最後の SSE イベントでトークン使用量を含める方式を検討
- 既存の SSE イベントに `tokens_used` フィールドを追加する（各 router の streaming 終了時点で `consume_request_llm_cost_summary()` を呼び出し、結果を最終イベントに含める）
- 対象ルーター: `es_review.py`, `motivation.py`, `interview.py`, `gakuchika.py` の streaming endpoint

#### 4.1.4 受入基準

- [ ] AC-1: 非 streaming の FastAPI レスポンスに `X-LLM-Tokens-Used` ヘッダが付与される
- [ ] AC-2: ヘッダ値が 0 以上の整数文字列である
- [ ] AC-3: LLM を呼ばないエンドポイント（例: `/health`）ではヘッダ値が `0`
- [ ] AC-4: streaming endpoint の最終 SSE イベントに `tokens_used` フィールドが含まれる

#### 4.1.5 テスト仕様

| テスト種別 | コマンド / 手順 | 期待結果 |
|-----------|----------------|---------|
| ユニットテスト | `cd backend && python -m pytest tests/ -k "test_llm_tokens_header"` | PASS (新規テスト作成) |
| 手動確認 | `curl -v http://localhost:8000/health` | レスポンスヘッダに `X-LLM-Tokens-Used: 0` |
| 手動確認 | ES 添削を 1 回実行し、最終 SSE イベントを確認 | `tokens_used` フィールドが正の整数 |
| 型チェック | `cd backend && mypy app/utils/llm_usage_cost.py` (型チェッカーがある場合) | エラーなし |

#### 4.1.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|--------|-------|---------|------|
| middleware 追加でレスポンス遅延 | 低 | 低 | ContextVar の参照のみで I/O なし |
| streaming レスポンスでヘッダが0になる | 中 | 高 | Step 3 で SSE 最終イベント方式を併用 |
| 既存の middleware 順序と競合 | 低 | 低 | `main.py` の middleware 順序を確認し最後に追加 |

#### 4.1.7 ロールバック手順

```bash
git revert <commit>
# middleware を削除するだけ。DB 変更なし
```

---

### Task C-2: 新モジュール `src/lib/llm-cost-limit.ts` 作成

#### 4.2.1 目的

Upstash Redis を使った日次トークン消費カウンタの管理と上限チェックを行うモジュールを新規作成する。

#### 4.2.2 対象ファイル

| ファイル | 操作 | 概要 |
|---------|------|------|
| `src/lib/llm-cost-limit.ts` | 新規 | 日次トークン上限チェック + カウンタ更新 |

#### 4.2.3 手順

**Step 1: ファイルを作成**
- パス: `src/lib/llm-cost-limit.ts`
- パターン参照: `src/lib/rate-limit.ts` の Upstash Redis 初期化パターンを踏襲

**Step 2: 定数を定義**
- プラン別日次トークン上限:
  ```
  guest:    100,000 tokens/day
  free:     500,000 tokens/day
  standard: 2,000,000 tokens/day
  pro:      5,000,000 tokens/day
  ```
- Redis キーフォーマット: `daily_llm_tokens:{userId|guestId}:{YYYY-MM-DD_JST}`
- TTL: 25 時間 (= 90,000 秒)
- 環境変数によるバイパス: `DISABLE_TOKEN_LIMIT=true` で全チェックをスキップ

**Step 3: JST 日付取得ユーティリティ**
- 関数名: `getJstDateString(): string`
- 処理: `new Date()` を JST (UTC+9) に変換し、`YYYY-MM-DD` 形式で返す
- 実装: `new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" })` を使用

**Step 4: Redis キー生成**
- 関数名: `buildDailyTokenKey(identity: string): string`
- 処理: `daily_llm_tokens:${identity}:${getJstDateString()}`

**Step 5: 上限チェック関数を実装**
- 関数名: `checkDailyTokenLimit(identity: RequestIdentity, plan: "guest" | "free" | "standard" | "pro"): Promise<{ allowed: boolean; remaining: number; resetAtUtc: Date }>`
- 処理:
  1. `DISABLE_TOKEN_LIMIT=true` なら即座に `{ allowed: true, remaining: Infinity, resetAtUtc: ... }` を返す
  2. identity から `userId || guestId` を取得。null なら `allowed: true` (匿名は制限しない)
  3. Upstash Redis クライアントを取得（`rate-limit.ts` と同じ `isUpstashConfigured()` チェック）
  4. `redis.get(key)` で現在値を取得
  5. 上限テーブルから `plan` の上限を参照
  6. 現在値 >= 上限 なら `allowed: false`
  7. `resetAtUtc` は次の JST 0:00 を UTC で返す
  8. Upstash エラー時は **fail-open** (`allowed: true`)
- **重要**: `rate-limit.ts:163-188` の `checkRateLimit()` と同様の try-catch + fail-soft パターンを踏襲

**Step 6: カウンタ更新関数を実装**
- 関数名: `incrementDailyTokenCount(identity: RequestIdentity, tokensUsed: number): Promise<void>`
- 処理:
  1. `DISABLE_TOKEN_LIMIT=true` なら何もしない
  2. identity から `userId || guestId` を取得。null ならスキップ
  3. Redis キーを生成
  4. `redis.incrby(key, tokensUsed)` でアトミック加算
  5. キーが新規作成された場合は `redis.expire(key, 90000)` で TTL 設定
  6. Upstash エラー時はログ出力のみ（fail-soft）

**Step 7: Retry-After 計算ユーティリティ**
- 関数名: `getRetryAfterSeconds(): number`
- 処理: 次の JST 0:00 までの秒数を計算して返す

#### 4.2.4 受入基準

- [ ] AC-1: `src/lib/llm-cost-limit.ts` が存在し、`checkDailyTokenLimit` と `incrementDailyTokenCount` をエクスポートしている
- [ ] AC-2: `DISABLE_TOKEN_LIMIT=true` 設定時に全チェックが `allowed: true` を返す
- [ ] AC-3: Upstash 未設定時（開発環境）に例外が発生せず `allowed: true` を返す
- [ ] AC-4: `npm run build` が型エラーなしで完了する

#### 4.2.5 テスト仕様

| テスト種別 | コマンド / 手順 | 期待結果 |
|-----------|----------------|---------|
| 型チェック | `npm run build` | エラー 0 |
| ユニットテスト | `npm run test:unit -- --grep "llm-cost-limit"` | PASS (新規テスト作成) |
| テスト内容 1 | `getJstDateString()` が `YYYY-MM-DD` 形式の文字列を返す | 形式一致 |
| テスト内容 2 | `DISABLE_TOKEN_LIMIT=true` で `checkDailyTokenLimit()` → `allowed: true` | PASS |
| テスト内容 3 | Upstash 未設定で `checkDailyTokenLimit()` → `allowed: true` | PASS |
| テスト内容 4 | `getRetryAfterSeconds()` が 0〜86400 の範囲の整数を返す | 範囲内 |

#### 4.2.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|--------|-------|---------|------|
| JST 日付境界での競合状態 (23:59 のリクエストが 0:00 跨ぎ) | 低 | 低 | TTL 25h で 1h のバッファを確保 |
| Upstash 障害でカウンタが更新されない | 低 | 低 | fail-open で通す。ログで検知 |
| プラン変更時に旧プランの上限が残る | 低 | 低 | 日次リセットのため最大 24h で自然解消 |

#### 4.2.7 ロールバック手順

```bash
# 新規ファイルのため削除するだけ
rm src/lib/llm-cost-limit.ts
rm src/lib/__tests__/llm-cost-limit.test.ts  # テストファイルも
```

---

### Task C-3: Proxy 統合 — ヘッダ読取り → Upstash カウンタ更新

#### 4.3.1 目的

Next.js proxy が FastAPI レスポンスの `X-LLM-Tokens-Used` ヘッダ（または SSE 最終イベントの `tokens_used`）を読み取り、Upstash の日次トークンカウンタを更新する。

#### 4.3.2 対象ファイル

| ファイル | 操作 | 概要 |
|---------|------|------|
| `src/proxy.ts` | 変更 | レスポンス後処理でトークンカウンタ更新 |

#### 4.3.3 手順

**Step 1: proxy.ts のレスポンス処理を確認**
- ファイル: `src/proxy.ts`
- FastAPI レスポンスを受け取った後の処理箇所を特定（L221-224 付近で `x-device-token` 転送処理がある）

**Step 2: 非 streaming レスポンスのヘッダ読取り**
- FastAPI からのレスポンスに `X-LLM-Tokens-Used` ヘッダがあるか確認
- `const tokensUsed = parseInt(response.headers.get("X-LLM-Tokens-Used") || "0", 10)`
- `tokensUsed > 0` の場合、`incrementDailyTokenCount()` を呼び出す
- **非同期で実行**: レスポンスを待たせない。`void incrementDailyTokenCount(identity, tokensUsed)` で fire-and-forget

**Step 3: streaming レスポンスのトークン報告**
- SSE streaming の場合、最終イベントの `tokens_used` フィールドから値を取得
- streaming の各イベントを inspect するロジックが必要
- 実装方法: stream の最終チャンクを parse して `tokens_used` フィールドがあれば抽出
- **代替案**: streaming route 側（C-4）で直接 `incrementDailyTokenCount()` を呼ぶ方がシンプル → **この方式を推奨**

**Step 4: identity の受け渡し**
- `getHeadersIdentity()` の結果を proxy 処理の文脈で保持し、カウンタ更新時に使用
- `src/app/api/_shared/request-identity.ts` の `getHeadersIdentity()` を import

#### 4.3.4 受入基準

- [ ] AC-1: 非 streaming の FastAPI レスポンス後にトークンカウンタが更新される
- [ ] AC-2: `tokensUsed` が 0 の場合はカウンタ更新をスキップする
- [ ] AC-3: カウンタ更新の失敗がレスポンスに影響しない（fire-and-forget）
- [ ] AC-4: `npm run build` が型エラーなしで完了する

#### 4.3.5 テスト仕様

| テスト種別 | コマンド / 手順 | 期待結果 |
|-----------|----------------|---------|
| 型チェック | `npm run build` | エラー 0 |
| 手動確認 | ES 添削を実行し、Upstash Redis CLI で `GET daily_llm_tokens:user_xxx:2026-04-14` | 正の整数 |
| 手動確認 | LLM を使わない API を実行し、Upstash のカウンタが変わらないこと | 値不変 |
| E2E | 既存の E2E テストが PASS すること | PASS |

#### 4.3.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|--------|-------|---------|------|
| proxy.ts の変更で全 API ルートに影響 | 高 | 低 | fire-and-forget で本体処理に影響させない |
| identity 解決のオーバーヘッド | 低 | 低 | 既存の `getHeadersIdentity()` は軽量（DB I/O は guest のみ） |
| streaming レスポンスでヘッダが読めない | 中 | 高 | C-4 で streaming route 側から直接カウンタ更新（推奨方式） |

#### 4.3.7 ロールバック手順

```bash
git checkout -- src/proxy.ts
```

---

### Task C-4: AI stream route にプレチェック組込み

#### 4.4.1 目的

AI 処理を行う4つの stream route の冒頭で日次トークン上限チェックを行い、上限超過時は LLM 呼び出し前に 429 を返す。streaming route では完了後にカウンタ更新も行う。

#### 4.4.2 対象ファイル

| ファイル | 操作 | 概要 |
|---------|------|------|
| `src/app/api/documents/_services/handle-review-stream.ts` | 変更 | ES 添削 stream のプレチェック + カウンタ更新 |
| `src/app/api/motivation/[companyId]/conversation/stream/route.ts` | 変更 | 志望動機 stream のプレチェック + カウンタ更新 |
| `src/app/api/gakuchika/[id]/conversation/stream/route.ts` | 変更 | ガクチカ stream のプレチェック + カウンタ更新 |
| `src/app/api/companies/[id]/interview/stream/route.ts` | 変更 | 面接対策 stream のプレチェック + カウンタ更新 |

#### 4.4.3 手順

**Step 1: 共通ヘルパーを作成（任意）**
- ファイル: `src/app/api/_shared/llm-cost-guard.ts` (新規、任意)
- 各 route で共通する上限チェックロジックを 1 関数にまとめる:
  ```
  async function guardDailyTokenLimit(request: NextRequest): Promise<NextResponse | null>
  ```
- 処理:
  1. `getRequestIdentity(request)` で identity 取得
  2. プラン取得（`auth.api.getSession()` → `user.plan` or guest → `"guest"`)
  3. `checkDailyTokenLimit(identity, plan)` を呼び出し
  4. `allowed: false` なら `NextResponse.json({ error: "daily_token_limit_exceeded" }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } })` を返す
  5. `allowed: true` なら `null` を返す（通過）

**Step 2: 4 つの stream route にプレチェックを追加**
- 各 route の POST ハンドラの冒頭（認証チェックの直後）に以下を追加:
  ```
  const limitResponse = await guardDailyTokenLimit(request);
  if (limitResponse) return limitResponse;
  ```
- **挿入位置**: 認証チェック (`getRequestIdentity` or `auth.api.getSession`) の直後、FastAPI 呼び出しの前

**Step 3: streaming 完了後のカウンタ更新**
- 各 stream route の SSE 処理完了後（stream が閉じた後）に:
  1. FastAPI レスポンスの最終 SSE イベントから `tokens_used` を取得（C-1 Step 3 で追加済み）
  2. `incrementDailyTokenCount(identity, tokensUsed)` を呼び出す
- **実装箇所**: SSE proxy の cleanup/finally ブロック

**Step 4: プラン解決ロジック**
- 認証ユーザー: セッションから `user.plan` を取得（`"free"`, `"standard"`, `"pro"`）
- ゲストユーザー: 固定で `"guest"`
- プランが取得できない場合: `"free"` をデフォルト

#### 4.4.4 受入基準

- [ ] AC-1: 日次トークン上限超過時に 429 が返り、LLM 呼び出しが行われない
- [ ] AC-2: 429 レスポンスに `Retry-After` ヘッダが含まれる（次の JST 0:00 までの秒数）
- [ ] AC-3: 429 レスポンスの JSON body に `error: "daily_token_limit_exceeded"` が含まれる
- [ ] AC-4: 通常利用（上限内）で 429 が返らない
- [ ] AC-5: streaming 完了後にトークンカウンタが加算される
- [ ] AC-6: `npm run build` が型エラーなしで完了する

#### 4.4.5 テスト仕様

| テスト種別 | コマンド / 手順 | 期待結果 |
|-----------|----------------|---------|
| 型チェック | `npm run build` | エラー 0 |
| 手動テスト | env に `DAILY_TOKEN_LIMIT_OVERRIDE=100` を設定し、ES 添削を実行 → 2 回目で 429 | 429 レスポンス |
| 手動テスト | 429 レスポンスの `Retry-After` ヘッダ値が 0〜86400 の範囲 | 範囲内 |
| 手動テスト | ゲストとログインユーザーで別々にカウントされること | 別カウンタ |
| E2E | `npm run test:e2e` | 既存テスト PASS |

#### 4.4.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|--------|-------|---------|------|
| プレチェックで正常リクエストを誤ブロック | 高 | 低 | 上限値を十分に余裕を持たせる。fail-open |
| プラン取得の失敗 | 中 | 低 | デフォルト `"free"` で処理（500K/day は十分） |
| 4 route の変更で既存テストが壊れる | 中 | 中 | 各 route 変更後に `npm run build` + E2E |

#### 4.4.7 ロールバック手順

```bash
# 各 route のプレチェック行を削除するか、git revert
git checkout -- src/app/api/documents/_services/handle-review-stream.ts
git checkout -- src/app/api/motivation/[companyId]/conversation/stream/route.ts
git checkout -- src/app/api/gakuchika/[id]/conversation/stream/route.ts
git checkout -- src/app/api/companies/[id]/interview/stream/route.ts
git checkout -- src/app/api/_shared/llm-cost-guard.ts
```

または環境変数 `DISABLE_TOKEN_LIMIT=true` で即座にバイパス可能。

---

## 5. 実行順序と依存関係図

```
C-1 (FastAPI ヘッダ)  ─────────────> C-3 (Proxy 統合)
                                         ↓
C-2 (llm-cost-limit.ts) ──────────> C-4 (Route プレチェック)

推奨順序:
1. C-1 と C-2 を並行実施（独立）
2. C-3 (C-1 完了後)
3. C-4 (C-2 完了後、C-3 と並行可)
4. 統合テスト
```

---

## 6. 全体の完了条件

- [ ] 全 4 タスクの受入基準が満たされている
- [ ] `npm run build` が PASS
- [ ] `cd backend && python -m pytest` が PASS
- [ ] `npm run test:e2e` が PASS（既存テストの回帰なし）
- [ ] 日次上限 100 tokens のテスト設定で 429 が返ることを手動確認
- [ ] ゲストとユーザーで別カウンタが動作することを手動確認
- [ ] コードレビュー完了

---

## 7. 全体リスク評価とロールバック戦略

### クロスカッティングリスク

| リスク | 影響度 | 発生確率 | 対策 |
|--------|-------|---------|------|
| Upstash Redis 障害で全ユーザーに影響 | 高 | 低 | fail-open パターン（`rate-limit.ts:185-188` と同様）。Upstash エラー時は制限なしで通す |
| JST 日付境界の競合状態 | 低 | 低 | TTL 25h で 1h バッファ。GET → INCRBY 間の競合は INCRBY のアトミック性で回避 |
| 本番で上限が厳しすぎて正常ユーザーに影響 | 中 | 低 | `DISABLE_TOKEN_LIMIT=true` で即座に無効化可能 |
| 大量 streaming トークンの計上漏れ | 低 | 中 | ログで `llm_cost_summary` と Redis カウンタの乖離を監視 |

### ロールバック戦略

- **即座の無効化**: 環境変数 `DISABLE_TOKEN_LIMIT=true` を設定するだけで全チェックをバイパス。デプロイ不要（Railway/Vercel の env var 変更で即時反映）
- **完全なロールバック**: `git revert <commit>` で PR 全体を取り消し。DB マイグレーションなしのため安全
- **部分的ロールバック**: C-4 の route プレチェックのみ削除すれば、カウンタは動くが制限は無効

---

## 8. 用語集

| 用語 | 説明 |
|------|------|
| **ContextVar** | Python の `contextvars.ContextVar`。非同期リクエストごとに独立した変数スコープを提供。`llm_usage_cost.py` でリクエスト単位のトークン消費を追跡している |
| **Upstash Redis** | サーバーレス Redis サービス。REST API 経由でアクセス。本プロジェクトでは既に `@upstash/redis` パッケージでレート制限に使用中 |
| **INCRBY** | Redis コマンド。キーの値をアトミックに加算する。キーが存在しない場合は 0 から開始 |
| **fail-open** | 障害時に「通す」方針。レート制限やトークン上限のチェック中にエラーが発生した場合、制限なしで処理を続行する |
| **fire-and-forget** | 非同期処理を開始するが完了を待たない方式。レスポンス速度に影響を与えない |
| **JST** | 日本標準時 (UTC+9)。日次リセットは JST 0:00 基準 |
| **TTL** | Time To Live。Redis キーの有効期限。25 時間 = JST 日付変更 + 1 時間のバッファ |
| **429** | HTTP ステータスコード "Too Many Requests"。日次トークン上限超過時に返す |
| **Retry-After** | HTTP レスポンスヘッダ。クライアントが次にリクエストできるまでの待機秒数 |
| **streaming / SSE** | Server-Sent Events。AI の生成結果をリアルタイムにクライアントへ送信する方式 |
| **blast radius** | 変更が影響する範囲 |
