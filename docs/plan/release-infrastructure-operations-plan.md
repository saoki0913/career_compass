# リリース・インフラ運用 計画書

作成日: 2026-05-05 JST

## 1. 目的

就活Pass の本番リリース準備に向けて、リリース・インフラ運用の品質を体系化する。1 人運用・週 1-2 回リリース体制を前提に、以下の 4 ドメインを網羅する。

1. **信頼性・障害対応** — ロールバック自動化、インシデント対応手順、ヘルスチェック強化、合成監視
2. **セキュリティ・監査** — secrets 監査ログ、ドリフト検出強化、依存脆弱性スキャン CI 強制、ローテーション手順
3. **観測性 (Observability)** — Sentry 導入、メトリクスエクスポート、ログ集約、ステータスページ、アラート実装
4. **災害復旧 (DR)** — RPO/RTO 定義、バックアップ戦略、リカバリ手順書、DR テストスケジュール

本計画書のスコープは **計画策定のみ** であり、コード実装は行わない。

ユーザー確認済みの方針:

- 信頼性・障害対応とセキュリティ・監査を主軸とする。
- 災害復旧と観測性も追加観点として含める。
- 本番リリース準備が動機。週 1-2 回・1 人運用体制。
- Supabase staging/production 分離は本計画スコープ外（別計画に切り出し）。

Codex Plan Review (PASS_WITH_CONCERNS) 反映済み:

- ロールバック: provider CLI 直接実行 → 既存 `rollback-career-compass.sh` の confirm-before-execute 拡張
- secrets 監査: 530 行スクリプトへの直足し禁止 → helper 分離
- PII scrub allowlist: 外部 Observability 導入の前提条件として P0 追加
- コスト修正: Supabase PITR $100/月 → P1 降格
- P0 スコープ: 「安全に戻せる・異常に気づける・secrets を壊さない」に絞り込み
- ヘルスチェック: deep check は `/health/ready` とは別 endpoint に分離
- Sentry tunnel: payload size / rate limit / CSRF exemption 根拠を明記

## 2. 完了条件

この計画書作成タスクの完了条件は次のとおり。

1. `docs/plan/release-infrastructure-operations-plan.md` に、現状評価、設計判断、タスク一覧、テスト方針が記録されている。
2. タスク一覧は `Status / Priority / Area / Task / Acceptance Criteria / Updated At` を持つ Markdown table で管理されている。
3. P0 タスクがすべて `Todo` として洗い出され、後続実装者が判断なしで着手できる粒度になっている。
4. 4 ドメイン（信頼性・セキュリティ・観測性・DR）の全てがカバーされている。
5. Codex Plan Review の 6 件の findings が全て反映されている。

## 3. タスク状態更新ルール

本計画書を実装フェーズで使う場合、以下の反復で進める。

1. `Task Tracker` から未完了タスクを 1 件選ぶ。
2. 対象コードを読み、必要ならテストを先に追加する。
3. 実装または検証の進捗に合わせて `Status` と `Updated At` を更新する。
4. 受け入れ条件を満たしたら `Review`、レビューと検証が終わったら `Done` にする。
5. `Done` 以外が残っている場合は 1 に戻る。

Status は以下のみを使う。

- `Todo`: 未着手
- `In Progress`: 実装中
- `Blocked`: 外部判断または環境要因待ち
- `Review`: 実装済み、検証またはレビュー待ち
- `Done`: 受け入れ条件を満たした

## 4. 現状評価

### 4.1 強み

| 領域 | 既存の強み |
|---|---|
| リリースパイプライン | `scripts/release/release-career-compass.sh` (259 行) が develop→staging→main→production の全フローをオーケストレーション。`make deploy` / `make ops-release-check` で標準化済み |
| CI/CD | `develop-ci.yml` (5 jobs) + `main-promotion-guard.yml` (10 jobs) で frontend/backend/security/e2e を網羅。migration-safety で破壊的 SQL を検出 |
| secrets 管理 | `sync-career-compass-secrets.sh` (530 行) がキー名レベルの drift 検出。Vercel/Railway/GitHub/Supabase/Google OAuth の 7 target 対応 |
| セキュリティヘッダ | CSP nonce-based, HSTS 2 年, X-Frame-Options DENY, Permissions-Policy。`next.config.ts` で包括的に設定 |
| レート制限 | 3 層防御: Upstash Redis 分散 + spike handler + FastAPI per-endpoint。fail-open 設計 |
| ログ | frontend (`src/lib/logger.ts`) と backend (`backend/app/utils/secure_logger.py`) で対称的な secret redaction。API key, token, email を regex で自動除去 |
| ヘルスチェック | `/health` (liveness) + `/health/ready` (readiness: settings, imports, LLM key 検証)。Railway: ON_FAILURE restart max 3 |
| Docker | 非 root ユーザー (UID 1001), gosu でプリビレッジドロップ, `.env*` クリーンアップ, volume 権限検証 |
| Principal 伝播 | `X-Career-Principal` HMAC 署名。tenant key による RAG 境界分離。concurrent SSE lease 制御 |

### 4.2 弱み

| 領域 | ギャップ | 影響度 |
|---|---|---|
| ロールバック | `rollback-career-compass.sh:53` で実行を意図的に停止。手動 provider 操作が必要 | Critical |
| エラー追跡 | Sentry 等の集約エラー追跡なし。production エラーはプロバイダログを直接見ない限り気づけない | Critical |
| secrets 監査 | sync 操作の監査ログなし。誰がいつ何を変えたか追跡不能 | High |
| 値ドリフト | キー名のみの比較。provider 側で値が変更されても検出不能 | High |
| 依存脆弱性 | npm audit は warn-only。pip-audit 未導入。Dependabot 未設定 | High |
| Prometheus | 127.0.0.1:9464 にバインド。外部エクスポートなし | High |
| ログ集約 | Vercel/Railway/Supabase のログが分散。一元ビュー不在 | High |
| アラート | `OBSERVABILITY.md` にルール定義済みだが実装なし (Alertmanager/PagerDuty/Slack なし) | High |
| 合成監視 | 外部からの uptime 監視なし | High |
| ステータスページ | 公開ステータスページなし | Medium |
| cron 監視 | daily-notifications, calendar-sync の dead-man's switch なし | Medium |
| DB バックアップ | Supabase 自動日次バックアップのみ。RPO/RTO 未定義。PITR 未有効 | Medium |
| RAG ボリューム | ChromaDB/BM25 のバックアップ手順なし。リビルド手順未文書化 | Medium |
| マイグレーション | 逆方向 SQL なし。pre-deploy schema snapshot なし | Medium |
| デプロイ窓 | 推奨デプロイ時間帯の文書なし | Low |
| Changelog | リリース PR のコミット一覧のみ。自動 changelog 生成なし | Low |

## 5. 設計判断

### D-1. コスト最小化 — 全ツール無料枠

| ツール | 無料枠 | 用途 |
|---|---|---|
| Sentry Developer | 5K errors/月, 10K transactions | エラー追跡・パフォーマンス |
| Grafana Cloud Free | 50GB logs, 10K metrics series, 14 日 retention | メトリクスダッシュボード |
| Better Stack Free | 5 monitors, 3 分 interval, 1 status page, 1GB/day logs | 合成監視・ステータスページ |
| Healthchecks.io Free | 20 checks | cron dead-man's switch |

月額 $0 で運用開始。Supabase PITR ($100/月) は P1 判断として段階的に検討する。

### D-2. ロールバック — 既存スクリプト拡張の confirm-before-execute

provider CLI (`vercel rollback`, `railway deploy`) の直接実行は禁止。既存 `scripts/release/rollback-career-compass.sh` を拡張し、identify → confirm → execute → verify の 4 フェーズで実装する。`--dry-run` をデフォルト維持し、`--confirm` で実行ゲートを開く。全操作を `scripts/release/common.sh` の utility 経由で実行する。

### D-3. secrets 監査 — helper 分離

530 行の `sync-career-compass-secrets.sh` への責務追加は 500 行超ファイルへの責務追加ガードに抵触する。監査ログ生成は `scripts/release/lib/secrets-audit-log.sh`、hash manifest 管理は `scripts/release/lib/secrets-hash-manifest.sh` に分離する。

### D-4. PII scrub — 外部送信データの allowlist が Observability 導入の前提条件

Sentry / Grafana Cloud / Better Stack へデータを送信する前に、PII scrub allowlist を定義する。Sentry `beforeSend` callback で ES 本文・志望動機・企業メモ・guest token を strip。backend は `secure_logger.py` の既存 redaction パターンを活用する。

### D-5. RAG インデックス — バックアップではなくリビルド手順

ChromaDB + BM25 インデックスは Supabase のドキュメントメタデータと外部 URL から導出可能。Railway volume snapshot API は存在しないため、リビルド手順を正本とする。推定リビルド時間: 2-4 時間。

### D-6. フィーチャーフラグ — 環境変数ベース

外部サービス (LaunchDarkly, PostHog) は導入しない。`FF_<FLAG_NAME>=1` 環境変数で制御し、Vercel/Railway の env var 変更 + リデプロイでトグルする。週 1-2 回リリースの頻度ではリデプロイコストは許容範囲。

### D-7. ヘルスチェック — deep check の分離

`/health/ready` に volume/ChromaDB/cron チェックを追加するとデプロイヘルスチェックが重くなる。`/health/deep` を新設し、合成監視からのみ呼び出す設計にする。Railway のヘルスチェック対象は `/health` のまま維持。

### D-8. Sentry tunnel — セキュリティ制約

`/api/monitoring/sentry` は unauthenticated ingest endpoint になるため、以下の制約を実装に含める:

- JSON payload size: 64KB 上限
- レート制限: 60 req/min per IP
- allowed DSN / project ID のホワイトリスト
- CSRF exemption 根拠: Sentry SDK が自動送信するため CSRF token を含められない。代わりに DSN ホワイトリストと payload schema 検証で保護する

### D-9. Supabase DB 分離 — スコープ外

staging/production の Supabase プロジェクト分離は本計画のスコープ外とする。migration、RLS 検証、secret sync target、staging seed、PITR cost を含む別計画として `database-engineer` / `security-auditor` が担当する。

## 6. Task Tracker

### Phase 1: P0 — Must-Have for Launch (~35h)

「安全に戻せる・異常に気づける・secrets を壊さない」に限定。

| Status | Priority | Area | Task | Acceptance Criteria | Updated At |
|---|---|---|---|---|---|
| Todo | P0 | 信頼性 | R-1. `rollback-career-compass.sh` を confirm-before-execute 拡張する | (1) `--dry-run` で Vercel/Railway の現在・直前デプロイ ID を表示 (2) `--confirm` で実行ゲートを開く (3) Vercel: `vercel rollback` を `run_real` 経由で実行 (4) Railway: `railway deploy --commit <sha>` を `run_real` 経由で実行 (5) 実行後 `wait_for_http_ok` で frontend/backend ヘルスチェック (6) 全操作を `~/.career_compass/rollback-audit.log` に記録 | 2026-05-05 |
| Todo | P0 | 信頼性 | R-2. インシデント対応手順書を作成する | `docs/ops/INCIDENT_PLAYBOOK.md` に (1) P0-P3 severity 分類 (2) 検知→トリアージ→緩和→解決→振り返りの 5 ステップフロー (3) provider 別障害対応手順 (Vercel/Railway/Supabase/Stripe/LLM) (4) 決定木（ログイン不可→P0, 支払い不可→P0, 主要機能停止→P1）(5) 1 人運用最適化（セルフ通知、エスカレーション不要） | 2026-05-05 |
| Todo | P0 | 信頼性 | R-3. Better Stack で合成監視を設定する | (1) `https://www.shupass.jp` HTTP 200 監視 (3 分 interval) (2) `shupass-backend-production.up.railway.app/health` HTTP 200 監視 (3 分 interval) (3) email アラート設定 (4) `docs/ops/MONITORING_SETUP.md` に設定手順を記録 | 2026-05-05 |
| Todo | P0 | 信頼性 | R-4. cron dead-man's switch を導入する | (1) Healthchecks.io に daily-notifications (期待: 25h 以内) と calendar-sync (期待: 35 分以内) の 2 monitor を作成 (2) `src/app/api/cron/daily-notifications/route.ts` の成功時末尾に heartbeat ping 追加 (3) calendar-sync cron の成功時に heartbeat ping 追加 (4) 環境変数 `HEALTHCHECK_CRON_*_URL` を secrets bundle に追加 | 2026-05-05 |
| Todo | P0 | 信頼性 | R-5. バックエンド `/health/deep` エンドポイントを新設する | (1) `/app/data/chroma` と `/app/data/bm25` の存在・書き込み可能を検証 (2) ChromaDB collection list が応答するか検証 (3) 応答時間自己計測 (>5s で warning) (4) `/health/ready` には手を加えない。Railway ヘルスチェック対象も変えない (5) Better Stack から `/health/deep` を 5 分 interval で監視 | 2026-05-05 |
| Todo | P0 | 信頼性 | R-6. DB マイグレーション安全策を整備する | (1) `scripts/ops/pre-deploy-schema-snapshot.sh` を作成。`pg_dump --schema-only` で pre-deploy スキーマを `~/.career_compass/schema-snapshots/` に保存 (2) `release-career-compass.sh` の `promote_to_main` 前にスナップショット取得を挿入 (3) `docs/ops/MIGRATION_ROLLBACK.md` にロールバック手順を文書化（paired rollback SQL 方針、PITR 手順） | 2026-05-05 |
| Todo | P0 | セキュリティ | S-1. secrets 監査ログを helper として実装する | (1) `scripts/release/lib/secrets-audit-log.sh` を作成 (2) `audit_log_entry()` 関数: JSON-lines 形式で `{timestamp, mode, target, git_sha, hostname, user, action, key_name}` を記録 (3) ログ先: `${CAREER_COMPASS_SECRETS_ROOT_EFFECTIVE}/.audit-log/sync-$(date +%Y%m).jsonl` (4) secret 値は絶対にログに含めない (5) `sync-career-compass-secrets.sh` から `audit_log_entry` を呼び出す | 2026-05-05 |
| Todo | P0 | セキュリティ | S-2. ハッシュベースの値ドリフト検出を実装する | (1) `scripts/release/lib/secrets-hash-manifest.sh` を作成 (2) `hash_env_value()` 関数: `shasum -a 256` でバンドル値をハッシュ (3) `vercel env pull` / `railway variables --json` でプロバイダ値を取得・ハッシュ比較 (4) `--check-values` opt-in フラグで有効化（デフォルトはキー名のみ） (5) ドリフト検出結果を監査ログに記録 | 2026-05-05 |
| Todo | P0 | セキュリティ | S-3. npm audit を CI ブロッカーに昇格する | (1) `scripts/ci/npm-audit-allowlist.json` を作成（reviewed advisory ID + reason + review date） (2) `scripts/ci/run-frontend-verify.sh` の npm audit を allowlist フィルタ付きで fail-on-high に変更 (3) `develop-ci.yml` と `main-promotion-guard.yml` の frontend job で反映 | 2026-05-05 |
| Todo | P0 | セキュリティ | S-4. pip-audit を CI に導入する | (1) `backend/requirements-dev.txt` に `pip-audit>=2.7.0` 追加 (2) `scripts/ci/run-backend-deterministic.sh` に `pip-audit --strict --desc` ステップ追加 (3) `backend/pip-audit-allowlist.json` で unfixable advisory を管理 (4) `develop-ci.yml` と `main-promotion-guard.yml` の backend job で反映 | 2026-05-05 |
| Todo | P0 | セキュリティ | S-5. Dependabot を設定する | (1) `.github/dependabot.yml` 作成: npm (root + src), pip (backend), github-actions 3 ecosystem (2) 週次スケジュール (3) minor/patch グループ化で PR noise 削減 (4) `open-pull-requests-limit: 10` (5) 主要フレームワーク (Next.js, FastAPI) の major は ignore | 2026-05-05 |
| Todo | P0 | セキュリティ | S-6. ログ保持ポリシーを策定する | (1) `docs/ops/LOG_RETENTION_POLICY.md` 作成 (2) カテゴリ別 retention: ERROR 90 日 / WARN 30 日 / INFO 7 日 / DEBUG production 無効 (3) プロバイダ別: Vercel (Pro 3 日 or log drain), Railway (7 日), Supabase (pgaudit), Sentry (90 日 free tier) (4) 即時アクション: Better Stack log drain または Axiom free tier の選定 | 2026-05-05 |
| Todo | P0 | 観測性 | O-1. PII scrub allowlist を定義する | (1) `docs/ops/PII_SCRUB_POLICY.md` 作成 (2) 外部送信禁止データ: ES 本文、志望動機テキスト、企業メモ、guest_device_token、user email、mypagePassword (3) 許可データ: error message (redacted), stack trace (dev only), request path, status code, response time, user plan tier (4) Sentry `beforeSend` callback の実装仕様 (5) backend `secure_logger.py` の既存 redaction パターンとの整合性確認 | 2026-05-05 |
| Todo | P0 | DR | D-1. RPO/RTO を定義する | (1) `docs/ops/DISASTER_RECOVERY.md` 作成 (2) Critical (user accounts, payments, documents): RPO 24h→target 1h, RTO unknown→target 2h (3) Important (AI outputs, notifications): RPO 24h, RTO 4h (4) Rebuildable (ChromaDB, BM25): RPO 72h acceptable, RTO 8h (5) Recoverable (application code): RPO realtime (git), RTO 15min | 2026-05-05 |
| Todo | P0 | DR | D-2. 週次論理バックアップスクリプトを作成する | (1) `scripts/ops/backup-supabase-logical.sh` 作成 (2) `pg_dump --format=custom` via DIRECT_URL (3) age / GPG で暗号化 (4) ローカル `~/.career_compass/backups/` に保存 (5) Healthchecks.io heartbeat で成功監視 (6) ダンプが非空かつ期待テーブル数を含むことを検証 | 2026-05-05 |

### Phase 2: P1 — Should-Have (~50h)

| Status | Priority | Area | Task | Acceptance Criteria | Updated At |
|---|---|---|---|---|---|
| Todo | P1 | 信頼性 | R-7. ロールバック後の自動通知を実装する | (1) ロールバック成功/失敗時に GitHub Issue を自動作成 (`gh issue create --label incident`) (2) optional: Slack webhook で個人 workspace に通知 (3) Issue に rollback 対象、理由、ヘルスチェック結果を含める | 2026-05-05 |
| Todo | P1 | 信頼性 | R-8. ポストモーテムテンプレートを作成する | `docs/ops/POSTMORTEM_TEMPLATE.md` に Incident ID, severity, duration, timeline, root cause, impact, action items, lessons learned を定義 | 2026-05-05 |
| Todo | P1 | 信頼性 | R-9. フィーチャーフラグの基盤を実装する | (1) `src/lib/feature-flags.ts`: `FF_<FLAG>` 環境変数の型安全な読み取り (2) `backend/app/utils/feature_flags.py`: 同等の Python 実装 (3) `docs/ops/FEATURE_FLAGS.md` に運用手順（追加・トグル・削除） | 2026-05-05 |
| Todo | P1 | 信頼性 | R-10. デプロイメントウィンドウを文書化する | `docs/ops/DEPLOYMENT_WINDOWS.md` に (1) 推奨: 火水 14:00 JST (2) 禁止: 金曜、週末、cron 実行中 (3) ピーク回避: 20:00-23:00 JST (就活生利用ピーク) (4) 週次リリース推奨スケジュール | 2026-05-05 |
| Todo | P1 | 信頼性 | R-11. CI マイグレーション安全チェックを強化する | (1) `main-promotion-guard.yml` migration-safety job に追加: `ALTER TABLE ADD COLUMN NOT NULL` without `DEFAULT` 検出 (2) `CREATE INDEX` without `CONCURRENTLY` 検出 (3) `drizzle-kit check` による schema diff 検証 | 2026-05-05 |
| Todo | P1 | セキュリティ | S-7. シークレットローテーション手順書を作成する | (1) `docs/ops/SECRET_ROTATION_RUNBOOK.md` 作成 (2) CAREER_PRINCIPAL_HMAC_SECRET: dual-write (FastAPI に `_PREVIOUS` env var 追加 → BFF 更新 → `_PREVIOUS` 削除) (3) INTERNAL_API_JWT_SECRET: 同 dual-write (4) BETTER_AUTH_SECRET: session 全無効化を伴う (5) STRIPE_SECRET_KEY: Stripe rolling secrets 手順 (6) 緊急ローテーション: 「secret が commit/log に露出した場合」チェックリスト | 2026-05-05 |
| Todo | P1 | セキュリティ | S-8. HMAC dual-write のバックエンド対応を実装する | (1) `backend/app/security/career_principal.py` に `CAREER_PRINCIPAL_HMAC_SECRET_PREVIOUS` fallback 検証を追加 (2) 現在の key で検証失敗 → previous key で再検証 → 両方失敗で 401 (3) `PREVIOUS` が未設定の場合は現行動作と同一 | 2026-05-05 |
| Todo | P1 | セキュリティ | S-9. secrets アクセスインベントリを作成する | `docs/ops/SECRETS_INVENTORY.md` に (1) secret 名、source env file、consuming service(s)、rotation impact、最終ローテーション日 の一覧表 (2) `sync-career-compass-secrets.sh` の bundle ファイルから自動生成可能なスクリプト | 2026-05-05 |
| Todo | P1 | セキュリティ | S-10. CSP style-src 硬化を計画する | (1) `style-src` を `style-src-elem 'self' 'nonce-{nonce}'` と `style-src-attr 'unsafe-inline'` に分離 (2) LP セクションの `dangerouslySetInnerHTML` SCOPED_CSS を CSS modules に移行 (3) Radix UI inline style 影響を Playwright UI smoke test で検証 | 2026-05-05 |
| Todo | P1 | セキュリティ | S-11. WAF 統合を評価・設定する | (1) Cloudflare proxy (orange cloud) を `www.shupass.jp` と `stg.shupass.jp` で有効化 (2) 基本 WAF ルール (free tier) を有効化 (3) SSL 証明書管理の変更を検証 (4) `docs/ops/WAF_DEPLOYMENT.md` に設定手順を記録 | 2026-05-05 |
| Todo | P1 | セキュリティ | S-12. Railway temp dir のリークを修正する | (1) `sync-career-compass-secrets.sh` の `/tmp/career-compass-railway-drift-*` に `trap` cleanup を追加 (2) `mktemp -d` を使用 (3) `career-compass-secrets-root.sh` のハードコード `/Users/saoki/work/codex-company` を `$HOME/work/codex-company` に変更 | 2026-05-05 |
| Todo | P1 | 観測性 | O-2. Sentry をフロントエンドに導入する | (1) `@sentry/nextjs` を追加 (2) `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` 作成 (3) `next.config.ts` を `withSentryConfig()` でラップ (4) `tracesSampleRate: 0.1`, `replaysSessionSampleRate: 0` (5) source map upload via Vercel integration (6) release tracking: `SENTRY_RELEASE = VERCEL_GIT_COMMIT_SHA` (7) `beforeSend`: O-1 の PII scrub allowlist に従う (8) tunnel route `/api/monitoring/sentry` を D-8 制約で実装 | 2026-05-05 |
| Todo | P1 | 観測性 | O-3. Sentry をバックエンドに導入する | (1) `sentry-sdk[fastapi]>=2.0.0` を `requirements.txt` に追加 (2) `backend/app/sentry_setup.py` 作成 (3) `main.py` で lifespan 内に init (4) `traces_sample_rate=0.1`, `send_default_pii=False` (5) `before_send` callback で PII strip (6) release: `SENTRY_RELEASE = RAILWAY_GIT_COMMIT_SHA` | 2026-05-05 |
| Todo | P1 | 観測性 | O-4. Better Stack ステータスページを設定する | (1) `status.shupass.jp` CNAME を Cloudflare に追加 (2) Better Stack status page 作成 (Frontend, Backend API, Database, Cron Jobs) (3) 日本語設定 (4) auto-incident creation 有効化 (5) `docs/ops/STATUS_PAGE.md` に設定手順を記録 | 2026-05-05 |
| Todo | P1 | 観測性 | O-5. アラート実装を OBSERVABILITY.md ルールにバインドする | (1) Sentry: error rate spike > 5x → email, principal_mismatch → immediate email (2) Grafana Cloud (メトリクスエクスポート後): `rag_principal_mismatch_total > 0/1h`, `tenant_filter_miss > 1%/5m`, `rerank p95 > 2s/10m`, `retrieval errors > 5/5m` (3) Better Stack: frontend/backend down > 3min → email + push (4) `docs/ops/OBSERVABILITY.md` を実装済みの状態に更新 | 2026-05-05 |
| Todo | P1 | 観測性 | O-6. Grafana Cloud メトリクスエクスポートを設定する | (1) `opentelemetry-exporter-otlp-proto-http` を `requirements.txt` に追加 (2) `backend/app/metrics/otlp_exporter.py` 作成: push metrics to Grafana Cloud via OTLP/HTTP (3) 既存 `rag/telemetry.py` の Prometheus metrics を OTLP に並行出力 (4) 内部 `/metrics` endpoint は作らない (5) `docs/ops/grafana/rag-dashboard.json` を Grafana Cloud にインポート | 2026-05-05 |
| Todo | P1 | DR | D-3. DB リカバリ手順書を作成する | `docs/ops/runbooks/DATABASE_RESTORE.md` に (1) PITR 手順 (Supabase dashboard) (2) 論理バックアップからの復旧手順 (3) 一時 Supabase プロジェクトでの検証ステップ (4) env var 切り替え手順 (5) 推定復旧時間: PITR 30-60 分、論理 2-4 時間 | 2026-05-05 |
| Todo | P1 | DR | D-4. RAG インデックスリビルド手順書を作成する | `docs/ops/runbooks/RAG_REBUILD.md` に (1) DB 健全性確認 (2) Railway サービス再デプロイ (空ボリューム) (3) 全企業の re-ingest API 呼び出し (4) `ingest_reference_es.py` で参照 ES コーパス再構築 (5) `/health/ready` と RAG retrieval テストで検証 (6) 推定時間: 2-4 時間 | 2026-05-05 |
| Todo | P1 | DR | D-5. フル環境再構築手順書を作成する | `docs/ops/runbooks/FULL_ENVIRONMENT_REBUILD.md` に (1) DNS: Cloudflare 設定 (5 分) (2) DB: Supabase 新規 + migration + backup restore (30 分) (3) Backend: Railway + env sync (20 分) (4) Frontend: Vercel + env sync (10 分) (5) RAG: rebuild (2-4h) (6) Stripe: webhook URL 更新 (15 分) (7) Google OAuth: redirect URI 更新 (10 分) (8) 合計推定: 4-6 時間 | 2026-05-05 |
| Todo | P1 | DR | D-6. プロバイダフェイルオーバー手順書を作成する | `docs/ops/runbooks/PROVIDER_FAILOVER.md` に (1) Vercel down → Cloudflare Pages or Railway 静的配信 (2) Railway down → Render/Fly.io に同一 Dockerfile でデプロイ (3) Supabase down → Neon/Railway Postgres に論理バックアップ復旧 (4) Cloudflare down → レジストラ NS をプロバイダデフォルトに切替 (5) OpenAI down → Anthropic fallback (既存 multi-model 対応) (6) Anthropic down → GPT/Gemini fallback | 2026-05-05 |
| Todo | P1 | DR | D-7. Supabase PITR の費用対効果を評価する | (1) Supabase Pro ($25/月) + PITR ($100/月) のコスト vs RPO 改善 (24h → 秒) (2) 代替案: 週次論理バックアップ + 4h RPO は許容可能か (3) `docs/ops/DISASTER_RECOVERY.md` に評価結果を追記 (4) 判断期限: 本番リリース後 1 ヶ月 | 2026-05-05 |

### Phase 3: P2 — Nice-to-Have (~25h)

| Status | Priority | Area | Task | Acceptance Criteria | Updated At |
|---|---|---|---|---|---|
| Todo | P2 | 信頼性 | R-12. Canary / staged rollout の実現可能性を評価する | (1) Vercel traffic splitting (Pro plan 必要) の調査 (2) Railway canary の制約 (非対応) 文書化 (3) 結論: 現時点では develop→staging→production の既存フローで十分 | 2026-05-05 |
| Todo | P2 | 信頼性 | R-13. 自動 changelog 生成を導入する | (1) Conventional Commits 導入または git log parser (2) リリース PR body にカテゴリ別 (feat/fix/breaking) で自動挿入 (3) `create-career-compass-release-pr.sh` を拡張 | 2026-05-05 |
| Todo | P2 | セキュリティ | S-13. サードパーティスクリプトインベントリを作成する | `docs/ops/THIRD_PARTY_SCRIPT_INVENTORY.md` に (1) Google Analytics: domain, purpose, CSP entry, SRI 不可 (URL 動的変更) (2) Stripe: domain, purpose, CSP entry, SRI 不可 (公式非対応) (3) 最終レビュー日 | 2026-05-05 |
| Todo | P2 | セキュリティ | S-14. ライセンスコンプライアンスチェックを導入する | `scripts/ci/check-licenses.sh` で `npx license-checker --production --failOn "GPL-3.0;AGPL-3.0"` + Python 同等チェック | 2026-05-05 |
| Todo | P2 | セキュリティ | S-15. CodeQL path-ignore 例外を除去する | `.github/codeql/codeql-config.yml` の `http_fetch.py`, `bm25_store.py`, `llm.py` 除外を解除。前提: `security-vulnerability-hardening-plan.md` F-8 (SSRF 修正) 完了後 | 2026-05-05 |
| Todo | P2 | セキュリティ | S-16. Bot 保護を評価する | (1) Cloudflare proxy 有効化 (S-11) 後の bot fight mode 検証 (2) Cloudflare Turnstile のコンタクトフォーム・ログイン画面への導入検討 (3) 結論を `docs/ops/WAF_DEPLOYMENT.md` に追記 | 2026-05-05 |
| Todo | P2 | セキュリティ | S-17. レート制限設定を監査する | `docs/ops/RATE_LIMIT_AUDIT.md` に (1) 現行制限一覧 (FastAPI per-endpoint, spike handler, daily token) (2) Vercel/Railway analytics からのトラフィックベースライン (3) 調整推奨 | 2026-05-05 |
| Todo | P2 | 観測性 | O-7. ログ集約を設定する | (1) Better Stack Logtail free tier (1GB/day, 3 日 retention) (2) Vercel log drain → Better Stack (3) Railway log drain → Better Stack (Pro plan or API polling fallback) (4) `docs/ops/LOG_AGGREGATION.md` に設定手順 | 2026-05-05 |
| Todo | P2 | 観測性 | O-8. ビジネスメトリクスダッシュボードを作成する | Grafana Cloud に (1) `http_requests_total{method,path,status}` (2) `llm_tokens_used_total{model,feature}` (3) `credit_consumption_total{plan,feature}` (4) `stripe_webhook_events_total{type,status}` | 2026-05-05 |
| Todo | P2 | DR | D-8. DR テストスケジュールを策定する | `docs/ops/DR_TEST_SCHEDULE.md` に (1) Q3 2026: DB PITR restore test + RAG rebuild (staging) (2) Q4 2026: フル staging 再構築 (3) Q1 2027: Railway → Render フェイルオーバー (4) 四半期ドリル結果は `docs/ops/dr-drill-log/YYYY-QN.md` に記録 | 2026-05-05 |
| Todo | P2 | セキュリティ | S-18. セキュリティレビュー定期実行計画を策定する | `docs/ops/SECURITY_REVIEW_CADENCE.md` に (1) 毎コミット: pre-commit scan (2) 毎 PR: dependency review + CodeQL (3) 毎週: secrets drift check (4) 毎月: npm/pip audit + Stripe webhook 監査 (5) 四半期: SECURITY.md 全面レビュー + CSP 検証 (6) 年次: OWASP Top 10 再評価 | 2026-05-05 |

## 7. テスト・検証計画

### Phase 1 (P0) 検証

| タスク | 検証方法 |
|---|---|
| R-1 (ロールバック) | staging で `--dry-run` と `--confirm` の両モードを実行。ヘルスチェック成功を確認 |
| R-3 (合成監視) | Better Stack ダッシュボードで monitor が green であることを確認。意図的に backend を停止してアラート発火を検証 |
| R-4 (dead-man's switch) | Healthchecks.io で heartbeat が受信されていることを確認。cron を手動停止して alert 発火を検証 |
| R-5 (deep health) | `curl /health/deep` で JSON レスポンスと status code を確認 |
| R-6 (schema snapshot) | `pre-deploy-schema-snapshot.sh` 実行後、snapshot ファイルが期待テーブル数を含むことを確認 |
| S-1 (secrets 監査) | `sync-career-compass-secrets.sh --check` 実行後、audit log ファイルにエントリが追記されることを確認 |
| S-2 (hash drift) | provider 側で値を変更し、`--check-values` でドリフトが検出されることを確認 |
| S-3 (npm audit) | 既知の vulnerable dependency を追加し、CI が fail することを確認。allowlist に追加して pass することを確認 |
| S-4 (pip-audit) | 同上 (Python) |
| S-5 (Dependabot) | `.github/dependabot.yml` push 後、PR が自動作成されることを確認 |
| O-1 (PII scrub) | Sentry テストイベントに ES 本文を含めて送信し、Sentry UI で redacted されていることを確認 |
| D-1 (RPO/RTO) | `docs/ops/DISASTER_RECOVERY.md` の内容レビュー |
| D-2 (バックアップ) | スクリプト実行後、暗号化ダンプが非空で、`pg_restore --list` で期待テーブルが含まれることを確認 |

### Phase 2 (P1) 検証

| タスク | 検証方法 |
|---|---|
| O-2/O-3 (Sentry) | 意図的に例外を throw し、Sentry ダッシュボードでイベントが表示されることを確認。PII が含まれないことを確認 |
| O-5 (アラート) | Grafana Cloud でアラートルールが active であることを確認。テストアラートの発火を確認 |
| O-6 (メトリクス) | Grafana Cloud ダッシュボードで RAG metrics が表示されることを確認 |
| S-7/S-8 (ローテーション) | staging で HMAC secret を dual-write 手順でローテーション。ローテーション中にリクエストが成功することを確認 |

## 8. 依存関係

```
R-1 (rollback) ← R-7 (通知) ← R-8 (postmortem)
S-1 (監査ログ) ← S-2 (hash drift)
S-11 (WAF/Cloudflare) ← S-16 (Bot 保護)
O-1 (PII scrub) ← O-2 (Sentry frontend) ← O-3 (Sentry backend) ← O-5 (アラート)
O-6 (Grafana metrics) ← O-5 (アラート binding)
O-6 (Grafana metrics) ← O-8 (ビジネスメトリクス)
D-1 (RPO/RTO) ← D-2 (バックアップ) ← D-3 (DB リカバリ) ← D-8 (DR テスト)
D-4 (RAG rebuild) ← D-5 (フル再構築) ← D-8 (DR テスト)
F-8 (SSRF修正, security-vulnerability-hardening-plan.md) ← S-15 (CodeQL例外除去)
```

## 9. 実行順序の推奨

1 人運用・週 1-2 回リリースの前提で、P0 タスクの推奨実行順序:

| 週 | タスク | 理由 |
|---|---|---|
| Week 1 | R-2 (手順書), D-1 (RPO/RTO), O-1 (PII scrub), S-6 (ログ保持) | docs-only、他タスクの前提条件 |
| Week 2 | S-1 (監査ログ), S-2 (hash drift), S-5 (Dependabot) | secrets 基盤強化。独立して並行可能 |
| Week 3 | S-3 (npm audit), S-4 (pip-audit), R-3 (合成監視) | CI 強化 + 外部監視。独立して並行可能 |
| Week 4 | R-4 (dead-man's switch), R-5 (deep health), R-6 (schema snapshot) | ヘルスチェック系。独立して並行可能 |
| Week 5 | R-1 (ロールバック), D-2 (バックアップ) | 最大 blast radius。基盤が整った後に実施 |

## 10. コスト見積もり

| 項目 | 月額 | 備考 |
|---|---|---|
| Sentry Developer | $0 | 5K errors, 10K transactions |
| Grafana Cloud Free | $0 | 50GB logs, 10K metrics, 14 日 retention |
| Better Stack Free | $0 | 5 monitors, 1 status page |
| Healthchecks.io Free | $0 | 20 checks |
| Supabase (現行) | 現状維持 | 日次自動バックアップ含む |
| Supabase PITR (P1 検討) | +$100 | 7 日 PITR。P1 で費用対効果を評価 |
| **合計 (P0)** | **$0** | |
| **合計 (P1 PITR 含む)** | **+$100** | |

## 11. 進捗ログ

| 日付 | Actor | 更新内容 |
|---|---|---|
| 2026-05-05 | Claude (計画策定) | 初版作成。4 ドメイン・45 タスク (P0: 15, P1: 20, P2: 10)。Codex Plan Review (PASS_WITH_CONCERNS) の 6 findings 反映済み |
