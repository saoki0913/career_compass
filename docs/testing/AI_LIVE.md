# AI Live

実 API を使って `ES添削` `企業情報検索` `企業RAG取り込み` `選考スケジュール取得` `ガクチカ作成` `志望動機作成` `面接対策` を検証する運用の説明です。

> **現状: CI 定期実行は停止中 (2026-04-16〜)**
> 会話3機能（ガクチカ / 志望動機 / 面接対策）の品質ゲートが staging 上で収束しないケースが続き、`degraded` 扱いで CI が green になる「偽 green」が常態化していたため、`.github/workflows/ai-live.yml` の `on.schedule:` を一時停止した。
> AI 機能の改善が局所完成するまで、**ローカル `make ai-live-local` を正本**とする。GitHub Actions UI からの手動 dispatch（`workflow_dispatch`）は引き続き利用可能。

- `localhost / make ai-live-local`: ローカル開発中に 6機能を一括実行する（**現在の正本**）
- `manual dispatch / GitHub Actions`: staging を正本に 7機能を任意のタイミングで実行する（手動のみ）
- ~~`nightly / GitHub Actions`: staging を正本に 7機能を定時実行する~~ **(停止中)**

- workflow 名: `AI Live`
- 正本環境: `staging`（手動 dispatch 時）/ `localhost`（`make ai-live-local`）
- ~~毎日 23:07 JST: `smoke`~~ **(停止中)**
- ~~毎週日曜 23:37 JST: `extended`~~ **(停止中)**
- 朝の確認先: ローカル `make ai-live-local` の出力 `backend/tests/output/local_ai_live/<suite>_<timestamp>/`（手動 dispatch を走らせた場合のみ GitHub Issue `AI Live Daily Report YYYY-MM-DD`）

## 復活手順（cron 再開時）

会話3機能の収束が安定し、`degraded` 比率が許容範囲に収まったら、`.github/workflows/ai-live.yml` の `on:` 直下に下記を追記して `develop` に push する。`resolve-suite` 内の `case "${{ github.event.schedule }}"` 分岐は残してあるので追加修正は不要。

```yaml
  schedule:
    - cron: "7 14 * * *"   # 毎日 23:07 JST: smoke
    - cron: "37 14 * * 0"  # 毎週日曜 23:37 JST: extended
```

## 1. Job 構成

- `es-review-live`: live ES review の `pytest` と ES review stream の Playwright
- `company-info-search-live`: 企業情報検索の live search eval
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

### 会社系 live（選考スケジュール / 企業RAG取り込み）の行スキーマ

- pytest の成否で nightly を落とさない方針は変えない（いまも **report-only**）。
- 各ケース行に `failureKind`（例: `none`, `infra`, `quality`, `cleanup`）と `severity`（`passed` / `degraded` / `failed`）を載せ、summary の集計・推奨ルールと揃える。
  - 選考スケジュール: 失敗理由が `confidence_low_only` **のみ**のとき `degraded` + `failureKind: quality`（それ以外の理由が混ざれば `failed`）。
  - 企業RAG: 失敗理由が `retrieval_weak` **のみ**のとき `degraded` + `failureKind: quality`。`cleanup_failed` は `failureKind: cleanup`。クロール・保存系は `infra`。
- 付帯 Markdown は `failed` / `degraded` 行に **appendix**（`source_url`、失敗した check の evidence、エラー要約）を載せる。

`make ai-live-local` のみの追加方針（staging / 手動 `run-ai-live.sh` には影響しない）:

- **ES添削**: `pytest` のみ実行し、ブラウザ E2E（`live-ai-major.spec.ts`）はスキップする（`AI_LIVE_SKIP_ES_REVIEW_PLAYWRIGHT=1` を wrapper が付与）。ストリーム E2E が必要なときは `bash scripts/ci/run-ai-live.sh --suite <smoke|extended> --feature es-review` を単体で実行する。
- **conversation 3機能** + `SUITE=extended`: `LIVE_AI_CONVERSATION_BLOCKING_FAILURES=0` により、Playwright の exit は `failureKind` が `auth` / `cleanup` / `timeout` / `infra` のときに限定し、`state` や `quality` は JSON/MD に記録するだけとする（`smoke` のローカル一括は従来どおり厳格）。

## 3. Report

公開用 artifact は 1 本で、その中身は `7 JSON + 1 Markdown` の 8 ファイルのみ。

- `ai-live-summary.md`
- `live_es_review_*.json`
- `live_company_info_search_<suite>_*.json`
- `live_rag_ingest_*.json`
- `live_selection_schedule_*.json`
- `live_gakuchika_*.json`
- `live_motivation_*.json`
- `live_interview_*.json`

job 間受け渡しには internal artifact を使うが、朝に見る対象は上記の公開 artifact のみ。

`ai-live-issue-body.md` などの Markdown 副産物は artifact に含めず、`publish-live-report` job で JSON から再生成する。

Issue と summary では必ず次を分けて表示する。

- ES添削
- 企業情報検索
- 企業RAG取り込み
- 選考スケジュール取得
- ガクチカ作成
- 志望動機作成
- 面接対策

## 4. 手動実行

### 4-1. staging / nightly 相当の手動実行

全体:

```bash
bash scripts/ci/run-ai-live.sh --suite smoke --feature all
```

機能単位:

```bash
bash scripts/ci/run-ai-live.sh --suite smoke --feature es-review
bash scripts/ci/run-ai-live.sh --suite smoke --feature company-info-search
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

### 4-2. localhost / 6機能一括実行

ローカル開発中に `選考スケジュール取得` `企業RAG取り込み` `ガクチカ作成` `志望動機作成` `面接対策` `ES添削` の 6機能だけをまとめて回すときは、`make ai-live-local` を使う。`企業情報検索` はこの入口には含めない。実行順も上記のとおり（選考スケジュール → RAG → 会話3機能 → ES添削）。

**この入口では ES 添削の Playwright（ログイン〜ストリーム）は走らない。** 添削の実 API 検証は同バンドル内の `es-review-pytest` のみ。ブラウザ E2E が必要なときは `scripts/ci/run-ai-live.sh --feature es-review` を別途実行する（手動で同スクリプトを使うときに Playwright も省略したい場合は `export AI_LIVE_SKIP_ES_REVIEW_PLAYWRIGHT=1`）。

```bash
make ai-live-local
make ai-live-local SUITE=smoke
```

- 既定 suite: `extended`
- 実行対象 URL: Next は `http://localhost:3000` 〜 `3010` のうち、ルートが HTTP で応答する最初のものを再利用し、見つからない場合のみ空いているポートで `next dev` を起動する。FastAPI は既定で `http://localhost:8000/health` が応答すれば再利用し、応答しない場合のみ起動する。Next の URL を明示したいときは `AI_LIVE_LOCAL_BASE_URL`（例 `http://localhost:3000`）。FastAPI のヘルス URL を変えたいときは `AI_LIVE_LOCAL_FASTAPI_HEALTH_URL`。
- `make ai-live-local` は**別ターミナルで動いている** `next dev` / `uvicorn` を停止しない（常時起動の開発サーバーと共存する）。ポートやプロセスの掃除が必要なら手動で止める。
- 既存の FastAPI を再利用しているとき、ガクチカ Live 向けの緩和 env（`GAKUCHIKA_MIN_USER_ANSWERS_FOR_ES_DRAFT_READY` / `AI_LIVE_LOCAL_RELAX_GAKUCHIKA_GATES`）は **スクリプトが新規起動した uvicorn にだけ** 付く。手元の uvicorn にも効かせる場合は `backend/.env` などに書くか、起動前に `export` してから `uvicorn` を起動する。
- state reset 対象: ローカル DB 上の CI E2E test user のみ
- 出力先既定: `backend/tests/output/local_ai_live/<suite>_<timestamp>/`
- feature ごとの正本 bundle（`make ai-live-local` の実行順に合わせた列挙）:
  - `live_selection_schedule_*.json`, `live_selection_schedule_*.md`
  - `live_rag_ingest_*.json`, `live_rag_ingest_*.md`
  - `live_gakuchika_*.json`, `live_gakuchika_*.md`
  - `live_motivation_*.json`, `live_motivation_*.md`
  - `live_interview_*.json`, `live_interview_*.md`
  - `live_es_review_*.json`, `live_es_review_*.md`
- 集約出力:
  - `ai-live-summary.md`
  - `ai-live-summary.json`
  - `ai-live-issue-body.md`

wrapper は必要なときだけ `npm run dev` と FastAPI（`tools/start-fastapi-playwright.sh` 相当の `uvicorn`）を起動し、既に応答する Next / FastAPI があればそのまま再利用する。`scripts/ci/check-ai-live-auth.mjs` は実際に採用した `--base-url` で 1 回だけ通したあと、stateful 4機能の直前に `scripts/ci/reset-ai-live-state.mjs` を実行する。途中で feature が失敗しても残りは継続し、最後に summary を必ず生成する。
`CI_E2E_AUTH_SECRET` が未設定なら wrapper が一時 secret を生成して local test auth route を有効化する。**既に別ターミナルで Next を起動している場合**は、そのプロセスが読み込んだ secret と wrapper が渡す secret が一致しないと preflight が失敗しうる。常時 `npm run dev` する運用では `.env.local` などで `CI_E2E_AUTH_SECRET` を固定して揃える。`DATABASE_URL` が `localhost` / `127.0.0.1` 向けなのに DB 未起動なら、wrapper は `make db-up` を 1 回だけ試みる。

ローカル実行前提の必須 env / service:

- `BETTER_AUTH_SECRET`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY`
- `DATABASE_URL`

### 4-3. 会話3機能の extended ケースとモデル行列（ローカル）

- ケース定義: `tests/ai_eval/gakuchika_cases.json`, `motivation_cases.json`, `interview_cases.json`（`suiteDepth: "extended"` が extended スイートでのみ実行される）。
- 任意フィールド（決定論チェック）: `expectedForbiddenTokens`, `requiredQuestionTokenGroups`, `minDraftCharCount` / `maxDraftCharCount`（ガクチカ・志望動機）、`draftCharLimit`（志望動機の生成ドラフト上限）、面接フィードバック向け `minFeedbackCharCount` / `maxFeedbackCharCount`。
- 任意 LLM judge（OpenAI）: `OPENAI_API_KEY` と `LIVE_AI_CONVERSATION_LLM_JUDGE=1`。モデルは `LIVE_AI_CONVERSATION_LLM_JUDGE_MODEL`（既定 `gpt-4o-mini`）。ブロック失敗にしたい場合のみ `LIVE_AI_CONVERSATION_LLM_JUDGE_BLOCKING=1`。
- **`suite=extended` かつ `OPENAI_API_KEY` が設定されているとき**、`run-ai-live.sh` と `make ai-live-local` が **`LIVE_AI_CONVERSATION_LLM_JUDGE=1` を既定付与**する（ES 添削 extended の judge 既定に近い）。オフにするには `export LIVE_AI_CONVERSATION_LLM_JUDGE=0`。
- **`make ai-live-local` + `SUITE=extended` のときだけ**付与されるローカル用の会話フラグ（`run-ai-live.sh --suite extended` では judge 既定のみ共通で、下記 2 つはローカル wrapper 専用）:
  - `LIVE_AI_CONVERSATION_BLOCKING_FAILURES=0` … `failureKind` が `auth` / `cleanup` / `timeout` / `infra` のときだけ Playwright を失敗扱いにし、それ以外（`state` / `quality` など）は JSON/MD に記録のみ。
  - `LIVE_AI_CONVERSATION_MD_INCLUDE_TRANSCRIPT=1` … **severity が `failed` の行**に、会話ログ末尾を Markdown レポートへ追記（長さは `LIVE_AI_CONVERSATION_MD_TRANSCRIPT_MAX_TURNS` 既定 8、`LIVE_AI_CONVERSATION_MD_TRANSCRIPT_MAX_CHARS` 既定 12000 で上限）。
- FastAPI の会話系モデルは **プロセス起動時**に読み込まれる。ES 添削の多モデル行列に寄せるには、エイリアス（例: `gpt-mini`, `claude-sonnet`, `gemini`, `gpt-nano`）ごとに **FastAPI を再起動**し、同じ Playwright スイートを繰り返す。

```bash
# Next + FastAPI が既に起動している前提（PLAYWRIGHT_SKIP_WEBSERVER=1）
bash scripts/dev/run-live-conversations-model-matrix.sh
```

複数ランの `live_gakuchika_*.json` などを1本にまとめる例:

```bash
node scripts/ci/merge-live-conversation-reports.mjs /tmp/merged_gakuchika.json \
  runA=gpt-mini/backend/tests/output/.../live_gakuchika_extended_20260101T000000Z.json \
  runB=claude/backend/tests/output/.../live_gakuchika_extended_20260101T010000Z.json
```

（`runA=` のパスはシェルで実パスに置き換える。glob は手動で展開する。）

よくある失敗:

- `BETTER_AUTH_SECRET` 未設定で local test auth route が 404 になる
- ローカル DB 未起動で auth preflight / state reset が失敗する
- FastAPI 起動失敗で `http://localhost:8000/health` が ready にならない
- LLM key 不足で ES review / company info live report が skip または fail になる

## 5. 朝の確認手順

1. GitHub Issue `AI Live Daily Report YYYY-MM-DD` を開く
2. `今日やること` を見て、優先度が高い feature から着手する
3. feature セクションで `主な原因` `改善提案` `failed/degraded case` を確認する
4. 必要なら Issue 内の run URL から GitHub Actions に入り、artifact を開く
5. 公開 artifact 内の `ai-live-summary.md` と 7 feature JSON を確認し、feature report の deterministic fail、judge reason、cleanup 状態を追う

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

## 8. localhost 実行後のログの見方（切り分け）

`make ai-live-local` の出力ルート（例: `backend/tests/output/local_ai_live/<suite>_<timestamp>/`）を基準にする。

| 目的 | 参照先 |
|------|--------|
| Next の 5xx・スタック | 同階層の `next-dev.log` |
| 会話・企業情報 API・RAG クロール | 同階層の `fastapi.log` |
| 認証 preflight | `auth-preflight.log` |
| 機能ごとのコマンド出力 | `_feature_runs/<feature>/ai_live_*/` 以下の `*-pytest.log` / `*-playwright.log` |
| 集約サマリ | `summary.log`（人間向けテキスト）、`ai-live-summary.md` / `ai-live-summary.json`（生成されていれば） |
| ケース別の決定論・judge | 同ルートにコピーされた `live_*.json` と `live_*.md` |

RAG / 選考スケジュールの失敗は多くの場合 `crawl_failure`・`deadline_missing` など reason が JSON に載るため、まず `live_rag_ingest_*.json` / `live_selection_schedule_*.json` の `deterministicFailReasons` と `checks` を確認し、必要なら `fastapi.log` の同一時刻付近を追う。

## 9. 改善提案の考え方

Issue には feature ごとに自動の改善提案を入れる。

- `ES添削`: 文字数制御、grounding、judge 低評価
- `企業情報検索`: 公式サイト到達率、metadata 精度、検索実行エラー
- `企業RAG取り込み`: crawl 失敗、embedding/store 失敗、cleanup 失敗
- `選考スケジュール取得`: deadline 未抽出、date parse、confidence/source follow
- `ガクチカ作成`: 深掘り不足、要約/ES draft 反映不足
- `志望動機作成`: 企業理解不足、経験接続不足、差別化不足
- `面接対策`: 追質問不足、feedback の具体性不足

v1 は deterministic / heuristic 集約が正本。LLM に全面依存しないため、夜間実行が不安定でも翌朝の Issue は残る。
