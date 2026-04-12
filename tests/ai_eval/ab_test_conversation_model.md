# 会話モデル A/B テスト: GPT-5.4 mini vs Claude Haiku 4.5

## 概要

ガクチカ作成・志望動機作成・面接対策の 3 つの会話機能で使用する LLM を GPT-5.4 mini（現行）から Claude Haiku 4.5 に変更するか判断するため、ローカル環境で品質比較テストを実施する。

### 評価対象の限定

本テストは**会話パート（Q&A の質問生成・深掘り）のみ**を評価する。

各機能の処理フローには「会話モデル」と「生成モデル」の 2 段階がある:
- **会話モデル** (`MODEL_GAKUCHIKA` / `MODEL_MOTIVATION` / `MODEL_INTERVIEW`): ユーザーとの Q&A で質問を生成し深掘りする → **本テストの比較対象**
- **生成モデル** (`MODEL_GAKUCHIKA_DRAFT` / `MODEL_MOTIVATION_DRAFT` / `MODEL_INTERVIEW_FEEDBACK`): 会話終了後に ES 下書き / 志望動機ドラフト / 面接フィードバックを生成する → **両条件で固定 (claude-sonnet)**

そのため LLM Judge の `output_quality` スコアや `finalText` の文字数は、会話モデルの違いではなく生成モデル（固定）の出力を評価している。これらは参考値として扱い、判定には使用しない。

### コスト背景

| モデル | Input 単価 | Output 単価 | 1cr あたりコスト |
|--------|-----------|------------|-----------------|
| GPT-5.4 mini | ¥120/1M tok | ¥720/1M tok | ~¥0.6 |
| Claude Haiku 4.5 | ¥160/1M tok | ¥800/1M tok | ~¥0.74 |

Claude Haiku はコスト ~23% 増。品質改善がコスト増に見合うかを判定する。

---

## 制御変数

| 変数 | ベースライン | チャレンジャー | 備考 |
|------|-------------|---------------|------|
| `MODEL_GAKUCHIKA` | `gpt-mini` | `claude-haiku` | **比較対象** |
| `MODEL_MOTIVATION` | `gpt-mini` | `claude-haiku` | **比較対象** |
| `MODEL_INTERVIEW` | `gpt-mini` | `claude-haiku` | **比較対象** |
| `MODEL_GAKUCHIKA_DRAFT` | `claude-sonnet` | `claude-sonnet` | 固定（ES 下書き生成） |
| `MODEL_MOTIVATION_DRAFT` | `claude-sonnet` | `claude-sonnet` | 固定（志望動機ドラフト生成） |
| `MODEL_INTERVIEW_FEEDBACK` | `claude-sonnet` | `claude-sonnet` | 固定（面接フィードバック生成） |
| LLM Judge model | `gpt-4o-mini` | `gpt-4o-mini` | 固定（評価者モデル） |
| テストケース | extended 全件 | extended 全件 | 固定（smoke + extended） |

---

## Step 1: 環境準備

### チェックリスト

- [ ] Next.js 開発サーバーが起動している (`npm run dev`)
- [ ] 認証が設定されている（以下いずれか）:
  - `CI_E2E_AUTH_SECRET` 環境変数が設定済み（`e2e/google-auth.ts:4`）
  - `PLAYWRIGHT_AUTH_STATE` で認証済み storageState ファイルパスを指定（`e2e/google-auth.ts:6`）
- [ ] `OPENAI_API_KEY` が設定されている（GPT-5.4 mini テスト対象 + LLM Judge 用）
- [ ] `ANTHROPIC_API_KEY` が設定されている（Claude Haiku テスト用）
- [ ] Playwright がインストール済み (`npx playwright install`)
- [ ] FastAPI の venv が構築済み (`backend/.venv/`)

### FastAPI モデルキャッシュの注意

モデル設定は FastAPI プロセス起動時にキャッシュされ、実行中は変更されない。

```
環境変数 (MODEL_GAKUCHIKA 等)
  → backend/app/config.py:173-175 (settings)
  → backend/app/utils/llm_model_routing.py:19-33 (_build_model_config)
  → backend/app/utils/llm_model_routing.py:36-42 (get_model_config — singleton キャッシュ)
  → backend/app/utils/llm_client_registry.py:89 (model_config フィールド)
```

**環境変数を変更したら、必ず FastAPI プロセスを再起動する。** 再起動しないと前のモデル設定のまま動き、A/B が無効になる。

### Playwright webServer 制御

`playwright.config.ts:4,26` では `PLAYWRIGHT_SKIP_WEBSERVER=1` が未設定だと Playwright が自動で `npm run dev` を起動/再利用する。本テストでは FastAPI を手動で制御するため、混線防止のために `PLAYWRIGHT_SKIP_WEBSERVER=1` を必ず指定する。

---

## Step 2: ベースライン実行 (GPT-5.4 mini)

### 2a. FastAPI を停止（起動中の場合）

```bash
make down
# Makefile:189 — pkill -f "uvicorn app.main:app"
```

### 2b. GPT-5.4 mini モデルで FastAPI を起動

```bash
MODEL_GAKUCHIKA=gpt-mini \
MODEL_MOTIVATION=gpt-mini \
MODEL_INTERVIEW=gpt-mini \
  cd backend && uvicorn app.main:app --reload --port 8000
```

起動ログで `MODEL_GAKUCHIKA=gpt-mini` 等が読み込まれていることを確認する。

### 2c. テスト実行（別ターミナル、repo root から）

```bash
AI_LIVE_SUITE=extended \
LIVE_AI_CONVERSATION_TARGET_ENV=local \
LIVE_AI_CONVERSATION_LLM_JUDGE=1 \
LIVE_AI_CONVERSATION_LLM_JUDGE_MODEL=gpt-4o-mini \
LIVE_AI_CONVERSATION_BLOCKING_FAILURES=0 \
PLAYWRIGHT_SKIP_WEBSERVER=1 \
AI_LIVE_OUTPUT_DIR=backend/tests/output/ab_baseline_gpt_mini \
npx playwright test e2e/live-ai-conversations.spec.ts
```

### 期待される出力

`backend/tests/output/ab_baseline_gpt_mini/` に以下が生成される:
- `live_gakuchika_extended_*.json` + `.md`
- `live_motivation_extended_*.json` + `.md`
- `live_interview_extended_*.json` + `.md`

---

## Step 3: チャレンジャー実行 (Claude Haiku 4.5)

### 3a. FastAPI を停止

```bash
make down
```

### 3b. Claude Haiku モデルで FastAPI を起動

```bash
MODEL_GAKUCHIKA=claude-haiku \
MODEL_MOTIVATION=claude-haiku \
MODEL_INTERVIEW=claude-haiku \
  cd backend && uvicorn app.main:app --reload --port 8000
```

起動ログで `MODEL_GAKUCHIKA=claude-haiku` 等が読み込まれていることを確認する。

### 3c. テスト実行（別ターミナル、repo root から）

```bash
AI_LIVE_SUITE=extended \
LIVE_AI_CONVERSATION_TARGET_ENV=local \
LIVE_AI_CONVERSATION_LLM_JUDGE=1 \
LIVE_AI_CONVERSATION_LLM_JUDGE_MODEL=gpt-4o-mini \
LIVE_AI_CONVERSATION_BLOCKING_FAILURES=0 \
PLAYWRIGHT_SKIP_WEBSERVER=1 \
AI_LIVE_OUTPUT_DIR=backend/tests/output/ab_challenger_claude_haiku \
npx playwright test e2e/live-ai-conversations.spec.ts
```

### 期待される出力

`backend/tests/output/ab_challenger_claude_haiku/` に同構造のファイルが生成される。

### 代替: model matrix スクリプト

`scripts/dev/run-live-conversations-model-matrix.sh` で複数モデルを連続実行可能。ただし FastAPI の自動再起動は行わない（スクリプト L31 に注意書きあり）。

```bash
MODEL_MATRIX_MODELS="gpt-mini claude-haiku" \
MODEL_MATRIX_OUT_ROOT=backend/tests/output/ab_test_$(date -u +%Y%m%dT%H%M%SZ) \
PLAYWRIGHT_SKIP_WEBSERVER=1 \
LIVE_AI_CONVERSATION_LLM_JUDGE=1 \
LIVE_AI_CONVERSATION_LLM_JUDGE_MODEL=gpt-4o-mini \
LIVE_AI_CONVERSATION_BLOCKING_FAILURES=0 \
  bash scripts/dev/run-live-conversations-model-matrix.sh
```

**注意**: 各モデル間で FastAPI を手動再起動する必要がある。

---

## Step 4: レポート収集

### データソース

**JSON ファイルが正本**。feature ごとに 3 本出力される（`live-ai-conversation-report.ts:339`）。

```
backend/tests/output/ab_baseline_gpt_mini/
  live_gakuchika_extended_*.json
  live_motivation_extended_*.json
  live_interview_extended_*.json

backend/tests/output/ab_challenger_claude_haiku/
  live_gakuchika_extended_*.json
  live_motivation_extended_*.json
  live_interview_extended_*.json
```

Markdown レポートのトランスクリプトは `severity=failed` の末尾ターンのみ（`live-ai-conversation-report.ts:201`）なので、分析には JSON を使う。

### JSON スキーマ（分析に必要なフィールド）

```typescript
// 各 JSON の構造: LiveAiConversationReport
{
  reportType: "gakuchika" | "motivation" | "interview",
  rows: LiveAiConversationReportRow[]
}

// 各 row の構造
{
  feature: string,
  caseId: string,
  title: string,
  status: "passed" | "failed" | "skipped",
  severity: "passed" | "degraded" | "failed",
  durationMs: number,
  transcript: { role: "user" | "assistant", content: string }[],
  outputs: { finalText: string, generatedDocumentId: string | null },
  checks: { name: string, passed: boolean, evidence: string[] }[],
  judge: {
    enabled: boolean,
    model: string,
    overallPass: boolean,
    blocking: boolean,
    scores: {
      questionFit: number,    // 1-5
      depth: number,          // 1-5
      companyContext: number,  // 1-5
      outputQuality: number,  // 1-5
      naturalness: number,    // 1-5
    },
    warnings: string[],
    reasons: string[],
  } | null,
}
```

---

## Step 5: 分析手順

以下の手順で JSON レポートを読み、比較テーブルを作成する。

### 5a. JSON 読み込み

両ディレクトリから feature ごとの JSON を Read し、`.rows[]` を取得する。

```
baseline_gakuchika = Read("backend/tests/output/ab_baseline_gpt_mini/live_gakuchika_extended_*.json").rows
baseline_motivation = Read("...ab_baseline_gpt_mini/live_motivation_extended_*.json").rows
baseline_interview = Read("...ab_baseline_gpt_mini/live_interview_extended_*.json").rows

challenger_gakuchika = Read("...ab_challenger_claude_haiku/live_gakuchika_extended_*.json").rows
challenger_motivation = Read("...ab_challenger_claude_haiku/live_motivation_extended_*.json").rows
challenger_interview = Read("...ab_challenger_claude_haiku/live_interview_extended_*.json").rows
```

### 5b. 主要 KPI テーブル生成

機能別 x ケース別 x モデル別で以下の KPI を並べる:

#### 主要 KPI（判定に使用）

| KPI | 抽出方法 | 適用機能 |
|-----|---------|----------|
| naturalness (1-5) | `row.judge.scores.naturalness` | 全機能 |
| question_fit (1-5) | `row.judge.scores.questionFit` | 全機能 |
| depth (1-5) | `row.judge.scores.depth` | 全機能 |
| company_context (1-5) | `row.judge.scores.companyContext` | **motivation, interview のみ** |
| assistant 発話数 | `row.transcript.filter(t => t.role === "assistant").length` | 全機能 |
| overallPass rate | feature 内 `judge.overallPass === true` 件数 / 全件数 | 全機能 |
| 会話系チェック pass 率 | `row.checks.filter(c => c.name.startsWith("question-")).filter(c => c.passed).length` / 該当 checks 数 | 全機能 |

**company_context のガクチカ除外**: ガクチカのケース定義には企業情報が存在しない。LLM Judge はガクチカにも company_context を採点するが、ノイズになるため集計から除外し、参考値として別記する。

**assistant 発話数**: `row.transcript` は user と assistant の全発話配列。`transcript.length` は発話数（ターン数ではない）。assistant 発話数 = `transcript.filter(t => t.role === "assistant").length` で「モデルが何回質問/応答したか」を比較する。

**会話系チェック限定**: `row.checks` には `cleanup`, `draft-generated`, `summary-token-coverage`, `min-draft-chars` など最終生成物寄りの項目も含まれる。会話モデル比較では `question-token-coverage`, `required-question-token-groups` など名前が `question-` で始まるチェックのみを集計する。

#### 参考 KPI（判定には使用しない）

| KPI | 理由 |
|-----|------|
| output_quality (1-5) | 最終生成物は claude-sonnet 固定のため会話モデル差を反映しない |
| finalText 文字数 | 同上 |
| 所要時間 (ms) | 会話+生成の合計であり分離困難 |
| company_context (gakuchika) | ガクチカに企業情報がないためノイズ |

### 5c. 比較テーブルのフォーマット

```
## ガクチカ (gakuchika)

| caseId | model | naturalness | question_fit | depth | assistant発話数 | overallPass |
|--------|-------|-------------|--------------|-------|----------------|-------------|
| gakuchika_scope_and_role | gpt-mini | ? | ? | ? | ? | ? |
| gakuchika_scope_and_role | claude-haiku | ? | ? | ? | ? | ? |
| ... | ... | ... | ... | ... | ... | ... |
| **平均** | **gpt-mini** | ? | ? | ? | ? | ?/? |
| **平均** | **claude-haiku** | ? | ? | ? | ? | ?/? |
| **差分** | **haiku - mini** | ? | ? | ? | ? | ? |

## 志望動機 (motivation)
(同構造 + company_context 列を追加)

## 面接 (interview)
(同構造 + company_context 列を追加)
```

### 5d. ターン別トランスクリプト比較

同一ケースの同一ターンを横並びで比較し、以下の観点で定性分析する:

1. **質問の自然さ**: 就活生に対するプロのキャリアアドバイザーとして自然な日本語か
2. **深掘りの質**: 表面的な質問ではなく、候補者の経験の核心に迫れているか
3. **文脈の一貫性**: 前のターンの回答を踏まえた質問になっているか
4. **不自然な表現**: AI っぽい定型文や不自然な敬語がないか

```
## ケース: gakuchika_scope_and_role — ターン別比較

### Turn 1 (assistant)
- GPT-5.4 mini: 「...」
- Claude Haiku: 「...」
- 所見: (自然さ・深掘りの違い)

### Turn 2 (user → assistant)
- ユーザー回答: 「...」
- GPT-5.4 mini の応答: 「...」
- Claude Haiku の応答: 「...」
- 所見: (文脈反映の違い)
```

### 5e. 機能別サマリ

```
## 機能別サマリ

| 機能 | KPI | GPT-5.4 mini 平均 | Claude Haiku 平均 | 差分 | 判定 |
|------|-----|-------------------|-------------------|------|------|
| gakuchika | naturalness | ? | ? | ? | |
| gakuchika | question_fit | ? | ? | ? | |
| gakuchika | depth | ? | ? | ? | |
| motivation | naturalness | ? | ? | ? | |
| motivation | question_fit | ? | ? | ? | |
| motivation | depth | ? | ? | ? | |
| motivation | company_context | ? | ? | ? | |
| interview | naturalness | ? | ? | ? | |
| interview | question_fit | ? | ? | ? | |
| interview | depth | ? | ? | ? | |
| interview | company_context | ? | ? | ? | |
```

---

## Step 6: 判定基準と推奨アクション

### 判定基準

| 判定 | 条件 |
|------|------|
| **Claude Haiku 全面採用** | naturalness, question_fit, depth の機能別平均が全機能で +0.5 以上改善、かつ overallPass rate が低下しない、かつ company_context（motivation/interview）が劣化しない |
| **機能別部分採用** | 特定機能のみ上記条件を満たし、他機能は同等（例: ガクチカのみ claude-haiku、他は gpt-mini） |
| **現状維持 (GPT-5.4 mini)** | 主要 KPI の差が < +0.5、または overallPass rate が低下、または company_context が有意に劣化 |

### 推奨アクション

判定後に取るべきアクション:

1. **Claude Haiku 採用の場合**: `backend/app/config.py` の `model_gakuchika` / `model_motivation` / `model_interview` のデフォルト値を `claude-haiku` に変更。`docs/features/CREDITS.md` のコスト前提を ¥0.74/cr に更新。
2. **機能別部分採用の場合**: 該当機能のみモデル変更。非該当機能は `gpt-mini` を維持。
3. **現状維持の場合**: 変更なし。レポートをアーカイブして判断根拠を残す。

---

## Appendix A: テストケース一覧

`AI_LIVE_SUITE=extended` は smoke + extended の全件を実行する（`live-ai-conversations.spec.ts:164-169`）。

### ガクチカ (6 ケース)

| ID | suiteDepth | タイトル |
|----|-----------|---------|
| `gakuchika_scope_and_role` | smoke | 塾講師のアルバイトで校舎改善を進めた経験 |
| `gakuchika_process_over_result` | extended | イベント運営で仕組み化を進めた経験 |
| `gakuchika_retail_shift_coordination` | extended | 小売アルバイトでシフトと在庫の連携を改善 |
| `gakuchika_engineering_team_latency` | extended | 開発サークルでレビュー遅延を減らした経験 |
| `gakuchika_volunteer_outreach` | extended | 地域ボランティアで参加者獲得を改善 |
| `gakuchika_research_lab_reproducibility` | extended | 研究室で再現実験の手順を整備した経験 |

### 志望動機 (6 ケース)

| ID | suiteDepth | タイトル | 企業名 | 業界 |
|----|-----------|---------|--------|------|
| `motivation_company_reason` | smoke | DX 推進の会社で企画職を志望 | 株式会社テストDX | IT・通信 |
| `motivation_differentiation_and_fit` | extended | 同業比較で第一志望を説明 | 株式会社テスト商事 | 商社 |
| `motivation_manufacturer_quality` | extended | メーカーで製造現場と企画の橋渡し | 株式会社テスト電機 | メーカー |
| `motivation_bank_corporate_banking` | extended | 銀行の法人営業志望で顧客接点を説明 | 株式会社テスト銀行 | 銀行 |
| `motivation_consulting_generalist` | extended | コンサルで仮説検証型の働き方を志望 | 株式会社テストコンサル | コンサルティング |
| `motivation_retail_omni_channel` | extended | 小売で店舗とECの連携企画を志望 | 株式会社テストリテール | 小売・流通 |

### 面接 (6 ケース)

| ID | suiteDepth | タイトル | 企業名 | 業界 |
|----|-----------|---------|--------|------|
| `interview_company_fit_and_depth` | smoke | 企業理解と経験接続を順に深掘り | 株式会社テストDX | IT・通信 |
| `interview_question_flow_to_feedback` | extended | 比較検討と入社後の解像度を深める | 株式会社テスト商事 | 商社 |
| `interview_manufacturer_handoff` | extended | メーカーで現場と企画の接続を説明 | 株式会社テスト電機 | メーカー |
| `interview_bank_client_trust` | extended | 銀行で顧客信頼とリスク感覚を説明 | 株式会社テスト銀行 | 銀行 |
| `interview_consulting_hypothesis` | extended | コンサルで仮説思考を面接で説明 | 株式会社テストコンサル | コンサルティング |
| `interview_retail_omni` | extended | 小売でオムニチャネル視点を説明 | 株式会社テストリテール | 小売・流通 |

---

## Appendix B: モデルアーキテクチャ

### 会話モデルと生成モデルの関係

```
ユーザー入力
  │
  ├─ ガクチカ会話 ───→ MODEL_GAKUCHIKA (gpt-mini or claude-haiku) ← 比較対象
  │   └─ 下書き生成 ─→ MODEL_GAKUCHIKA_DRAFT (claude-sonnet 固定)
  │
  ├─ 志望動機会話 ──→ MODEL_MOTIVATION (gpt-mini or claude-haiku) ← 比較対象
  │   └─ ドラフト生成 → MODEL_MOTIVATION_DRAFT (claude-sonnet 固定)
  │
  └─ 面接対策会話 ──→ MODEL_INTERVIEW (gpt-mini or claude-haiku) ← 比較対象
      └─ FB 生成 ───→ MODEL_INTERVIEW_FEEDBACK (claude-sonnet 固定)
```

### モデルキャッシュ機構

```
1. FastAPI 起動
2. 初回リクエスト → get_model_config() 呼出
3. _build_model_config() で settings から MODEL_* を読み取り
4. llm_client_registry の model_config フィールドにキャッシュ
5. 以降のリクエストはキャッシュから返す → 環境変数変更は反映されない
6. ∴ モデル変更時は FastAPI 再起動が必須
```

ファイル参照:
- `backend/app/config.py:173-175` — モデル設定のデフォルト値
- `backend/app/utils/llm_model_routing.py:19-33` — `_build_model_config()`
- `backend/app/utils/llm_model_routing.py:36-42` — `get_model_config()` (singleton)
- `backend/app/utils/llm_model_routing.py:108-109` — `claude-haiku` alias 解決
- `backend/app/utils/llm_client_registry.py:89` — `model_config` キャッシュフィールド
