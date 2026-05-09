# 面接対策（企業特化模擬面接）

## 1. 概要

面接対策は、企業・職種に特化した模擬面接を AI と実施し、coverageState による論点網羅判定と 7 軸スコアリングの最終講評を得られるストリーミング機能。setup-first UI で面接方式・選考段階・面接官タイプ・厳しさを確定し、plan -> opening -> turns -> feedback の一連の流れを SSE で段階的に返す。最終講評後は最弱回答を書き直して再採点する Weakness Drill を利用できる。

- **対応モデル**: 面接計画は `MODEL_INTERVIEW_PLAN=gpt`（GPT-5.4）、質問生成は `MODEL_INTERVIEW=claude-haiku`（Claude Haiku 4.5）、最終講評は `MODEL_INTERVIEW_FEEDBACK=claude-sonnet`（Claude Sonnet 4.6）
- **プロトコル**: SSE (Server-Sent Events) によるリアルタイムストリーミング。Drill は非 SSE（単発 JSON POST）
- **認証**: ログインユーザー専用（ゲストは開始・進行・講評・満足度保存・ドリルのいずれも利用不可）
- **課金**: 成功時のみクレジット消費（Reserve -> Confirm/Cancel パターン）。Drill はクレジットを消費しない（`guardDailyTokenLimit` のみ適用）

---

## 2. アーキテクチャ

### 2.1 3層構成図

```
+------------------------------------------------------------+
|  Frontend (React)                                          |
|  InterviewPageContent -> setup-first card -> SSE 消費      |
|  useStreamingTextPlayback / DrillPanel / dashboard/        |
+----------------------------+-------------------------------+
                             | POST /api/companies/[id]/interview/{start,stream,...}
+----------------------------v-------------------------------+
|  BFF (Next.js API Route)                                   |
|  認証検証 -> クレジット予約 -> ペイロード構築 -> SSE 中継     |
|  start/route.ts / stream/route.ts / drill/start/route.ts   |
+----------------------------+-------------------------------+
                             | POST /api/interview/{start,turn,continue,feedback,drill/*}
+----------------------------v-------------------------------+
|  Backend (FastAPI)                                          |
|  入力防御 -> plan 生成 -> 質問生成/講評 -> SSE / JSON 返却   |
|  _interview/ subpackage (6 モジュール) + interview.py facade |
+------------------------------------------------------------+
```

### 2.2 バックエンドモジュール構成（`_interview/` subpackage）

`backend/app/routers/_interview/` は依存方向を一方向に保つ 6 モジュール構成。facade（`interview.py`）が全シンボルを re-export する。

```
contracts <- setup <- planning <- prompting <- generators <- endpoints
                                                              |
                                                         interview.py (facade)
```

- **contracts**: Pydantic モデル、JSON Schema、allowed-value set、prompt テンプレート骨格、Drill 型定義
- **setup**: リクエスト正規化、`_build_setup()` による canonical setup dict 構築、role track 推定
- **planning**: coverageState 構築・マージ、checklist catalog、feedback enrichment、answer_gap 判定、CaseBrief プリセット、short_coaching fallback
- **prompting**: `_build_*_prompt()` 関数群。behavioral_block 選択と token budget 最適化
- **generators**: SSE 生成 4 関数 + LLM ストリーミングオーケストレータ
- **endpoints**: FastAPI ルートハンドラ。sanitize -> generator 呼び出し -> SseLease 管理。Drill の非 SSE ハンドラも含む

### 2.3 主要ファイル配置テーブル

| 層 | パス | 責務 |
|---|---|---|
| Page | `src/app/(product)/companies/[id]/interview/page.tsx` | SSR + ドキュメント取得 |
| Main UI | `src/components/interview/InterviewPageContent.tsx` | setup-first + 会話 + 講評 |
| Drill UI | `src/components/interview/DrillPanel.tsx` | 4 ステップ Drill stepper |
| Dashboard | `src/components/interview/dashboard/` | Heatmap / TrendChart / RecurringIssues |
| Session | `src/lib/interview/session.ts` | setup 分類、turnState 初期化、stageStatus |
| Conversation | `src/lib/interview/conversation.ts` | 会話 reducer、メッセージ追加 |
| Reducers | `src/lib/interview/reducers.ts` | SSE event -> state 更新 |
| Dashboard Logic | `src/lib/interview/dashboard.ts` | 集計ロジック（heatmap、trend） |
| Client API | `src/lib/interview/client-api.ts` | `startInterviewDrill` / `scoreInterviewDrill` |
| Types | `src/lib/interview/types.ts` | 共通型定義 |
| UI Helpers | `src/lib/interview/ui.ts` | `labelTopic()` / progress narrative |
| Context Builder | `src/lib/interview/context-builder*.ts` | BFF hydration / loaders / setup / summaries |
| Company Seeds | `src/lib/interview/company-seeds.ts` | 業界・企業 seed 定義 |
| Persistence | `src/lib/interview/persistence*.ts` | DB 書き込み / エラー / feedback / turn-events |
| BFF GET | `src/app/api/companies/[id]/interview/route.ts` | hydrate 用エンドポイント |
| BFF Start | `src/app/api/companies/[id]/interview/start/route.ts` | 面接開始 + クレジット予約 |
| BFF Stream | `src/app/api/companies/[id]/interview/stream/route.ts` | 回答送信 + 次質問 |
| BFF Feedback | `src/app/api/companies/[id]/interview/feedback/route.ts` | 最終講評 |
| BFF Continue | `src/app/api/companies/[id]/interview/continue/route.ts` | 講評後の続き |
| BFF Reset | `src/app/api/companies/[id]/interview/reset/route.ts` | セッションリセット |
| BFF Satisfaction | `src/app/api/companies/[id]/interview/feedback/satisfaction/route.ts` | 満足度保存 |
| BFF Drill Start | `src/app/api/companies/[id]/interview/drill/start/route.ts` | Drill 開始 |
| BFF Drill Score | `src/app/api/companies/[id]/interview/drill/score/route.ts` | Drill 再採点 |
| BFF Shared | `src/app/api/companies/[id]/interview/index.ts` | 共通ヘルパ |
| BFF Stream Utils | `src/app/api/companies/[id]/interview/stream-utils.ts` | SSE 中継ユーティリティ |
| BFF Persistence Errors | `src/app/api/companies/[id]/interview/persistence-errors.ts` | persistence 障害判定 |
| Router Facade | `backend/app/routers/interview.py` | 全シンボル re-export facade |
| Contracts | `backend/app/routers/_interview/contracts.py` | 型・Schema・定数・テンプレート |
| Setup | `backend/app/routers/_interview/setup.py` | リクエスト正規化 |
| Planning | `backend/app/routers/_interview/planning.py` | 計画・coverage・feedback |
| Prompting | `backend/app/routers/_interview/prompting.py` | プロンプト構築 |
| Generators | `backend/app/routers/_interview/generators.py` | SSE 生成 |
| Endpoints | `backend/app/routers/_interview/endpoints.py` | ルートハンドラ |
| Prompts | `backend/app/prompts/interview_prompts.py` | 共通ルール・behavioral_block |
| Case Seeds | `backend/app/data/case_seeds/*.json` | CaseBrief プリセット JSON |
| 集客 LP | `src/app/(marketing)/ai-mensetsu/page.tsx` | AI 面接対策 LP |

### 2.4 SSE イベントプロトコル

FastAPI からの SSE を BFF が中継する。`string_chunk` はローカル蓄積のみ行い、`complete` イベント後に playback を開始する。

| イベント | 用途 | ペイロード例 |
|---|---|---|
| `progress` | 進捗更新 | `{step, progress, label}` |
| `string_chunk` | 質問/講評テキスト逐次送出 | `{path: "question", text}` |
| `field_complete` | 構造化フィールド確定 | `{path: "interview_plan"\|"scores"\|"premise_consistency", value}` |
| `complete` | 最終結果 | `{data: {question, turn_state, turn_meta, plan, ...}, internal_telemetry}` |
| `error` | エラー | `{message}` |

`/start` は plan(field_complete) + opening(string_chunk -> complete) を 1 ストリームで返す。plan は `stream_string_fields=[]` のため一括返却。質問テキストと `overall_comment` / `improved_answer` のみが `string_chunk` でストリーミングされる。

---

## 3. 面接方式と進行モデル

### 3.1 4 方式

同一機能内で次の 4 方式を扱う。`contracts.INTERVIEW_FORMATS` が SSOT。

| 方式 | 原則 | `formatPhase` |
|---|---|---|
| `standard_behavioral` | 1 問 1 論点で STAR 互換の深掘り | `standard_main` |
| `case` | 構造化、仮説、打ち手の優先順位を確認 | `case_main` -> `case_closing` |
| `technical` | 専門知識、設計判断、前提・トレードオフ・再現性 | `technical_main` |
| `life_history` | 転機、価値観、行動の一貫性と自己理解の深さ | `life_history_main` |

旧 `discussion` / `presentation` の DB 値は `_LEGACY_INTERVIEW_FORMAT_MAP` で `life_history` に正規化される。

### 3.2 coverageState と checklist catalog

`coverageState` は面接の進行状態を正本として管理する。`coveredTopics` は coverageState からの派生 read model であり、coverage 判定の正本には使わない。

各トピックは以下のフィールドを保持する:

| フィールド | 説明 |
|---|---|
| `topic` | 論点名 |
| `status` | `pending` / `active` / `covered` / `exhausted` |
| `requiredChecklist` | `_checklist_for_topic()` が setup に応じて生成する必須項目リスト |
| `passedChecklistKeys` | LLM 判定または deterministic 判定で通過したキー |
| `deterministicCoveragePassed` | `requiredChecklist` の全キーが `passedChecklistKeys` に含まれるか |
| `llmCoverageHint` | LLM からの coverage ヒント |
| `deepeningCount` | 同一トピックの深掘り回数 |
| `lastCoveredTurnId` | 最後に covered になったターン ID |

`deterministicCoveragePassed` の判定基準: `requiredChecklist` の全キーが `passedChecklistKeys` に含まれる場合に `True`。これにより LLM に依存しない決定論的な coverage 判定を実現する。

checklist は面接方式・面接段階・厳しさ・面接官タイプの組み合わせで生成される:

- **方式別**: standard_behavioral は `[situation, action, result, reproducibility]`、case は `[structure, hypothesis, prioritization]`、technical は `[decision_reason, tradeoff, reproducibility]`、life_history は `[turning_point, values, action_result_link]`
- **段階別**: `final` は `company_compare` / `decision_axis` / `commitment` を追加。`early` は最低限の 2 項目に絞る
- **厳しさ別**: `strict` は `consistency_check` を追加。`supportive` は 2 項目に絞る
- **面接官別**: `executive` は `career_vision` を追加。`line_manager` は `practical_skill` を追加

### 3.3 recentQuestionSummariesV2

同義質問抑止のために直近のターン情報を保持する。各エントリは以下を持つ:

- `intentKey`: `topic:followup_style` 形式の安定キー
- `normalizedSummary`: 質問の要約（60 字以内）
- `topic` / `followupStyle` / `turnId`

turn prompt では JSON 配列ではなく `_render_recent_question_summaries()` で 1 行/エントリの可読形式に変換し、40-60% のトークン削減を図る。state に保持する件数は `RECENT_QUESTION_SUMMARIES_STATE_WINDOW = 7` で制限し、prompt に含める件数は `RECENT_QUESTION_SUMMARIES_WINDOW = 13` で制限する。

### 3.4 formatPhase とフェーズ遷移

`formatPhase` は面接の形式に応じた進行フェーズを管理する。

有効値: `opening` / `standard_main` / `case_main` / `case_closing` / `technical_main` / `life_history_main` / `feedback`

- `case_main` では behavioral fallback を禁止し、`case_closing` でのみ motivation / personality 系 topic を限定解禁する
- 旧 `discussion_main` / `presentation_main` は読み取り時に `life_history_main` に正規化（`_LEGACY_FORMAT_PHASE_MAP`）
- 開始時は `opening`、turn 時は `_format_phase_for_setup()` が方式に応じたフェーズを返す

### 3.5 CaseBrief プリセットシステム

case 方式の面接では、LLM の自由生成ではなく preset JSON（`backend/app/data/case_seeds/<industry>.json`）からケース題材を読み込む。再現性を確保するため、同一企業 x 同一業界で複数回面接を行っても同じ題材が使われる。

`_select_case_brief()` の優先順位:
1. `seed_summary` に含まれる業界キーワードが preset industry と一致すればそれを使う
2. 一致しない場合は `selected_industry` から推定
3. どちらも不明 / preset 未配置なら `None`（従来の固定シナリオ fallback）

対応業界: `finance` / `saas` / `retail` / `manufacturing` / `consulting` / `media` / `infrastructure`

CaseBrief の構造:
- `business_context`: 2-3 文で事業文脈
- `target_metric`: 主要 KPI
- `constraints`: 3-5 項目の制約
- `candidate_task`: 応募者が解く問い
- `why_this_company`: なぜこの会社のケースか
- `case_followup_topics`: 深掘り候補 3-5 項目
- `industry` / `case_seed_version`

---

## 4. リクエストライフサイクル

### 4.1 setup-first -> plan -> opening -> turns -> feedback

1. **setup-first**: ユーザーが `selectedIndustry` / `selectedRole` / `interviewFormat` / `selectionType` / `interviewStage` / `interviewerType` / `strictnessMode` を確定。`roleTrack` は `selectedRole` から内部自動分類（`_infer_role_track()`）
2. **plan**: `POST /start` で面接計画を LLM 生成（`feature="interview_plan"`、GPT-5.4）。`priorityTopics` / `mustCoverTopics` / `riskTopics` / `suggestedTimeflow` を返す。失敗時は `_fallback_plan()` で deterministic fallback
3. **opening**: 同一 `/start` ストリーム内で opening question を LLM 生成。質問が方式に合わない場合は `_opening_question_matches_format()` で fallback に差し替え
4. **turns**: `POST /stream` で回答送信 -> 次質問生成。coverageState マージ、short_coaching 付与、question 正規化（`_normalize_question_text()`）
5. **feedback**: `POST /feedback` で最終講評を LLM 生成。7 軸採点、Evidence-Linked Rubric、improved_answer を返す
6. **continue**: 講評後に `POST /continue` で追加深掘りを再開。前回講評の `next_preparation` / `improvements` を踏まえる
7. **satisfaction**: `POST /feedback/satisfaction` で 1-5 の満足度を保存

### 4.2 BFF 層の役割

BFF（Next.js API Route）は以下を担う:

```
getRequestIdentity()  -> 認証検証（ログイン必須）
  |
guardDailyTokenLimit()  -> 日次トークン上限ガード
  |
buildInterviewContext()  -> 企業情報・材料・会話・講評履歴の hydration
  |
reserveCredits()  -> クレジット事前控除
  |
ensureInterviewConversation()  -> DB に会話レコード確保
  |
createInterviewUpstreamStream()  -> FastAPI への SSE 中継
  |
onComplete: saveInterviewConversationProgress() + saveInterviewTurnEvent() + confirmReservation()
onError/onAbort: cancelReservation()
```

ペイロード構築は `context-builder*.ts`（4 ファイル構成）が担い、志望動機・ガクチカ要約・学業/研究・ES・業界/企業 seed を FastAPI が必要とするリッチコンテキストに変換する。

### 4.3 エラーパス

| 段階 | 条件 | 結果 |
|---|---|---|
| BFF | 未認証/ゲスト | 401 `INTERVIEW_AUTH_REQUIRED` |
| BFF | クレジット不足 | 402 `INTERVIEW_INSUFFICIENT_CREDITS` |
| BFF | 日次トークン上限 | 429 |
| BFF | 同時ストリーム上限 | 429 `SseConcurrencyExceeded` |
| BFF | 進行中セッション重複 | 409 `INTERVIEW_SESSION_ALREADY_ACTIVE` |
| BFF | 業界/職種/設定未選択 | 400 `INTERVIEW_SETUP_REQUIRED` |
| BFF | persistence 障害 | 503 `INTERVIEW_PERSISTENCE_UNAVAILABLE` |
| Backend | 入力 sanitize 失敗 | 400 |
| Backend | LLM 呼び出し失敗 | deterministic fallback -> SSE complete |
| Backend | 全 fallback 失敗 | SSE error event |

persistence schema が未適用のときは `INTERVIEW_PERSISTENCE_UNAVAILABLE` で fail-closed する。

---

## 5. バックエンドパイプライン

### 5.1 planning.py: 計画生成・coverage 判定・topic 優先度

`planning.py` は面接機能の中核（~1,538 行）。以下の責務を持つ:

- **checklist catalog**: `_checklist_for_topic()` が setup（方式 / 段階 / 厳しさ / 面接官タイプ）に応じて topic ごとの必須チェック項目を生成
- **coverage 構築**: `_build_initial_coverage_state()` で plan の `must_cover_topics` から初期 coverageState を構築。`_normalize_coverage_state()` で既存 state を正規化
- **coverage マージ**: `_merge_plan_progress()` が LLM の coverage 判定と deterministic checklist closure を統合
- **answer_gap 判定**: `detect_answer_gap()` が直近回答を deterministic に分析し、`abstract` / `missing_hypothesis` / `surface_analysis` / `lacks_tradeoff` / `low_ownership` / `low_commitment` / `thin_narrative` / `sufficient` 等のタイプを返す
- **short_coaching**: `_fallback_short_coaching()` が answer_gap に応じた `good` / `missing` / `next_edit` の 3 フィールドを機械的に生成。LLM が返さない場合のfallback
- **feedback enrichment**: `_enrich_feedback_defaults()` で LLM が欠落したフィールド（improvements, next_preparation, consistency_risks, improved_answer, Evidence-Linked Rubric の 3 field）を deterministic に補完
- **CaseBrief**: `_select_case_brief()` / `_load_case_brief_preset()` でプリセット読み込み
- **fallback 関数群**: `_fallback_plan()` / `_build_fallback_opening_payload()` / `_build_fallback_turn_payload()` / `_build_fallback_continue_payload()` が LLM 失敗時の deterministic 応答を提供

### 5.2 generators.py: SSE ストリーミング

4 つの SSE 生成関数が対応する:

| 関数 | エンドポイント | `feature` | ストリーミング対象 |
|---|---|---|---|
| `_generate_start_progress()` | `/start` | `interview_plan` + `interview` | plan(一括) + question |
| `_generate_turn_progress()` | `/turn` | `interview` | question |
| `_generate_continue_progress()` | `/continue` | `interview` | question |
| `_generate_feedback_progress()` | `/feedback` | `interview_feedback` | overall_comment + improved_answer |

共通の `_stream_llm_json_completion()` が `call_llm_streaming_fields()` を呼び、`string_chunk` と最終 JSON を yield する。LLM 失敗時は各生成関数が対応する fallback を使用する。

全エンドポイントは `SseLease` で同時ストリーム数を制御し、`SseConcurrencyExceeded` 時は 429 を返す。

### 5.3 prompting.py: プロンプト構築

`_build_*_prompt()` 関数群が behavioral_block の選択と token budget 最適化を行う:

| プロンプト | behavioral_block 構成 | 最適化 |
|---|---|---|
| plan | `grounding_core` + `format` + `stage` | grounding_legal 不要（質問生成なし） |
| opening | `grounding_core` + `grounding_legal` + `strictness` + `interviewer` + `stage` + `format` + `question_design` | repetition 不要（1 問目） |
| turn | 全構成要素 | coverage_state / recent_question_summaries を compact 形式に変換 |
| feedback | `grounding_core` + `rubric` | 質問生成不要のため legal / deepening 省略 |
| continue | `grounding_core` + `strictness` + `interviewer` + `stage` + `question_design` | format / deepening / repetition 省略で budget 1800 に収める |

Render ヘルパ:
- `_render_coverage_state()`: JSON -> 1 行/エントリの可読形式（missing checklist のみ抽出）
- `_render_recent_question_summaries()`: JSON 配列 -> `- turn-{turnId}: [{topic}/{followupStyle}] {summary}` の圧縮形式
- `_summarize_latest_feedback()`: latest_feedback 全体の JSON dump -> 4 要素抽出（40-60% トークン削減）
- `_build_case_brief_section()`: case format の plan に case_brief が詰まっている場合のみ CASE BRIEF セクションを注入

---

## 6. ドリル機能（Weakness Drill）

### 6.1 概要と 4 ステップ

Weakness Drill は最終講評で判明した最弱回答を書き直して再採点する機能。最終講評後に `DrillPanel` が展開される。

4 ステップの stepper:

| ステップ | 内容 | 生成元 |
|---|---|---|
| 1. なぜ弱かったか | `why_weak` — evidence 付きで 2-3 文 | LLM (drill/start) |
| 2. 改善パターン | `improvement_pattern` — 典型的な弱点 -> 修正パターン | LLM (drill/start) |
| 3. 模範回答 | `model_rewrite` — 150-250 字、固有名詞・数字・経験接続を含む | LLM (drill/start) |
| 4. もう一度挑戦 | ユーザーが retry_answer を入力 -> 7 軸で再採点 -> delta 表示 | LLM (drill/score) |

Delta 表示: `+1` 以上は緑 + 上矢印、`0` はグレー、`-1` 以下は赤 + 下矢印。

### 6.2 エンドポイント

**drill/start** — `POST /api/interview/drill/start`

| 項目 | 内容 |
|---|---|
| BFF | `src/app/api/companies/[id]/interview/drill/start/route.ts` |
| Backend | `endpoints.interview_drill_start()` |
| プロトコル | 非 SSE。単発 JSON POST -> LLM 1 回呼び出し -> `json_schema` mode |
| Schema | `INTERVIEW_DRILL_START_SCHEMA` (4 field: why_weak / improvement_pattern / model_rewrite / retry_question) |
| LLM | `feature="interview"`, `max_tokens=800`, `temperature=0.3` |
| 認証 | ログイン必須（`identity.userId` チェック） |
| 課金 | クレジット消費なし。`guardDailyTokenLimit` のみ |
| Rate limit | 30/minute |
| 永続化 | `interviewDrillAttempts` テーブルに attempt を INSERT。`retryAnswer` / `retryScores` / `deltaScores` は null（score 時に UPDATE） |

BFF は会話の存在確認、company name lookup、upstream payload 構築を行う。original_feedback の紐付けは lineage 用途（optional）。

入力の sanitize は `_sanitize_drill_start()` が 2-pass（user-input sanitize + prompt injection defence）で行う。LLM 失敗時は deterministic fallback で 4 field を埋める。

**drill/score** — `POST /api/interview/drill/score`

| 項目 | 内容 |
|---|---|
| BFF | `src/app/api/companies/[id]/interview/drill/score/route.ts` |
| Backend | `endpoints.interview_drill_score()` |
| プロトコル | 非 SSE。単発 JSON POST -> LLM 1 回呼び出し -> `json_schema` mode |
| Schema | `INTERVIEW_DRILL_SCORE_SCHEMA` (retry_scores + rationale) |
| LLM | `feature="interview_feedback"`, `max_tokens=600`, `temperature=0.2` |
| 認証 | ログイン必須 |
| 課金 | クレジット消費なし |
| Rate limit | 30/minute |
| 永続化 | `interviewDrillAttempts` を UPDATE（retryAnswer / retryScores / deltaScores / completedAt） |

`_coerce_retry_scores()` で LLM 返却の retry_scores を 7 軸の int (0-5) に正規化。`delta_scores = retry_scores - original_scores`。rationale が空の場合は delta を 1 文で要約する deterministic fallback を使用。

### 6.3 スコアリングとデルタ

7 軸（`company_fit` / `role_fit` / `specificity` / `logic` / `persuasiveness` / `consistency` / `credibility`）で 0-5 の整数スコアを返す。delta は各軸の `retry_scores[axis] - original_scores[axis]`。

重点軸（`weakest_axis`）での変化を特に注意深く評価するよう prompt で指示。original_scores が保存されていない場合は 0 で埋める。

### 6.4 DrillPanel コンポーネント

`src/components/interview/DrillPanel.tsx` が 4 ステップの stepper を提供する。

状態遷移: `idle` -> `loading_start` -> `ready` -> `scoring` -> `complete`。`error` は任意の状態から遷移可能。

Props として親（Feedback 表示側）から `companyId` / `weakestTurnId` / `weakestQuestion` / `weakestAnswer` / `weakestAxis` / `originalScore` / `weakestEvidence` / `originalScores` を受け取る。

API 呼び出しは `src/lib/interview/client-api.ts` の `startInterviewDrill()` / `scoreInterviewDrill()` を使用。

---

## 7. 最終講評

### 7.1 スコアリング軸

7 軸で講評する（`SEVEN_AXES` / `INTERVIEW_SCORE_SCHEMA`）。0-5 の整数。

| 軸 | 説明 |
|---|---|
| `company_fit` | 企業適合度 |
| `role_fit` | 職種適合度 |
| `specificity` | 具体性 |
| `logic` | 論理性 |
| `persuasiveness` | 説得力 |
| `consistency` | 一貫性 |
| `credibility` | 信頼性 |

方式別の評価重み:
- `standard_behavioral`: `company_fit` / `consistency` / `specificity` を重視
- `case`: `logic` / `persuasiveness`（仮説と根拠）を重視
- `technical`: `specificity` / `credibility`（前提・再現性）を重視
- `life_history`: `consistency` / `persuasiveness`（価値観と行動のつながり）を重視

Evidence-Linked Rubric として以下の 3 field を返す:
- `score_evidence_by_axis`: 7 軸別の採点根拠（応募者発言の引用、最大 3 項目/軸、1 項目 30 字以内、捏造禁止）
- `score_rationale_by_axis`: 7 軸別の採点理由（1-2 文）
- `confidence_by_axis`: `high`（evidence 3 + BARS 明確）/ `medium`（evidence 1-2）/ `low`（evidence 0 or 判断不能）

evidence が空の軸は `confidence=low` 固定。`_enrich_feedback_defaults()` で LLM が返さなかったフィールドを deterministic に補完する。

### 7.2 improved_answer

`improved_answer` は generic fallback を廃止し、`weakest_turn_id` に紐づく最弱 1 問専用で返す。120-220 字で応募者がそのまま言いやすい自然な日本語。

`weakest_turn_id` / `weakest_question_snapshot` / `weakest_answer_snapshot` が LLM 出力で欠落した場合は `_backfill_feedback_linkage_from_conversation()` が会話履歴から backfill する。

---

## 8. フロントエンド

### 8.1 コンポーネント構成

```
InterviewPageContent (~486 行)
+-- setup-first card (業界/職種/方式/選考/段階/面接官/厳しさ)
+-- 会話表示 (useStreamingTextPlayback による文字送り)
+-- 右カラム
|   +-- 進捗カード (トピックピル + ライフサイクルフェーズ)
|   +-- 面接設定
|   +-- 参考にする材料
|   +-- 過去の最終講評 (compact + モーダル全文)
+-- 最終講評表示
|   +-- 7 軸スコア + evidence/rationale/confidence
|   +-- strengths / improvements / consistency_risks
|   +-- 最弱設問 + improved_answer
|   +-- next_preparation
|   +-- 満足度 (1-5)
|   +-- DrillPanel (4 ステップ stepper)
+-- 「面接対策を続ける」/「会話をやり直す」

dashboard/ (~406 行)
+-- CompanyHeatmap.tsx   企業別の講評スコア heatmap
+-- FormatHeatmap.tsx    方式別のスコア heatmap
+-- TrendChart.tsx       スコア推移グラフ
+-- RecurringIssuesList.tsx  繰り返し指摘される改善点
```

### 8.2 ストリーミング再生

- 質問テキストは `useStreamingTextPlayback` による文字送り演出で表示
- SSE `string_chunk` はローカル蓄積のみ行い、`complete` イベント後に playback を開始
- playback 完了 + 180ms 遅延後に `startTransition` で全 state を一括適用し、ステータス切り替え時のガタつきを防ぐ
- フィードバックの `string_chunk` は即時表示（文字送り不要）
- UI 状態管理は `src/lib/interview/reducers.ts` の reducer で SSE event -> state 更新を行う

### 8.3 ダッシュボード分析

`src/lib/interview/dashboard.ts` (~344 行) が集計ロジックを提供:

- 企業別・方式別の 7 軸スコア集計（heatmap 用）
- スコア推移のトレンド計算
- 繰り返し指摘される改善点の抽出

### 8.4 進捗カード

- トピックピル: 確認済み (emerald + check) / 進行中 (sky) / 未着手 (muted) の 3 色バッジ
- 内部キー（`motivation_fit` 等）は `labelTopic()` で日本語ラベル（「志望動機」等）に変換
- ライフサイクルフェーズ: 「質問フェーズ -> フィードバック -> 面接完了」の 3 段階を done/current/pending で表示
- 進捗ナラティブ: 「次は XX について確認します。」を `currentTopicLabel` から生成

---

## 9. 会社別上乗せと永続化

### 会社別上乗せ

質問生成では次を材料にする:

1. 保存済み志望動機
2. ガクチカ要約
3. 関連 ES
4. `academic_summary` / `research_summary`
5. `src/lib/interview/company-seeds.ts` の業界・企業 seed

seed は repo 内の設定資産として保持し、実行時に毎回 live search はしない。BFF の `context-builder-loaders.ts` / `context-builder-summaries.ts` が材料を読み込み、`context-builder-setup.ts` が setup を構築する。

### `interview_conversations`

- `companyId` / `userId` / `guestId` / `messages` / `status`
- `selectedIndustry` / `selectedRole` / `selectedRoleSource` / `roleTrack`
- `interviewFormat` / `selectionType` / `interviewStage` / `interviewerType` / `strictnessMode`
- `interviewPlanJson` / `turnStateJson` / `turnMetaJson`
- `activeFeedbackDraft` / `currentFeedbackId` / `updatedAt`

旧 `currentStage` / `stageQuestionCounts` / `completedStages` / `lastQuestionFocus` は互換読み取りの補助として残るが、v2.1 の正本は `turnStateJson` と `turnMetaJson`。旧版セッションは互換復元せず、v2 開始時にリセット扱いにする。

### `interview_turn_events`

- `turnId` / `conversationId` / `companyId` / `userId` / `guestId`
- `question` / `answer` / `topic` / `questionType` / `turnAction` / `followupStyle` / `intentKey`
- `coverageChecklistSnapshot` / `deterministicCoveragePassed` / `llmCoverageHint`
- `formatPhase` / `formatGuardApplied` / `createdAt`

各ターンの canonical log。最弱設問の復元、同義質問分析、analytics の正本に使う。

### `interview_feedback_histories`

- `conversationId` / `companyId` / `userId` / `guestId`
- `overallComment` / `scores` / `strengths` / `improvements` / `consistencyRisks`
- `weakestQuestionType` / `weakestTurnId` / `weakestQuestionSnapshot` / `weakestAnswerSnapshot` / `improvedAnswer`
- `preparationPoints` / `premiseConsistency` / `satisfactionScore`
- `scoreEvidenceByAxis` / `scoreRationaleByAxis` / `confidenceByAxis`
- `sourceQuestionCount` / `sourceMessagesSnapshot`

### `interview_drill_attempts`

- `id` / `conversationId` / `userId` / `guestId` / `companyId`
- `originalFeedbackId` / `weakestTurnId` / `weakestAxis`
- `weakestQuestion` / `weakestAnswer` / `originalScores`
- `whyWeak` / `improvementPattern` / `modelRewrite` / `retryQuestion`
- `retryAnswer` / `retryScores` / `deltaScores`
- `promptVersion` / `createdAt` / `completedAt`

drill/start で INSERT（retryAnswer 以降は null）、drill/score で UPDATE。

---

## 10. 課金・認証

### クレジット消費テーブル

| エンドポイント | クレジット | 課金名 |
|---|---|---|
| `POST /start` | 2 (`INTERVIEW_START_CREDIT_COST`) | `interview` |
| `POST /stream` | 1 (`INTERVIEW_TURN_CREDIT_COST`) | `interview` |
| `POST /continue` | 1 (`INTERVIEW_CONTINUE_CREDIT_COST`) | `interview` |
| `POST /feedback` | 6 (`DEFAULT_INTERVIEW_SESSION_CREDIT_COST`) | `interview_feedback` |
| `POST /drill/start` | 0（クレジット消費なし） | - |
| `POST /drill/score` | 0（クレジット消費なし） | - |

SSOT: `src/lib/credits/shared.ts`

### Reserve -> Confirm/Cancel フロー

1. **Reserve**: 開始/回答/続き/講評の各操作前にクレジットを事前控除（`reserveCredits()`）
2. **Confirm**: SSE `complete` で永続化成功 -> 控除確定（`confirmReservation()`）
3. **Cancel**: エラー・abort・永続化失敗 -> 返金（`cancelReservation()`）

Drill エンドポイントは `reserveCredits` を呼ばない。`guardDailyTokenLimit()` による日次トークン上限ガードのみ適用される。

### 認証ルール

| 対象 | アクセス |
|---|---|
| ログインユーザー | 全機能利用可能 |
| ゲスト | 全操作不可（BFF が 401 で拒否） |

ゲスト不可の根拠: 全 BFF ルートで `identity.userId` をチェックし、null の場合は `INTERVIEW_AUTH_REQUIRED` を返す。Drill も同様にログイン必須。

---

## 11. テスト

### テスト層

| 層 | コマンド | 内容 |
|---|---|---|
| Deterministic (Backend) | `python -m pytest backend/tests/interview/test_interview_deterministic.py -q` | coverage 判定・fallback・planning の決定論テスト |
| Drill (Backend) | `python -m pytest backend/tests/interview/test_interview_drill.py -q` | Drill の sanitize・fallback・delta 計算 |
| Streaming (Backend) | `python -m pytest backend/tests/interview/test_interview_streaming.py -q` | SSE 生成の統合テスト |
| Prompt Shapes (Backend) | `python -m pytest backend/tests/interview/test_interview_prompt_shapes.py -q` | プロンプト構造の回帰テスト |
| Prompt Budget (Backend) | `python -m pytest backend/tests/interview/test_prompt_budget.py -q` | トークン予算上限テスト |
| Harness Deterministic | `python -m pytest backend/tests/interview/test_harness_deterministic.py -q` | テストハーネスの決定論検証 |
| Facade Seam | `python -m pytest backend/tests/interview/test_facade_seam.py -q` | facade re-export の整合性 |
| Reference Corpus | `python -m pytest backend/tests/interview/test_reference_interview_corpus_integrity.py -q` | 参考面接コーパスの完全性 |
| Unit (Frontend) | `npm run test:unit -- --grep interview` | コンポーネント・ロジックの単体テスト |
| E2E | `make test-e2e-functional-local AI_LIVE_LOCAL_FEATURES=interview` | ブラウザ統合テスト |

### 面接官口調ルール

- `INTERVIEWER_COMMON_RULES` で挨拶・感想・評価・要約・共感・前置きを禁止
- 禁止例: 「一貫していますね」「良い点ですね」「なるほど」「これまでの話を聞くと」
- 疑問文か指示文で開始し、応募者への言及から始めない
- `_normalize_question_text()` で防御的正規表現を適用し、LLM 非準拠時に前置きを除去

---

## 12. 主要ファイル一覧（クイックリファレンス）

| カテゴリ | ファイル | 行数 |
|---|---|---|
| **Backend Core** | `backend/app/routers/_interview/planning.py` | ~1,538 |
| | `backend/app/routers/_interview/contracts.py` | ~1,113 |
| | `backend/app/routers/_interview/generators.py` | ~613 |
| | `backend/app/routers/_interview/prompting.py` | ~559 |
| | `backend/app/routers/_interview/endpoints.py` | ~430 |
| | `backend/app/routers/_interview/setup.py` | ~289 |
| | `backend/app/routers/interview.py` (facade) | ~161 |
| **Prompts** | `backend/app/prompts/interview_prompts.py` | ~449 |
| | `backend/app/data/case_seeds/` (dir) | JSON presets |
| **Frontend** | `src/components/interview/InterviewPageContent.tsx` | ~486 |
| | `src/components/interview/DrillPanel.tsx` | ~275 |
| | `src/components/interview/dashboard/` (dir) | ~406 |
| | `src/lib/interview/session.ts` | ~381 |
| | `src/lib/interview/dashboard.ts` | ~344 |
| | `src/lib/interview/conversation.ts` | ~281 |
| | `src/lib/interview/company-seeds.ts` | ~273 |
| | `src/lib/interview/reducers.ts` | ~227 |
| | `src/lib/interview/ui.ts` | ~259 |
| | `src/lib/interview/client-api.ts` | ~143 |
| | `src/lib/interview/types.ts` | ~119 |
| | `src/lib/interview/persistence*.ts` (5 files) | ~756 |
| | `src/lib/interview/context-builder*.ts` (5 files) | ~672 |
| **BFF** | `src/app/api/companies/[id]/interview/start/route.ts` | ~338 |
| | `src/app/api/companies/[id]/interview/drill/start/route.ts` | ~262 |
| | `src/app/api/companies/[id]/interview/drill/score/route.ts` | ~222 |
| | `src/app/api/companies/[id]/interview/route.ts` | ~119 |
| | `src/app/api/companies/[id]/interview/stream-utils.ts` | shared |
| **Tests** | `backend/tests/interview/test_interview_deterministic.py` | ~1,632 |
| | `backend/tests/interview/test_interview_streaming.py` | ~1,036 |
| | `backend/tests/interview/test_interview_prompt_shapes.py` | ~596 |
| | `backend/tests/interview/test_harness_deterministic.py` | ~426 |
| | `backend/tests/interview/test_interview_drill.py` | ~367 |
| | `backend/tests/interview/test_facade_seam.py` | ~170 |

---

## 補足: 関連ドキュメント

- ガクチカ深掘り: `docs/features/GAKUCHIKA_DEEP_DIVE.md`
- 志望動機: `docs/features/MOTIVATION.md`
- ES 添削: `docs/features/ES_REVIEW.md`
- 集客 LP: `src/app/(marketing)/ai-mensetsu/page.tsx`

## Next API 一覧

| メソッド | パス | 用途 |
|---|---|---|
| `GET` | `/api/companies/[id]/interview` | hydrate 用 |
| `POST` | `/api/companies/[id]/interview/start` | 面接開始 |
| `POST` | `/api/companies/[id]/interview/stream` | 回答送信 + 次質問 |
| `POST` | `/api/companies/[id]/interview/feedback` | 最終講評 |
| `POST` | `/api/companies/[id]/interview/continue` | 講評後の続き |
| `POST` | `/api/companies/[id]/interview/reset` | セッションリセット |
| `POST` | `/api/companies/[id]/interview/feedback/satisfaction` | 満足度保存 |
| `POST` | `/api/companies/[id]/interview/drill/start` | ドリル開始 |
| `POST` | `/api/companies/[id]/interview/drill/score` | ドリル再採点 |

## FastAPI 一覧

| メソッド | パス | 用途 | SSE |
|---|---|---|---|
| `POST` | `/api/interview/start` | plan + opening 生成 | Yes |
| `POST` | `/api/interview/turn` | 次質問生成 | Yes |
| `POST` | `/api/interview/continue` | 再開質問生成 | Yes |
| `POST` | `/api/interview/feedback` | 最終講評生成 | Yes |
| `POST` | `/api/interview/drill/start` | ドリル 4 field 生成 | No |
| `POST` | `/api/interview/drill/score` | 再採点 + delta | No |

## analytics

- analytics の正本は server-side 保存
- `interview_turn_events` と `interview_feedback_histories` を使って次を集計する
  - 完走率
  - 再質問率
  - `followupStyle` 分布
  - `satisfactionScore`
- client の trackEvent は補助用途に留める
- dashboard コンポーネント（`src/components/interview/dashboard/`）がフロント集計を担う
