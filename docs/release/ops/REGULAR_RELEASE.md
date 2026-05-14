# 通常リリース手順（develop → main）

コード変更を staging 経由で production に反映する標準フロー。

---

## 全体フロー

```
Step 1  Preflight Check ──────────────── 自動
Step 2  ローカル品質ゲート ────────────── 自動
Step 3  シークレット同期 ──────── staging 自動 / production 確認
Step 4  DB マイグレーション ──── expand 自動 / risky 確認
Step 5  Commit & Push ─────────────────── 確認必要
Step 6  CI 待機 + Staging 検証 ────────── 自動
Step 7  本番昇格 ──────────────────────── 確認必要
Step 8  本番ヘルスチェック ────────────── 自動
Step 9  Tag & Release ─────────────────── 自動 (GitHub Actions)
```

---

## Step 1: Preflight Check

> **WHY**: プロバイダ認証切れ、ブランチ間違い、シークレットドリフトをデプロイ前に検出する。

**実行者**: Claude/Codex（自動）
**Hook**: なし

```bash
make ops-release-check
```

**判断**:
- exit 0 → Step 2 へ
- exit 1 → エラー内容を確認し修正

---

## Step 2: ローカル品質ゲート

> **WHY**: lint / 型チェック / テストの失敗をプロバイダに触れる前に検出する。CI より先にローカルで確認することで、フィードバックループを短縮する。

**実行者**: Claude/Codex（自動）
**Hook**: なし

```bash
# deploy-staging.sh が内部で実行する検証（個別実行も可能）
npx tsc --noEmit
npm run lint
npm run test:unit
npx drizzle-kit check
```

**判断**:
- 全 pass → Step 3 へ
- 失敗 → コードを修正して再実行

---

## Step 3: シークレット同期

> **WHY**: `.secrets/` バンドルとプロバイダの環境変数が一致していないと、デプロイ後にアプリが起動しない。staging は自動同期し、production は変更内容を人間が確認する。

**実行者**: staging は Claude/Codex 自動 / production は確認必要
**Hook**: `secret-apply-guard.sh`（production ターゲットのみ発火）

```bash
# ドリフト確認（read-only、自動）
make ops-secrets-sync

# staging 同期（自動許可）
SYNC_MODE=--apply TARGET=vercel-staging make ops-secrets-sync
SYNC_MODE=--apply TARGET=railway-staging make ops-secrets-sync

# production 同期（AskUserQuestion で確認後）
SYNC_MODE=--apply TARGET=vercel-production make ops-secrets-sync
SYNC_MODE=--apply TARGET=railway-production make ops-secrets-sync
```

**判断**:
- ドリフトなし → Step 4 へ
- staging のみドリフト → 自動同期して Step 4 へ
- production ドリフト → AskUserQuestion で変更キー名を表示し確認
  - 承認 → 同期して Step 4 へ
  - 拒否 → 停止。手動確認

---

## Step 4: DB マイグレーション

> **WHY**: staging と production は同一 Supabase project を共有している。DB 変更は即座に production に影響する。expand-only は安全なので自動適用するが、risky/contract は人間が SQL を確認する。

**実行者**: expand-auto は自動 / risky・contract は確認必要
**Hook**: `migration-safety-guard.sh`（risky/contract 検出時のみ発火）

```bash
# 分類確認（dry-run、自動）
node scripts/release/run-migrations.mjs --env production --dry-run --json
```

**判断ツリー**:
```
pending = 0
  → アクションなし。Step 5 へ

全て expand-auto
  → 自動適用（安全保証）
  → Step 5 へ

manual-risky を含む
  → AskUserQuestion で SQL と影響テーブルを表示し確認
  → 承認 → --allow-risky で適用
  → 拒否 → 停止。マイグレーションを修正

manual-contract を含む
  → デプロイ後に適用（Step 8 の後）
  → Step 5 へ（contract はデプロイ後の別作業）

Supabase CLI マイグレーション未適用
  → 停止。DB_MIGRATION.md Phase 3 の手動手順へ
```

詳細は [DB_MIGRATION.md](./DB_MIGRATION.md) を参照。

---

## Step 5: Commit & Push

> **WHY**: `git push origin develop` は GitHub Actions CI 全スイート + Staging デプロイを発火する。push 後は取り消せないため、人間が push 対象のコミットを確認する。

**実行者**: 確認必要
**Hook**: `git-push-guard.sh`（AskUserQuestion でコミット一覧を表示）

```bash
# 変更をステージ
git add <対象ファイル>

# コミット
git commit -m "chore: release career_compass via develop"

# push 前に AskUserQuestion で確認される
git push origin develop
```

**確認内容**:
- push 対象のコミット一覧（`git log origin/develop..HEAD --oneline`）
- 各コミットの変更概要

---

## Step 6: CI 待機 + Staging 検証

> **WHY**: CI が全 gate を通過し、staging が正常に動作していることを確認する。production 昇格の前提条件。

**実行者**: Claude/Codex（自動）
**Hook**: なし

```bash
# CI 完了を待機
gh run list --workflow="Develop CI" --branch=develop --limit=1

# Staging ヘルスチェック
zsh scripts/release/verify-health.sh staging
```

**検証内容**:
- Develop CI ワークフローが成功
- `https://stg.shupass.jp` が 200 を返す
- `https://stg-api.shupass.jp/health` が 200 を返す

**判断**:
- 全 pass → Step 7 へ
- CI 失敗 → コードを修正して Step 5 から再実行
- Staging 不健全 → Railway / Vercel のログを確認

---

## Step 7: 本番昇格（develop → main）

> **WHY**: main ブランチへの merge は Vercel production デプロイと Railway production デプロイを発火する。staging が検証済みであること、未適用マイグレーションがないことを確認してから実行する。

**実行者**: 確認必要
**Hook**: `production-promotion-guard.sh`（常に発火）

```bash
# PR 作成（または既存 PR を再利用）
make release-pr

# main promotion guard が以下を確認して AskUserQuestion:
#   - staging-verified checkpoint の存在
#   - コミット一覧
#   - マイグレーション状態
#   - シークレットドリフト状態

# 承認後、PR を merge
# gh pr merge <number> --merge
```

**確認内容**（AskUserQuestion で表示）:
- staging 検証済み（staging-verified checkpoint）
- develop → main の差分コミット一覧
- DB マイグレーション: pending = 0
- シークレット: ドリフトなし

---

## Step 8: 本番ヘルスチェック

> **WHY**: デプロイ直後に本番が正常に動作していることを確認する。問題があれば即座にロールバック判断に入る。

**実行者**: Claude/Codex（自動）
**Hook**: なし

```bash
zsh scripts/release/verify-health.sh production
```

**検証内容**:
- `https://www.shupass.jp` が 200 を返す
- `https://shupass.jp` が `https://www.shupass.jp` にリダイレクトされる
- バックエンド `/health` が 200 を返す
- バックエンド `/health/ready` が 200 を返す
- robots.txt / sitemap.xml が正常

**判断**:
- 全 pass → Step 9 へ
- 失敗 → [INCIDENT_ROLLBACK.md](./INCIDENT_ROLLBACK.md) のトリアージフローへ

---

## Step 9: Tag & Release

> **WHY**: リリースバージョンを記録し、将来のロールバックやデバッグの基準点を作る。

**実行者**: 自動（GitHub Actions `release-tag.yml`）
**Hook**: なし

main に PR が merge されると、自動的に:
1. `vYYYY.MM.DD.N` 形式の Git タグが作成される
2. Draft GitHub Release が生成される

**確認**:
```bash
git tag --sort=-creatordate | head -3
```

---

## contract マイグレーション（Step 8 の後）

Step 4 で manual-contract が検出された場合、production デプロイが安定した後に実行する。

```bash
# AskUserQuestion で SQL を確認してから実行
node scripts/release/run-migrations.mjs --env production --allow-contract --json
```

詳細は [DB_MIGRATION.md](./DB_MIGRATION.md) Phase 2 を参照。

---

## 一括実行（`make deploy`）

上記 Step 1-9 を一括で実行するコマンド。各ステップの確認ゲートは同じように発火する。

```bash
make deploy
```

`make deploy` は内部で `deploy-staging.sh` → `deploy-production.sh` を順に実行し、各ステップの確認ゲートで必要に応じて停止する。

---

## トラブルシューティング

| 症状 | 原因 | 対応 |
|---|---|---|
| Step 5 で push がブロックされる | git-push-guard.sh の checkpoint がない | AskUserQuestion で承認後に再実行 |
| Step 6 で CI が失敗する | コード品質の問題 | CI ログを確認し修正 → Step 5 から再実行 |
| Step 7 で promotion がブロックされる | staging 未検証 or ドリフト検出 | staging デプロイを先に完了する |
| Step 8 で本番が不健全 | デプロイ失敗 | [INCIDENT_ROLLBACK.md](./INCIDENT_ROLLBACK.md) へ |
