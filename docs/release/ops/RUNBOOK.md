# 運用ランブック

就活Pass の日常運用手順の入口ドキュメント。AI エージェント（Claude Code / Codex）が実行し、人間が監督・承認する構成。

初期セットアップは [setup/PRODUCTION_SETUP.md](../setup/PRODUCTION_SETUP.md) を参照。

---

## シナリオ選択

```
何をしたい？
  │
  ├─ コードを本番に反映したい
  │    → REGULAR_RELEASE.md（通常リリース）
  │
  ├─ DBスキーマを変更したい
  │    → DB_MIGRATION.md（マイグレーション）
  │
  ├─ 本番が壊れた / ロールバックしたい
  │    → INCIDENT_ROLLBACK.md（障害対応）
  │
  └─ 環境変数 / シークレットを更新したい
       → SECRETS_MANAGEMENT.md（シークレット管理）
```

---

## 共通前提条件

全シナリオで実行前に確認する項目。Claude/Codex は自動で確認し、失敗時は停止する。

### 1. ブランチ確認

```bash
git branch --show-current
# 期待値: develop
```

### 2. プロバイダ認証

```bash
make ops-auth-check
```

> **WHY**: Vercel / Railway / Supabase / GitHub CLI の認証が切れていると、デプロイ中に予期しないエラーで停止する。事前に全プロバイダの認証状態を確認する。

### 3. シークレットドリフト確認

```bash
make ops-secrets-sync
```

> **WHY**: `.secrets/` バンドルとプロバイダ（Vercel / Railway）の環境変数に差分がないか確認する。ドリフトがある状態でデプロイすると、新旧コードで参照する環境変数が食い違う可能性がある。

### 4. DBマイグレーション状態

```bash
make db-migrate-check
```

> **WHY**: staging と production は別 Supabase project（staging=`career-compass-staging` / production=`career-compass-db`）。マイグレーション状態は環境ごとに確認する（production=`make db-migrate-check` / staging=`make db-migrate-check-staging`）。未適用のマイグレーションがある場合、デプロイ前に対処が必要。詳細は [DB_MIGRATION.md](./DB_MIGRATION.md)。

---

## クイックコマンドリファレンス

| コマンド | 用途 | 詳細 |
|---|---|---|
| `make deploy` | フルリリース（staging → production） | [REGULAR_RELEASE.md](./REGULAR_RELEASE.md) |
| `make deploy-staging` | staging のみデプロイ | [REGULAR_RELEASE.md](./REGULAR_RELEASE.md) Step 1-6 |
| `make deploy-production` | production のみデプロイ（staging gate あり） | [REGULAR_RELEASE.md](./REGULAR_RELEASE.md) Step 7-9 |
| `make rollback-prod TARGET=<id>` | ロールバック（dry-run） | [INCIDENT_ROLLBACK.md](./INCIDENT_ROLLBACK.md) |
| `make doctor` | 本番診断 + P0/P1 自動修復 | [INCIDENT_ROLLBACK.md](./INCIDENT_ROLLBACK.md) |
| `make doctor-check` | 本番診断のみ（修復なし） | [INCIDENT_ROLLBACK.md](./INCIDENT_ROLLBACK.md) |
| `make ops-secrets-sync` | シークレットドリフト確認 | [SECRETS_MANAGEMENT.md](./SECRETS_MANAGEMENT.md) |
| `make deploy-migrate` | DB マイグレーション実行 | [DB_MIGRATION.md](./DB_MIGRATION.md) |
| `make db-drift-check` | DB スキーマドリフト検出 | [DB_MIGRATION.md](./DB_MIGRATION.md) |
| `make ops-release-check` | リリース前提条件の一括確認 | 上記「共通前提条件」の自動版 |

---

## クイックコマンド（フェーズ別）

通常リリース前:

```bash
make ops-auth-check
make ops-secrets-sync
make ops-release-check
make db-migrate-check
make stripe-preflight
```

デプロイ:

```bash
make deploy-staging
make deploy-production
```

障害時:

```bash
make doctor-check
make doctor
make rollback-prod TARGET=<deployment-or-sha>
```

Stripe 本番運用の詳細は [../setup/STRIPE.md](../setup/STRIPE.md)、環境変数は [../../ops/ENVIRONMENT_VARIABLES.md](../../ops/ENVIRONMENT_VARIABLES.md)、DB は [DB_MIGRATION.md](./DB_MIGRATION.md)、シークレットは [SECRETS_MANAGEMENT.md](./SECRETS_MANAGEMENT.md) を参照。

---

## 安全ゲート一覧

Claude Code / Codex が危険な操作を実行する際に自動で発火するフック。詳細は [HOOK_SAFETY_MAP.md](./HOOK_SAFETY_MAP.md) を参照。

| 操作 | フック | 確認方法 |
|---|---|---|
| git push | git-push-guard.sh | AskUserQuestion (Claude) / ブロック (Codex) |
| 本番昇格 | production-promotion-guard.sh | AskUserQuestion (Claude) / ブロック (Codex) |
| risky/contract マイグレーション | migration-safety-guard.sh | AskUserQuestion (Claude) / ブロック (Codex) |
| 本番シークレット適用 | secret-apply-guard.sh | AskUserQuestion (Claude) / ブロック (Codex) |
| リリース/プロバイダ CLI | release-provider-guard.sh | AskUserQuestion (Claude) / ブロック (Codex) |
| 大規模コミット | commit-codex-gate.sh | Codex レビュー + AskUserQuestion |

---

## AI エージェントの役割分担

| 役割 | 担当 | できること | できないこと |
|---|---|---|---|
| オーケストレーター | Claude Code | ユーザー対話、設計判断、チェックポイント作成、AskUserQuestion | — |
| ワーカー | Codex | コード実装、テスト実行、コードレビュー | AskUserQuestion、チェックポイント作成 |
| 承認者 | 人間（あなた） | 危険操作の承認/拒否 | — |

Codex が危険操作に遭遇した場合、即座に停止して Claude Code に制御を返す。Claude Code が AskUserQuestion で人間に確認し、承認後にチェックポイントを作成して Codex に再委譲する。
