# DB マイグレーション手順

就活Pass の staging と production は別 Supabase project を使う。
staging は `career-compass-staging`、production は `career-compass-db` を正本とし、どちらも app table は各 project の `public` schema に置く。DB 変更は環境ごとに migration runner で確認し、production には staging deploy 経由の migration を適用しない。

---

## マイグレーション分類

| 分類 | 例 | リスク | 実行タイミング | 確認 |
|---|---|---|---|---|
| **expand-auto** | カラム追加、テーブル作成、インデックス追加 | 低（後方互換） | デプロイ前・自動 | 不要 |
| **manual-risky** | trigger、function、RLS、constraint、data update | 中（旧コードに影響しうる） | デプロイ前・確認後 | AskUserQuestion |
| **manual-contract** | DROP、TRUNCATE、rename、型変更、SET NOT NULL | 高（旧コードが壊れる） | デプロイ後・確認後 | AskUserQuestion |
| **Supabase CLI** | supabase/migrations/*.sql | 不定 | 手動 | 人間実行 |

---

## Phase 0: 分類判定

> **WHY**: マイグレーションの種類によって実行タイミングと確認レベルが変わる。まず何が pending かを把握する。

**実行者**: Claude/Codex（自動）

```bash
node scripts/release/run-migrations.mjs --env production --dry-run --json
```

staging を確認する場合:

```bash
node scripts/release/run-migrations.mjs --env staging --dry-run --json
```

**出力例**:
```json
{
  "pending": 2,
  "classifications": [
    {"name": "0018_add_user_preferences", "classification": "expand-auto"},
    {"name": "0019_add_trigger_audit", "classification": "manual-risky"}
  ],
  "blockers": ["manual-risky migration detected: 0019_add_trigger_audit"],
  "exitCode": 1
}
```

**判断ツリー**:
```
pending = 0
  → アクションなし

全て expand-auto、blockers なし
  → Phase 1a（自動適用）

manual-risky を含む
  → Phase 1b（確認ゲート）

manual-contract を含む
  → Phase 2（デプロイ後）

Supabase CLI migration 未適用
  → Phase 3（手動）
```

---

## Phase 1a: expand-auto マイグレーション（完全自動）

> **WHY**: expand-only は後方互換が保証されている。新しいカラムやテーブルを追加するだけで、旧コードは影響を受けない。

**実行者**: Claude/Codex（自動）
**Hook**: `migration-safety-guard.sh`（自動許可 → exit 0）

```bash
node scripts/release/run-migrations.mjs --env production --json
```

staging deploy では同じ runner を `--env staging` で実行する。staging migration は staging Supabase project のみに適用され、production project には触れない。

expand-auto 適用後に push / CI / staging health が失敗した場合、DB には未使用の新規テーブル/カラム/インデックスが残る。expand-only であるため rollback は不要。コード修正後に再デプロイする。

`drizzle_pg/` の migration runner は通常 migration を transaction 内で適用し、`CREATE INDEX CONCURRENTLY` を含む migration だけ non-transactional path で適用してから `__drizzle_migrations` に記録する。PostgreSQL は `CREATE INDEX CONCURRENTLY` を transaction block 内で実行できないため、この分岐を通さずに Drizzle 標準 migrator へ直接流さない。

---

## Phase 1b: manual-risky マイグレーション（確認ゲート）

> **WHY**: trigger、function、RLS、constraint、data update は対象環境の旧コードと新コードの両方に影響する。人間が SQL と影響範囲を確認する必要がある。

**実行者**: Claude/Codex（確認後に実行）
**Hook**: `migration-safety-guard.sh`（exit 2 でブロック → AskUserQuestion）

```bash
# AskUserQuestion で以下を表示:
#   - 対象マイグレーション名
#   - SQL 内容
#   - 影響テーブル
#   - リスク分類の理由

# 承認後に実行
node scripts/release/run-migrations.mjs --env production --allow-risky --json
```

**確認のポイント**:
- SQL は旧コード（現在 production で動作中）と互換か？
- 既存データに影響するか？
- ロック時間は許容範囲か？（大テーブルの場合）

---

## Phase 2: manual-contract マイグレーション（デプロイ後）

> **WHY**: DROP、TRUNCATE、rename、型変更は旧コードを壊す。新コードが production にデプロイされ、旧コードが参照しなくなった後にのみ実行する。

**実行者**: Claude/Codex（確認後に実行）
**Hook**: `migration-safety-guard.sh`（exit 2 でブロック → AskUserQuestion）
**タイミング**: production デプロイが安定した後（[REGULAR_RELEASE.md](./REGULAR_RELEASE.md) Step 8 完了後）

```bash
# AskUserQuestion で以下を確認:
#   - 旧コードが対象オブジェクトを参照していないこと
#   - DROP/TRUNCATE の影響範囲

# 承認後に実行
node scripts/release/run-migrations.mjs --env production --allow-contract --json
```

**原則**: roll-forward で修復する。DB rollback は最終手段とする。

---

## Phase 3: Supabase CLI マイグレーション（手動）

> **WHY**: Supabase CLI のマイグレーションは Drizzle の管理外。自動適用せず、人間が手動で確認・実行する。

**実行者**: 人間（Claude/Codex が補助）
**Hook**: なし（deploy が停止するため手動介入が必要）

```bash
# 1. 未適用バージョンを確認
supabase migration list --linked

# 2. dry-run で影響を確認
supabase db push --dry-run

# 3. 対象 SQL をレビュー（supabase/migrations/*.sql）

# 4. 互換性確認後に適用
supabase db push

# 5. 適用確認
make db-migrate-check
```

---

## ドリフト検出

DB スキーマが Drizzle の定義（`src/lib/db/schema.ts`）とずれていないか確認する。

```bash
# スキーマドリフト検出
make db-drift-check

# staging DB の状態確認
make db-migrate-check-staging
make db-drift-check-staging

# マイグレーションファイルの整合性
make db-validate

# 本番 DB の状態表示
make deploy-status
```

> **WHY**: Supabase Dashboard からの手動変更や、他のツールによるスキーマ変更がドリフトの原因になる。定期的に確認する。

---

## ロールバックアーティファクト

```bash
make db-generate-rollback
```

SQL アーティファクトを生成するだけで実行しない。生成物に `MANUAL ROLLBACK REQUIRED` が含まれる場合、自動 rollback は不可能。

**ポリシー**: roll-forward を優先する。DB rollback は最終手段であり、常に人間が判断する。

---

## 接続 URL の使い分け

| 用途 | 環境変数 | 注意 |
|---|---|---|
| runtime app | `DATABASE_URL` | アプリ実行時の接続 |
| migration / release operator | `DIRECT_URL` | migration runner が使用 |

- `DIRECT_URL` に Transaction Pooler の `6543` は使わない。Direct または Session の `5432` を使う。
- schema 正本は `src/lib/db/schema.ts`。

ローカル開発の Supabase 起動やリセットは [../../setup/DB_SUPABASE.md](../../setup/DB_SUPABASE.md) を参照（本番 Supabase の構築は [./../setup/SUPABASE.md](../../release/setup/SUPABASE.md)）。

---

## デプロイ状態キャッシュ

`~/.career-compass/deploy-state.json` は resume 用キャッシュであり、正本ではない。
正本は Git commit、GitHub workflow、provider metadata、DB migration history とする。
