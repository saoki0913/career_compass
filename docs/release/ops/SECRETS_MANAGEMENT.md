# シークレット・環境変数管理

`.secrets/` バンドルを正本として、各プロバイダ（Vercel / Railway / GitHub）の環境変数と同期する。

---

## アーキテクチャ

```
.secrets/ (gitignored, 正本)
  ├── production/
  │     ├── nextjs.env      → Vercel production
  │     ├── fastapi.env     → Railway production
  │     ├── supabase.env    → (参照用)
  │     └── shared.env      → 共通変数
  ├── staging/
  │     ├── nextjs.env      → Vercel staging
  │     ├── fastapi.env     → Railway staging
  │     └── shared.env      → 共通変数
  ├── ci/
  │     └── github-actions.env → GitHub Actions
  └── infra/
        └── cloudflare.env  → (参照用)
```

**解決順序**: `--secret-dir` > `.secrets/` > `codex-company/.secrets/career_compass/`

---

## ドリフト確認

> **WHY**: プロバイダ側の環境変数と `.secrets/` バンドルに差分があると、デプロイ後にアプリが起動しない。定期的にドリフトを検出する。

**実行者**: Claude/Codex（自動）

```bash
# 全ターゲットのドリフト確認（read-only、値は非表示）
make ops-secrets-sync

# 特定ターゲットのみ確認
SYNC_MODE=--check TARGET=vercel-production make ops-secrets-sync
```

**出力**: キー名の比較のみ。値は表示しない。

**判断**:
- ドリフトなし → アクション不要
- プロバイダ自動注入キー（Vercel/Railway が追加する変数）→ 無視して良い
- バンドルに存在しプロバイダにない → 同期が必要

---

## シークレット同期

### staging 同期（自動許可）

> **WHY**: staging は開発用環境であり、シークレット同期のリスクは低い。

**実行者**: Claude/Codex（自動）
**Hook**: `secret-apply-guard.sh`（staging → 自動許可 exit 0）

```bash
SYNC_MODE=--apply TARGET=vercel-staging make ops-secrets-sync
SYNC_MODE=--apply TARGET=railway-staging make ops-secrets-sync
SYNC_MODE=--apply TARGET=github make ops-secrets-sync
```

### production 同期（確認必要）

> **WHY**: production のシークレット変更は本番サービスに直接影響する。変更キー名を人間が確認する。

**実行者**: Claude/Codex（確認後に実行）
**Hook**: `secret-apply-guard.sh`（production → exit 2 でブロック → AskUserQuestion）

```bash
# AskUserQuestion で変更キー名を表示:
#   added: ["NEW_KEY"]
#   modified: ["CHANGED_KEY"]
#   removed: ["OLD_KEY"]
#   unchanged: 12

# 承認後に実行
SYNC_MODE=--apply TARGET=vercel-production make ops-secrets-sync
SYNC_MODE=--apply TARGET=railway-production make ops-secrets-sync
```

**確認後**: ヘルスチェックで影響を確認する。
```bash
make deploy-check
```

---

## シークレット追加

新しい環境変数を追加する手順。

### 1. バンドルファイルを編集

```bash
# 対象の .secrets/ ファイルを編集
# Vercel (Next.js) 用: .secrets/production/nextjs.env
# Railway (FastAPI) 用: .secrets/production/fastapi.env
# 共通: .secrets/production/shared.env
```

> **注意**: シークレットの値はチャットやログに出さない。編集は直接ファイルを開いて行う。

### 2. 環境変数カタログを更新

新しい変数は `docs/release/setup/ENV_REFERENCE.md` に追記する。

### 3. T3 Env バリデーションを更新

Vercel 用の変数は `src/env/server.ts` の zod スキーマに追加する。

### 4. プロバイダに同期

```bash
# staging → production の順で同期
SYNC_MODE=--apply TARGET=vercel-staging make ops-secrets-sync
SYNC_MODE=--apply TARGET=railway-staging make ops-secrets-sync
# production は AskUserQuestion で確認
SYNC_MODE=--apply TARGET=vercel-production make ops-secrets-sync
SYNC_MODE=--apply TARGET=railway-production make ops-secrets-sync
```

### 5. 検証

```bash
# ドリフトがないことを確認
make ops-secrets-sync

# サービスが正常であることを確認
make deploy-check
```

---

## シークレットローテーション

ローテーション時は、全ターゲットに順序正しく反映し、再デプロイする。

### ローテーション優先順位

| 優先度 | キー | 理由 |
|---|---|---|
| 1 | `BETTER_AUTH_SECRET` | 認証セッション暗号化。変更すると全ユーザーのセッションが無効になる |
| 2 | `GOOGLE_CLIENT_SECRET` | OAuth 認証。変更すると Google ログインが一時的に使えなくなる |
| 3 | `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | 決済。変更すると webhook 検証が失敗する |
| 4 | `ENCRYPTION_KEY` | データ暗号化。変更すると既存の暗号化データが読めなくなる |
| 5 | `INTERNAL_API_JWT_SECRET` | Next.js → FastAPI 間の内部認証 |
| 6 | `CRON_SECRET` | Cron ジョブ認証 |

### ローテーション手順

1. 新しい値を生成する
2. `.secrets/` バンドルの該当ファイルを更新する
3. staging に同期して動作確認する
4. production に同期する（AskUserQuestion で確認）
5. 影響を受けるサービスを再デプロイする
6. ヘルスチェックで正常性を確認する

> **注意**: `ENCRYPTION_KEY` と `BETTER_AUTH_SECRET` のローテーションは、既存データの再暗号化やセッション無効化を伴う。十分な計画を立ててから実行する。

---

## 参照

- 環境変数カタログ: [setup/ENV_REFERENCE.md](../setup/ENV_REFERENCE.md)
- シークレットバンドルの例: `scripts/release/secrets-examples/`
- 同期スクリプト: `scripts/release/sync-career-compass-secrets.sh`
