# 障害対応・ロールバック手順

本番環境（www.shupass.jp）で障害が発生した場合のトリアージからロールバックまでの手順。

---

## トリアージ

> **WHY**: 障害の影響範囲と原因を特定し、対応の優先度を決める。5つのソースから並列でエラーを収集する。

**実行者**: Claude/Codex（自動）

```bash
# 診断 + P0/P1 トリアージ
make doctor

# 診断のみ（修復なし）
make doctor-check
```

`production-doctor.sh` は以下の 5 ソースから並列でエラーを収集する:

| ソース | 確認内容 |
|---|---|
| Health Check | フロントエンド / バックエンドの HTTP ステータス |
| Secret Drift | `.secrets/` バンドルとプロバイダの環境変数差分 |
| Sentry API | フロントエンド / バックエンドのエラー数 |
| Railway Logs | OOM、HTTP 5xx、タイムアウト、Python エラー |
| SSL/DNS | HTTPS ステータス、証明書有効性 |

---

## 優先度分類

| 優先度 | 条件 | 対応 |
|---|---|---|
| **P0 (Critical)** | Health check UNHEALTHY、DNS 障害、Sentry critical、Railway OOM/5xx、SSL エラー | 即時対応 |
| **P1 (Important)** | Secret drift、Railway timeout/Python エラー、Sentry non-critical | 計画的対応 |
| **P2 (Low)** | その他の findings | 次回リリースで対応 |

---

## 対応フロー

```
triage.json を確認
  │
  ├─ P0 が存在する
  │    │
  │    ├─ フロントエンドのみ障害
  │    │    → Vercel ロールバック
  │    │
  │    ├─ バックエンドのみ障害
  │    │    → Railway ロールバック
  │    │
  │    ├─ DB 起因の障害
  │    │    → ロールフォワード推奨（DB rollback は最終手段）
  │    │
  │    └─ フロント + バック両方障害
  │         → バックエンド先にロールバック → フロントエンド
  │
  ├─ P1 のみ
  │    → 原因調査 → 修正デプロイ（通常リリースフロー）
  │
  └─ P2 のみ
       → 次回リリースで対応
```

---

## ロールバック実行

> **WHY**: ロールバックは不可逆な操作を含む場合がある。特に DB スキーマが変更された場合、バックエンドを先に戻さないとフロントエンドが壊れる可能性がある。常に人間が判断する。

### Vercel ロールバック（フロントエンド）

**実行者**: 確認必要
**Hook**: `release-provider-guard.sh`

```bash
# dry-run で対象を確認
make rollback-prod TARGET=<deployment-id-or-commit-sha>
```

> **注意**: `rollback-career-compass.sh` は意図的に dry-run と計画確認のみを実装している。実際の provider rollback は別途承認して手動実行する。

### Railway ロールバック（バックエンド）

**実行者**: 確認必要
**Hook**: `release-provider-guard.sh`

```bash
# Railway Dashboard または CLI でロールバック
# release-provider-guard が AskUserQuestion で確認
railway rollback <deployment-id>
```

### DB ロールバック（最終手段）

**実行者**: 人間（手動実行のみ）

```bash
# ロールバック SQL を生成（実行はしない）
make db-generate-rollback
```

- `MANUAL ROLLBACK REQUIRED` が含まれる場合、自動 rollback は不可能
- DB rollback は roll-forward で対処できない場合のみ検討する
- 実行前に必ずバックアップを取得する

**ポリシー**: shared DB（staging + production）のため、DB rollback は両環境に影響する。roll-forward を最優先とする。

---

## 自動修復ループ（production-doctor）

`make doctor` は P0/P1 イシューに対して最大 3 回の修復ループを実行する。

**終了条件**:

| 条件 | Exit Code | 意味 |
|---|---|---|
| P0_P1_RESOLVED | 0 | 全 P0/P1 が解決 |
| SAME_SIGNATURE_REPEATED | 2 | 修復が効果なし（同じ問題が再発） |
| NEW_ISSUE_INTRODUCED | 3 | 修復が新たな問題を引き起こした |
| MAX_ITERATIONS_REACHED | 4 | 3 回修復しても問題が残る |
| MANUAL_ESCALATION_REQUESTED | 5 | 人間の介入が必要 |

exit code が 0 以外の場合、人間に AskUserQuestion で状況を報告する。

---

## ロールバック判断の順序

フロントエンド + バックエンドの両方に障害がある場合:

1. **バックエンドを先にロールバック** — DB スキーマとの互換性を確保
2. **バックエンドの健全性を確認** — `/health` と `/health/ready` が 200
3. **フロントエンドをロールバック** — バックエンドが安定した状態で実行
4. **全体の健全性を確認** — `zsh scripts/release/verify-health.sh production`

> **WHY**: shared DB のため、バックエンドが先に正常な状態に戻らないと、フロントエンドのロールバックも正常に動作しない可能性がある。

---

## ポストインシデント

障害対応後のチェックリスト:

1. `make deploy-check` で全エンドポイントが 200 を返すことを確認
2. `make ops-secrets-sync` でシークレットドリフトがないことを確認
3. Sentry でエラー数が減少していることを確認
4. 障害の根本原因を特定し、修正デプロイを計画する
5. 必要に応じて `make doctor` を再実行して P0/P1 がないことを確認

---

## 監視ベースライン

正常時の期待値:

| エンドポイント | 期待 |
|---|---|
| `https://www.shupass.jp` | 200 |
| `https://shupass.jp` | 307 → `https://www.shupass.jp/` |
| バックエンド `/health` | 200 + `X-Request-Id` |
| バックエンド `/health/ready` | 200 |
| `https://stg.shupass.jp` | 200 |
| staging バックエンド `/health` | 200 + `X-Request-Id` |
| `robots.txt` | 200 |
| `sitemap.xml` | 200 |
