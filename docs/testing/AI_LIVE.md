# AI Live

実 API を使って `ES添削` `ガクチカ作成` `志望動機作成` `面接対策` を定時実行で検証し、翌朝に GitHub Issue を見れば改善着手できる状態を作る運用の説明です。

- workflow 名: `AI Live`
- 正本環境: `staging`
- 毎日 23:00 JST: `smoke`
- 毎週日曜 23:30 JST: `extended`
- 朝の確認先: GitHub Issue `AI Live Daily Report YYYY-MM-DD`

## 1. Job 構成

- `es-review-live`: live ES review の `pytest` と ES review stream の Playwright
- `gakuchika-live`: ガクチカ作成の live conversation
- `motivation-live`: 志望動機作成の live conversation
- `interview-live`: 面接対策の live conversation
- `compile-live-report`: 上記 artifact を集約して GitHub summary を生成
- `publish-live-report`: 朝に見る GitHub Issue を create/update する

## 2. 判定

- `failed`: API 失敗、stream 不完走、必須トークン未達、生成物未作成、cleanup 失敗
- `degraded`: judge が「深掘り不足」「要点反映不足」などを検知したが hard failure ではない
- `passed`: hard fail も degraded もない

conversation 系では `status` と `severity` を分ける。

- `status`: Playwright ケース自体の完走状態
- `severity`: 朝の運用で見る品質状態

## 3. Report

feature ごとに別 report を出力する。

- `live_es_review_*.json/md`
- `live_gakuchika_*.json/md`
- `live_motivation_*.json/md`
- `live_interview_*.json/md`

集約 job はこれらをまとめて次を生成する。

- `ai-live-summary.md/json`
- `ai-live-recommendations.json`
- `ai-live-issue-body.md`

Issue と summary では必ず次を分けて表示する。

- ES添削
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
bash scripts/ci/run-ai-live.sh --suite smoke --feature gakuchika
bash scripts/ci/run-ai-live.sh --suite smoke --feature motivation
bash scripts/ci/run-ai-live.sh --suite smoke --feature interview
bash scripts/ci/run-ai-live.sh --suite smoke --feature es-review
```

## 5. 朝の確認手順

1. GitHub Issue `AI Live Daily Report YYYY-MM-DD` を開く
2. `今日やること` を見て、優先度が高い feature から着手する
3. feature セクションで `主な原因` `改善提案` `failed/degraded case` を確認する
4. 必要なら Issue 内の run URL から GitHub Actions に入り、artifact を開く
5. feature report の JSON/Markdown で transcript 抜粋、deterministic fail、judge reason、cleanup 状態を確認する

## 6. 改善提案の考え方

Issue には feature ごとに自動の改善提案を入れる。

- `ES添削`: 文字数制御、grounding、judge 低評価
- `ガクチカ作成`: 深掘り不足、要約/ES draft 反映不足
- `志望動機作成`: 企業理解不足、経験接続不足、差別化不足
- `面接対策`: 追質問不足、feedback の具体性不足

v1 は deterministic / heuristic 集約が正本。LLM に全面依存しないため、夜間実行が不安定でも翌朝の Issue は残る。
