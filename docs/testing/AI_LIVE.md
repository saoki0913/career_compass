# AI Live

実 API を使って `ES添削` `企業RAG取り込み` `選考スケジュール取得` `ガクチカ作成` `志望動機作成` `面接対策` を定時実行で検証し、夜間の workflow 完了時点で GitHub Issue を更新して、翌朝すぐ改善着手できる状態を作る運用の説明です。

- workflow 名: `AI Live`
- 正本環境: `staging`
- 毎日 23:07 JST: `smoke`
- 毎週日曜 23:37 JST: `extended`
- 朝の確認先: GitHub Issue `AI Live Daily Report YYYY-MM-DD`

## 1. Job 構成

- `es-review-live`: live ES review の `pytest` と ES review stream の Playwright
- `rag-ingest-live`: 企業RAG取り込みの backend live eval
- `selection-schedule-live`: 選考スケジュール取得の backend live eval
- `gakuchika-live`: ガクチカ作成の live conversation
- `motivation-live`: 志望動機作成の live conversation
- `interview-live`: 面接対策の live conversation
- `compile-live-report`: 上記の内部 artifact から公開用 report artifact を 1 本に再パッケージする
- `publish-live-report`: 翌朝に見る GitHub Issue を create/update する

stateful な staging CI user を使う job は次の 4 つで、workflow 上で直列実行する。

- `es-review-live`
- `gakuchika-live`
- `motivation-live`
- `interview-live`

`rag-ingest-live` と `selection-schedule-live` は CI user state に依存しないため独立実行のままにする。

## 2. 判定

- `failed`: API 失敗、stream 不完走、必須トークン未達、生成物未作成、cleanup 失敗
- `degraded`: judge や heuristic が「深掘り不足」「要点反映不足」「confidence が低い」などを検知したが hard failure ではない
- `passed`: hard fail も degraded もない

conversation 系では `status` と `severity` を分ける。

- `status`: Playwright ケース自体の完走状態
- `severity`: 朝の運用で見る品質状態

suite ごとの blocking 方針:

- `smoke`: `ES添削` と conversation 3機能の failed は blocking
- `extended`: conversation 系の実行障害は blocking、`ES添削` の quality failure は report-only
- `企業RAG取り込み` と `選考スケジュール取得`: suite を問わず report-only

## 3. Report

公開用 artifact は 1 本で、その中身は `6 JSON + 1 Markdown` の 7 ファイルのみ。

- `ai-live-summary.md`
- `live_es_review_*.json`
- `live_rag_ingest_*.json`
- `live_selection_schedule_*.json`
- `live_gakuchika_*.json`
- `live_motivation_*.json`
- `live_interview_*.json`

job 間受け渡しには internal artifact を使うが、朝に見る対象は上記の公開 artifact のみ。

`ai-live-issue-body.md` などの Markdown 副産物は artifact に含めず、`publish-live-report` job で JSON から再生成する。

Issue と summary では必ず次を分けて表示する。

- ES添削
- 企業RAG取り込み
- 選考スケジュール取得
- ガクチカ作成
- 志望動機作成
- 面接対策

## 4. 手動実行

全体:

```bash
bash scripts/ci/run-ai-live.sh --suite smoke --feature all
```

機能単位:

```bash
bash scripts/ci/run-ai-live.sh --suite smoke --feature es-review
bash scripts/ci/run-ai-live.sh --suite smoke --feature rag-ingest
bash scripts/ci/run-ai-live.sh --suite smoke --feature selection-schedule
bash scripts/ci/run-ai-live.sh --suite smoke --feature gakuchika
bash scripts/ci/run-ai-live.sh --suite smoke --feature motivation
bash scripts/ci/run-ai-live.sh --suite smoke --feature interview
```

staging で stateful 4 job を手動確認するときは、feature 実行前に必ず auth preflight と reset を走らせる。

```bash
node scripts/ci/check-ai-live-auth.mjs --base-url https://stg.shupass.jp
node scripts/ci/reset-ai-live-state.mjs --base-url https://stg.shupass.jp
```

## 5. 朝の確認手順

1. GitHub Issue `AI Live Daily Report YYYY-MM-DD` を開く
2. `今日やること` を見て、優先度が高い feature から着手する
3. feature セクションで `主な原因` `改善提案` `failed/degraded case` を確認する
4. 必要なら Issue 内の run URL から GitHub Actions に入り、artifact を開く
5. 公開 artifact 内の `ai-live-summary.md` と 6 feature JSON を確認し、feature report の deterministic fail、judge reason、cleanup 状態を追う

## 6. staging auth preflight

conversation 系と ES review の Playwright 実行前に `scripts/ci/check-ai-live-auth.mjs` を走らせる。

- 期待値:
  - invalid bearer に対して `401`
  - configured secret に対して `200`
- `404 / CI_TEST_AUTH_DISABLED` の場合は staging の env 不備として即失敗させる
- raw `404` や `5xx` は deployment drift / route 不整合として request id 付きで失敗させる
- 主確認対象:
  - `CI_E2E_AUTH_SECRET`
  - `BETTER_AUTH_SECRET`
  - `CI_E2E_AUTH_ENABLED`
  - `NEXT_PUBLIC_APP_URL`
  - `BETTER_AUTH_URL`

## 7. CI user reset / seed

AI Live の stateful failure は、feature quality より先に staging 上の単一 CI user 状態汚染として扱う。  
そのため `es-review-live` `gakuchika-live` `motivation-live` `interview-live` は毎回 preflight の直後に `scripts/ci/reset-ai-live-state.mjs` を実行する。

- endpoint: `POST /api/internal/test-auth/reset-live-state`
- auth: `Authorization: Bearer <CI_E2E_AUTH_SECRET>`
- availability: staging など non-production のみ。`https://www.shupass.jp` では無効
- credits seed: `1000` 固定
- reset 対象:
  - CI user の live company (`AI添削会社_live-es-*`, `*_live-ai-conversations-*`)
  - CI user 所有の `gakuchika_contents`
  - CI user 所有の `motivation_conversations`
    - live company 紐づきは delete
    - それ以外は soft reset
  - CI user 所有の `interview_conversations`
    - live company 紐づきは delete
    - それ以外は soft reset
  - CI user 所有の `interview_feedback_histories`, `interview_turn_events`
  - CI user の `credit_transactions`

reset script の成功ログには `userId`, `creditBalance`, `deletedCounts` を出す。  
workflow 上の stateful 4 job はこの reset 前提なので、job 間 cleanup helper を正本にしない。

company_info 系 nightly の secret は `github-actions.env` を正本にする。

- `OPENAI_API_KEY`
- `GOOGLE_API_KEY`
- `ANTHROPIC_API_KEY`
- `FIRECRAWL_API_KEY`
- GitHub 反映は `zsh scripts/release/sync-career-compass-secrets.sh --apply --target github` を使う

## 8. 改善提案の考え方

Issue には feature ごとに自動の改善提案を入れる。

- `ES添削`: 文字数制御、grounding、judge 低評価
- `企業RAG取り込み`: crawl 失敗、embedding/store 失敗、cleanup 失敗
- `選考スケジュール取得`: deadline 未抽出、date parse、confidence/source follow
- `ガクチカ作成`: 深掘り不足、要約/ES draft 反映不足
- `志望動機作成`: 企業理解不足、経験接続不足、差別化不足
- `面接対策`: 追質問不足、feedback の具体性不足

v1 は deterministic / heuristic 集約が正本。LLM に全面依存しないため、夜間実行が不安定でも翌朝の Issue は残る。
