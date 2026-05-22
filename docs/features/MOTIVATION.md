# 志望動機作成機能

## 1. 概要

会話ベースで志望動機 ES の材料を段階的に揃え、下書きを生成する機能。6 要素のスロットフィル状態機械で会話を制御し、十分な材料が揃った時点で ES 下書き生成を解放する。

- **対話モデル**: スロットフィル状態機械（6 要素 x 4 段階）+ deepdive 補強
- **プロトコル**: SSE (Server-Sent Events) によるリアルタイムストリーミング
- **認証**: ログインユーザー専用（ゲストは利用不可。BFF の `conversation/stream` が `!userId` で 401 を返す）
- **課金**: 会話は 1 ターン 1 クレジット消費（post-success 型）。下書き生成は 6 クレジット予約 (Reserve/Confirm/Cancel)。深掘り再開は 1 クレジット予約
- **二ルート**: (A) 会話ありの `generate-draft`、(B) 会話なしの `generate-draft-from-profile`（ログイン必須、プロフィール・ガクチカ由来の fallback 専用）

---

## 2. アーキテクチャ

### 2.1 3 層構成図

```
+------------------------------------------------------------+
|  Frontend (React)                                          |
|  MotivationConversationContent                             |
|   + MotivationSetupPanel / ConversationProgressBar (共通)   |
|   + MotivationConversationSidebar / ConversationPhaseBar   |
|  useConversationRuntime + motivation-stream-adapter         |
|  SSE adapter → playback → commitState → UI 更新             |
+----------------------------+-------------------------------+
                             | POST /api/motivation/[companyId]/conversation/stream
                             | POST /api/motivation/[companyId]/generate-draft
                             | POST /api/motivation/[companyId]/generate-draft-direct
                             | POST /api/motivation/[companyId]/resume-deepdive
+----------------------------v-------------------------------+
|  BFF (Next.js API Route)                                   |
|  認証検証 -> owner 判定 -> クレジット処理 -> FastAPI 中継     |
|  stream-service.ts / motivation-stream-policy.ts           |
+----------------------------+-------------------------------+
                             | POST /api/motivation/next-question
                             | POST /api/motivation/next-question/stream
                             | POST /api/motivation/generate-draft
                             | POST /api/motivation/generate-draft-from-profile
+----------------------------v-------------------------------+
|  Backend (FastAPI)                                         |
|  Facade (router) -> services/motivation/ (18 modules)      |
|  スロット評価 -> 質問生成 -> バリデーション -> SSE 生成       |
+------------------------------------------------------------+
```

### 2.2 Facade パターンと services/ レイヤー

バックエンドの志望動機ロジックは `backend/app/services/motivation/` に 18 モジュールとして分割されている。ルーター層には 15 個の薄い facade ファイル（`backend/app/routers/motivation*.py`）があり、それぞれが `sys.modules` 置換または re-export で `services/motivation/` の対応モジュールを公開する。

**facade の仕組み**:
- `backend/app/routers/motivation.py`（~11 行）は `app.services.motivation.facade` を `sys.modules[__name__]` に差し替え、全エクスポートを中継する
- `backend/app/routers/motivation_question.py` 等 14 ファイル（各 ~11 行）は同じパターンで対応する `services/motivation/*.py` を re-export する
- `backend/app/services/motivation/facade.py`（~793 行）が実質的なルーターであり、APIRouter 定義、エンドポイント実装、他 17 モジュールからの import 集約を担う
- `backend/app/services/motivation/facade_dependencies.py`（~10 行）は `__getattr__` によるレイジーアクセサで、テスト時のモンキーパッチを維持する

この設計により、外部から見える import パスは `app.routers.motivation` のまま、実装は `services/motivation/` の責務分割に従う。

### 2.3 主要ファイル配置テーブル

| 層 | パス | 責務 | 行数 |
|---|---|---|---|
| **Backend Facade** | `backend/app/services/motivation/facade.py` | API エンドポイント + import 集約 | ~793 |
| Backend Question | `backend/app/services/motivation/question.py` | スロットフィル状態機械 + 質問組立 | ~1,027 |
| Backend Pipeline | `backend/app/services/motivation/pipeline.py` | 質問準備 + 評価パイプライン | ~639 |
| Backend Context | `backend/app/services/motivation/context.py` | 会話コンテキスト正規化 + スロット分類 | ~780 |
| Backend Validation | `backend/app/services/motivation/validation.py` | 重複防止 + フォーカス正規化 + 前提検証 | ~665 |
| Backend Retry | `backend/app/services/motivation/retry.py` | 失敗分類 + 品質リトライ + AI smell | ~583 |
| Backend Draft | `backend/app/services/motivation/draft.py` | 下書き生成 + grounding 解決 | ~594 |
| Backend Company | `backend/app/services/motivation/company.py` | 企業 RAG 連携 + エビデンスカード | ~505 |
| Backend Planner | `backend/app/services/motivation/planner.py` | ターンプランナー + causal gap 計算 | ~209 |
| Backend Stream | `backend/app/services/motivation/stream_service.py` | SSE 生成 + progress イベント | ~227 |
| Backend Prompt | `backend/app/services/motivation/prompt_fmt.py` | プロンプト整形 + 学生表現抽出 | ~303 |
| Backend Models | `backend/app/services/motivation/models.py` | Pydantic モデル + DeepDiveGap enum | ~269 |
| Backend Contract | `backend/app/services/motivation/contract.py` | SSE 完了イベント組立 + StageStatus | ~57 |
| Backend Summarize | `backend/app/services/motivation/summarize.py` | 会話要約 (20 件超で発動) | ~141 |
| Backend Sanitizers | `backend/app/services/motivation/sanitizers.py` | 入力サニタイズ | ~88 |
| Backend Streaming | `backend/app/services/motivation/streaming.py` | 互換シム (stream_service へ委譲) | ~46 |
| Router Facade | `backend/app/routers/motivation.py` 他 14 ファイル | sys.modules 置換による re-export | 各 ~11 |
| **BFF Stream** | `src/bff/motivation/stream-service.ts` | SSE 中継 + DB 保存 | -- |
| BFF Routes | `src/bff/motivation/routes/[companyId]/` (8 ファイル) | API エントリ + 認証 + ペイロード構築 | -- |
| BFF Billing | `src/bff/billing/motivation-stream-policy.ts` | 会話 1 ターン 1 クレジット消費 | ~65 |
| **Frontend Lib** | `src/lib/motivation/` (19 ファイル) | 会話状態 + ペイロード + 読みモデル。`conversation-read-model-parsers.ts` の `safeParseJsonValue` は `src/lib/shared/parsers.ts` から re-export。`client-api.ts` は `buildJsonHeaders` / `withQuery` / `postJson` を `src/lib/shared/client-api.ts` から import | ~2,161 |
| Frontend Components | `src/components/motivation/` (13 ファイル) | UI コンポーネント + テスト | ~1,449 |
| Page | `src/app/(product)/companies/[id]/motivation/page.tsx` | ページエントリ | -- |
| Marketing LP | `src/app/(marketing)/shiboudouki-ai/page.tsx` | 集客 LP | -- |

### 2.4 共有基盤 (`src/lib/shared/`)

ガクチカ・志望動機・面接対策の 3 機能で共通するパーサー・シリアライザー・クライアント API ユーティリティを `src/lib/shared/` に集約している。志望動機では以下を利用する:

| 共有モジュール | 志望動機での利用 |
|---|---|
| `JsonValue` (`types.ts`) | `client-api.ts` で型参照 |
| `safeParseJsonValue` (`parsers.ts`) | `conversation-read-model-parsers.ts` が re-export |
| `buildJsonHeaders` (`client-api.ts`) | `client-api.ts` で直接 import |
| `withQuery` (`client-api.ts`) | `client-api.ts` で直接 import |
| `postJson` (`client-api.ts`) | `client-api.ts` の POST 関数が利用 |

注意: 志望動機の `Message` 型は `id` が optional であるため、共有の `BaseMessage`（`id` 必須）とは異なる独自型を維持している。`parseStringArray` も trim なし仕様のため機能ローカルに保持。

### 2.5 SSE イベントプロトコル

FastAPI の内部 SSE は BFF で consume-and-re-emit され、ブラウザへは公開スキーマのみ渡す。

| イベント | 用途 | ペイロード例 |
|---|---|---|
| `progress` | 進捗更新 | `{step, progress, label}` |
| `string_chunk` | 質問テキスト逐次送出（SSE 版のみ） | `{path, text}` |
| `complete` | 質問確定 + 全 response フィールド | `{data: NextQuestionResponse}` |
| `error` | エラー | `{message, error_type, status_code}` |

**progress の step 遷移**:
```
rag (15%) -> evaluation (40%) -> question (65%) -> finalize (85%) -> complete
```

`string_chunk` は SSE ストリーミング版 (`/next-question/stream`) でのみ送出される。非ストリーミング版 (`/next-question`) は完了した質問を一括返却する。

---

## 3. 会話モデルとスロットフィル

### 3.1 6 要素スロット定義

志望動機は以下の 6 要素で管理する。固定順序で 1 スロットずつ回収し、6--7 問で ES 解放する。

| スロット名 | 日本語ラベル | 目的 |
|---|---|---|
| `industry_reason` | 業界志望理由 | その業界を志望する理由 |
| `company_reason` | 企業志望理由 | その企業に惹かれる理由 |
| `self_connection` | 自分との接続 | 経験・価値観と志望の接点 |
| `desired_work` | やりたい仕事 | 入社後に挑戦したい仕事 |
| `value_contribution` | 価値発揮 | どう価値を出したいか |
| `differentiation` | 差別化 | 他社ではなくこの企業を選ぶ理由 |

旧ステージ名 `origin_experience` と `fit_connection` は `self_connection` に統合済み。`closing` が API に残る場合は `differentiation` にフォールバックする。

### 3.2 状態遷移と充足判定

会話は 2 つのモード (`slot_fill` / `deepdive`) で進む。

```
slot_fill                              deepdive
+------------------------------------------+----------------------------+
|  industry_reason                         |                            |
|    -> company_reason                     |  causal_gap[0] -> gap[1]   |
|      -> self_connection                  |    -> ... -> gap[n]        |
|        -> desired_work                   |      -> deepdive_complete  |
|          -> value_contribution           |                            |
|            -> differentiation            |                            |
|              -> [unlock: draft_ready]    |                            |
+------------------------------------------+----------------------------+
```

**slot_fill モードのアンロック条件** (`_determine_next_turn` in planner.py):
1. 6 スロット全てが `locked` 状態 (`completed_six_slots`)
2. ターン数が 7 以上に達した場合 (`max_turn_reached`)

**deepdive モードのアンロック条件**:
1. deepdive ターン数が 10 以上、または causal gap が空 (`deepdive_complete`)

### 3.3 slot_status 4 段階

`slot_status_v2` は LLM 評価から得られ、confidence スコアで下方補正される。

| 状態 | 意味 | 扱い |
|---|---|---|
| `filled_strong` | 十分な情報があり再質問不要 | `do_not_ask_slots` に追加。UI では done |
| `filled_weak` | 情報はあるが弱い。最大 1 回だけ補強対象 | `weak_slots` に追加。1 回再質問後は closed |
| `partial` | 部分的な情報のみ | `missing_slots` に含まれる |
| `missing` | 未回答 | `missing_slots` に含まれる |

**内部スロット状態** (slotStates、context 内部) は 4 値: `empty` / `rough` / `sufficient` / `locked`。`_classify_slot_state` が回答テキストからスロットごとにルールベースで判定する。`locked` は回答受理後に確定するゲート状態で、未整理表現 (`UNRESOLVED_PATTERNS`) や矛盾表現 (`CONTRADICTION_PATTERNS`) が検出された場合のみ reask budget を消費してスロットを保持する。

### 3.4 draft_ready 判定条件

draft_ready は 2 段階のゲートで判定する。

**ゲート 1: draft gate** (`_compute_draft_gate` in question.py):
- `company_reason`, `desired_work`, `differentiation` が `filled_strong` または `filled_weak`
- `self_connection` が `filled_strong` / `filled_weak` かつ因果リンクあり (`_self_connection_has_causal_link`)

**ゲート 2: planner unlock** (`_determine_next_turn` in planner.py):
- 全 6 スロットが `locked`、またはターン数 >= 7

両方のゲートを通過した場合のみ `draft_ready: true` を返す。ただし planner が unlock しても draft gate が不合格なら `ready_for_draft: false` となる。

`draft_ready` 到達後はスナックバーで通知し、「志望動機ESを作成」CTA を有効化する。CTA 有効化後も会話は継続でき、ES 作成はユーザーの任意タイミングで実行する。

### 3.5 deepdive モード

ES 解放後にユーザーが「もっと深堀りして再生成する」または「深掘りを続ける」を選んだ場合に deepdive モードに移行する。

**causal gap の計算** (`_compute_deterministic_causal_gaps` in planner.py):
- `company_reason` に企業固有語が不足 -> `company_reason_specificity`
- `self_connection` に経験・価値観・強みのアンカーがない -> `self_connection_gap`
- `desired_work` に職種志望理由がない -> `role_reason_missing`
- `value_contribution` の対象/行動/価値の 3 グループ中 2 グループ未満 -> `value_contribution_vague`
- `differentiation` に他社比較語がない -> `differentiation_missing`

各 gap には `DeepDiveGap` enum (`models.py`) による canonical 変換があり、`gap_id` / `target_area` / `weakness_tag` / `stage` の 4 系統の wire 文字列を相互変換する。deepdive では最大 10 問まで弱点補強を行い、ES 作成直後に自動で次質問は出さない。

---

## 4. 質問生成パイプライン

### 4.1 pipeline.py: 準備と組立

`_prepare_motivation_next_question` がリクエストから `_MotivationQuestionPrep` dataclass を構築する。主要ステップ:

1. `_normalize_conversation_context` で会話コンテキストを正規化
2. `_capture_answer_into_context` で最新回答をスロットに取り込み
3. `_apply_semantic_confirmation_post_capture` で LLM による回答確認（gpt-nano、2 秒タイムアウト）
4. `_get_company_context` で企業 RAG を取得（adaptive query + ロール軸）
5. `_extract_company_features` / `_merge_candidate_lists` でグラウンディング候補を統合
6. `_evaluate_motivation_internal` で LLM 評価（slot_status_v2, missing_slots, draft_readiness）
7. `_compute_deterministic_causal_gaps` + `_determine_next_turn` でターン計画を決定
8. `_build_progress_payload` で進捗ペイロードを組立

評価 LLM が失敗した場合、コンテキストは pre-capture 状態にロールバックする。`provider_failure` は 503、`parse_failure` は risk_flags に記録して続行する。

### 4.2 question.py: スロットフィル状態機械

question.py は 2 つのシステムプロンプト構築関数を持つ:

- `_build_motivation_question_system_prompt`: slot_fill 用。固定スロット、回答契約、エビデンスカードを含む
- `_build_motivation_deepdive_system_prompt`: deepdive 用。weakness_tag、補強制約を含む

**回答契約** (`ANSWER_CONTRACTS`): 各スロットに期待する回答形式、禁止論点、最低具体性、許容文数を定義。deepdive 用の追加契約もある。

**質問難易度レベル** (`_question_difficulty_level`): `stageAttemptCount` に応じて 1--3 の wording_level を決定。各スロットに 3 つのテンプレート質問 (`QUESTION_WORDING_BY_STAGE`) があり、レベルに応じて抽象度を調整する。

**質問組立** (`_assemble_regular_next_question_response`):
1. LLM 生成質問を `_repair_generated_question_for_response` でバリデーション
2. `_ensure_distinct_question` で重複排除（テキスト + 意味的重複）
3. `_retry_question_generation_if_needed` で失敗コードに応じた再生成
4. `_rotate_question_focus_for_reask` でフォーカスローテーション
5. `NextQuestionResponse` を組立（question_signature, semantic_question_signature, answer_contract 等）

### 4.3 validation.py: 重複質問防止とフォーカス正規化

**バリデーション** (`_validate_or_repair_question`): 以下の条件に一致した場合は fallback 質問に差し替える:
- 空の質問
- 汎用表現ブロックリスト（「もう少し詳しく」等）
- 指示文風 / UI コピー風の質問
- 複数パート質問（`？` が 2 つ以上）
- 他社名の言及
- 未確認の前提を使った質問
- 長すぎる質問
- ステージキーワード不足
- ステージ不一致（`company_reason` で「入社後」開始）

**意味的重複検出** (`_is_semantically_duplicate_question`): embeddings ベースのコサイン類似度。`settings.motivation_embedding_dedup` で有効化、閾値は `motivation_embedding_dedup_similarity_threshold` で制御。タイムアウト時は fail-open。

**フォーカス正規化** (`_normalize_question_focus`): 各スロットに許可されたフォーカス候補を定義し、LLM 出力のフォーカスが範囲外の場合はテキストベースで自動検出する。

### 4.4 context.py: 会話コンテキスト正規化

`_normalize_conversation_context` は会話コンテキスト dict を完全正規化する。70 以上のフィールドを扱い、以下を保証する:
- 旧フィールド名の統合（`originExperience` / `fitConnection` -> `selfConnection`）
- スロット状態の正規化（`filled` -> `filled_strong`）
- confirmedFacts の自動推定（明示的な confirmedFacts がない場合、スロット要約の存在から推定）
- openSlots / closedSlots の再計算
- forbiddenReasks / causalGaps のスキーマ正規化

**回答取り込み** (`_capture_answer_into_context`):
1. 回答テキストをスロットフィールドに保存
2. `_answer_is_confirmed_for_stage` でルールベースの確認判定
3. `_classify_slot_state` でスロット状態を判定（`empty` / `rough` / `sufficient`）
4. 未整理/矛盾検出時は reask budget を消費してスロットを保持、それ以外は `locked` に遷移
5. `forbiddenReasks` と `slotIntentsAsked` を更新

### 4.5 retry.py: 失敗分類とリトライ

**質問リトライ** (`_retry_question_generation_if_needed`): バリデーション失敗コード（`generic_blocklist`, `multi_part`, `too_long`, `missing_keyword`, `unconfirmed_premise`, `duplicate_text`, `duplicate_semantic`）に応じたヒントで 1 回だけ再生成する。

**下書き品質リトライ** (`_maybe_retry_for_draft_quality`): 文字数違反、AI smell 高スコア、企業キーワード不在を検出し、最大 2 回の品質リトライを実行する。

**マルチパス精錬** (`_apply_multipass_refinement`): 初回下書きに対して AI smell / 企業固有性 / 冒頭結論の 3 軸で検査し、問題があれば 1 回の精錬パスを実行する。精錬結果が文字数範囲外、または smell スコアが 0.3 以上悪化した場合は初回を採用する。

---

## 5. ストリーミングと BFF

### 5.1 stream_service.py: SSE 生成

`_generate_next_question_progress` が SSE ストリームを生成する。

```
company_name 検証
  |
  v
maybe_summarize_older_messages (20 件超で会話要約)
  |
  v
progress: rag (15%)
  |
  v
_prepare_motivation_next_question (評価 + ターン計画)
  |
  +-- is_complete かつ !was_draft_ready -> draft_ready_unlock_response
  +-- is_complete / was_draft_ready -> draft_ready_response
  |
  v
progress: evaluation (40%)
  |
  v
progress: question (65%)
  |
  v
call_llm_streaming_fields (質問生成)
  |-- string_chunk イベント (質問テキスト逐次)
  |-- error -> SSE error イベントで終了
  |-- complete -> llm_result
  |
  v
progress: finalize (85%)
  |
  v
_assemble_regular_next_question_response
  |
  v
complete イベント (NextQuestionResponse)
```

`streaming.py` は `stream_service.py` への互換シムで、既存テストのモンキーパッチを維持する。

### 5.2 BFF 中継と状態保存

BFF (`src/bff/motivation/`) は以下の責務を持つ:

1. **認証**: `getRequestIdentity` で identity 取得。`!userId` で 401（ログイン必須）
2. **owner 判定**: `buildMotivationOwnerCondition(companyId, userId, guestId)` で所有権検証
3. **レート制限**: `enforceRateLimitLayers` で会話ストリームのレート制限
4. **FastAPI 中継**: `CareerPrincipal` ヘッダ付きで FastAPI エンドポイントに proxy
5. **DB 保存**: FastAPI `complete` 受信後に会話メッセージと conversationContext を DB に保存
6. **クレジット消費**: 成功時のみ `motivationStreamPolicy.confirm()` で 1 クレジット消費

---

## 6. ES 下書き生成

### 6.1 会話ベース (generate-draft)

`POST /api/motivation/[companyId]/generate-draft`

1. 会話履歴の存在を検証（空なら 400）
2. 文字数制限: 300 / 400 / 500 字のいずれか
3. 入力サニタイズ（`_sanitize_generate_draft_request`）
4. 会話要約（20 件超）
5. 企業 RAG 取得 + grounding 解決
6. `build_template_draft_generation_prompt`（テンプレ種別 `company_motivation`）でプロンプト構築
7. `slotSummaries` と `slotEvidenceSentences` を一次材料として LLM に渡す（会話ログは三次材料）
8. 最大 3 回の LLM 呼び出し（指数バックオフ）
9. `_maybe_retry_for_draft_quality`（品質リトライ、最大 2 回）
10. `_apply_multipass_refinement`（精錬パス、最大 1 回）
11. 最終品質検査 (`_collect_draft_quality_failure_codes`)
12. ES 本文は改行なしの 1 段落に正規化 (`normalize_es_draft_single_paragraph`)

**再生成時**: `is_regeneration: true` の場合、一次材料に「直近の追加回答を優先し、未確認事実は増やさない」指示を追加する。

### 6.2 プロフィールベース (generate-draft-from-profile)

`POST /api/motivation/[companyId]/generate-draft-direct` -> FastAPI `/api/motivation/generate-draft-from-profile`

- 会話メッセージが空のときのみ利用可能
- ログイン必須
- 志望職種の指定が必須（空なら 400）
- プロフィールとガクチカの材料が薄い場合は生成を止め、対話あり導線へ戻す
- 品質リトライ・マルチパス精錬は会話ベースと同じパイプラインを使用

### 6.3 下書き品質チェック

| チェック項目 | 失敗コード | リトライヒント |
|---|---|---|
| 文字数下限（char_max * 0.9）| `under_char_min` | 情報密度を上げる |
| 文字数上限 | `over_char_max` | 冗長表現を削る |
| AI smell tier >= 2 | `ai_smell_high` | 定型句を避け、元の言い回しと具体行動を優先 |
| 企業キーワード不在 | `missing_company_keywords` | 企業固有要素を本文に含める |

---

## 7. リクエストライフサイクル

### 7.1 setup -> start -> stream -> generate-draft

1. **setup**: ページ遷移時に業界・職種を確定。業界解決は `src/lib/motivation/industry-resolution.ts` の `ResolvedIndustryState` を単一の真実にし、`MotivationSetupPanel` でチャット面に直接表示する
2. **start**: `POST /api/motivation/[companyId]/conversation/start` で setup を保存し、初回質問を生成・保存。フロントは `toRequestIndustry()` で解決済み業界を必ず送る。職種の選択元は UI source と保存用 source を分け、API 境界で保存用 source に変換する
3. **stream**: `POST /api/motivation/[companyId]/conversation/stream` で回答送信。FastAPI SSE を consume-and-re-emit し、保存とクレジット消費をここで行う
4. **generate-draft**: `POST /api/motivation/[companyId]/generate-draft` で 300/400/500 字の ES 下書きを生成。`documents` に draft ES を作成し、`draftDocumentId` に保持する

### 7.2 resume-deepdive フロー

`POST /api/motivation/[companyId]/resume-deepdive`

- draft_ready 到達後または ES 作成後にユーザーが追加深掘りを選んだ時だけ呼ぶ
- FastAPI `/api/motivation/next-question` を呼び、プロフィール・ガクチカ・志望職種候補も渡して deepdive 質問を取得する
- LLM を呼ぶため 1 クレジットを Reserve -> 成功 Confirm / 失敗 Cancel

### 7.3 エラーパス

| 段階 | 条件 | 結果 |
|---|---|---|
| BFF | 未認証 / ゲスト | 401 |
| BFF | クレジット不足 | 402 |
| BFF | 業界・職種 setup 未完了 | 400 |
| BFF | rate limit 超過 | 429 |
| Backend | 企業名未指定 | SSE error |
| Backend | LLM 呼び出し失敗 (provider) | 503 + `question_provider_failure` |
| Backend | LLM パース失敗 | 503 + `question_parse_failure`（fallback model で 1 回リトライ） |
| Backend | 評価 LLM provider 失敗 | 503 + コンテキストロールバック |
| Backend | 会話履歴なし（下書き生成時） | 400 |
| Backend | 文字数パラメータ不正 | 400 |
| Backend | career principal mismatch | 403 |
| Backend | SSE 同時接続制限 | 429 + `sse_concurrency_exceeded` |

---

## 8. フロントエンド

### 8.1 コンポーネント構成

```
src/app/(product)/companies/[id]/motivation/page.tsx
  |
  v
MotivationConversationContent
+-- useConversationRuntime + motivation-stream-adapter (SSE処理)
+-- MotivationSetupPanel (業界・職種確定 UI)
+-- ConversationWorkspaceShell (共通レイアウト)
+-- チャット UI (shared src/components/chat/)
|     メッセージ表示 + 自由入力
+-- MotivationConversationSidebar
|   +-- ConversationSidebar (共通サイドバー構成)
|   |     +-- ConversationProgressBar (共通、6スロットピル)
|   |     +-- ConversationPhaseBar (共通、ライフサイクル表示)
|   +-- CausalGapSteps / ProgressDetailSection (progressChildren)
|   +-- MotivationEvidenceSection (参考企業情報 + ユーザー情報)
+-- ConversationMobileStatus (共通モバイルステータス)
+-- DraftReadyCTA (共通、材料揃い CTA)
+-- ConversationRestartConfirmDialog (共通、会話やり直し確認)
+-- DraftPreviewModal (shared、ES生成完了後のモーダル)
```

### 8.2 進捗パネル (ピルバッジ + フェーズトラッカー)

共通 `ConversationProgressBar`（`src/components/chat/ConversationProgressBar.tsx`）がスロット進捗を表示する。ガクチカと同じ共通コンポーネントを使用し、データ駆動で機能別の内容を注入する。

**ピルバッジ**: 6 スロット（業界理由・企業理由・自己接続・希望業務・価値貢献・差別化）を 3 状態で表示:
- done (emerald): `StageStatus.completed` に含まれる
- current (sky): `StageStatus.current` と一致
- pending (muted): それ以外

深掘りモード時は、ピルバッジの代わりに `CausalGapStep` を `children` として表示する。

**フェーズトラッカー**: 共通 `ConversationPhaseBar`（`src/components/chat/ConversationPhaseBar.tsx`）がヒアリング中 / ES作成可 / 深掘り中 / 完了 の 4 段階を表示。フェーズラベルはガクチカと統一されており、`computePhaseItems()`（`src/lib/shared/conversation-lifecycle.ts`）が `StandardPhaseKey` から共通の `PhaseItem[]` を導出する。志望動機では `toStandardPhase()`（`MotivationConversationSidebar.tsx` 内）で `slot_fill` → `questioning`、draft_ready → `draft_ready`、deepdive → `deep_dive`、interview_ready → `completed` に変換する。

**カウンター**: slot_fill 時「N問目 / 約6問」、deepdive 時「N問目 / 補強中」。

**deepdive 時の補強フェーズ**: `conversationMode === "deepdive"` 時に各 causal gap をカード形式で全件表示（日本語スロット名 + 理由）。gap 残数バッジまたは「完了」バッジを表示する。

### 8.3 MotivationDraftModal

ES 生成成功後のフロー:

1. スナックバー -> モーダル (`MotivationDraftModal`) が表示される
2. 「ESエディタを開く」(primary) -> 生成時に作成済みの ES ドキュメント `/es/{docId}` に遷移
3. 「もっと深堀りして再生成する」(outline) -> モーダルを閉じ -> deepdive 会話が再開される
4. X ボタン / オーバーレイクリックは閉じるだけで、深掘り質問は開始しない
5. ES 生成は毎回新規 draft ドキュメントとして作成される

`resume-deepdive` で FastAPI が失敗した場合: モーダルは表示され（保存は可能）、エラーメッセージとリトライボタンが表示される。

---

## 9. 会話状態 (conversationContext)

`conversationContext` は BFF <-> FastAPI <-> フロントエンド間で流通する dict で、`_normalize_conversation_context` が正規化する。主要フィールド:

| フィールド | 型 | 説明 |
|---|---|---|
| `conversationMode` | `"slot_fill"` / `"deepdive"` | 現在の会話モード |
| `selectedIndustry` | string / null | 確定業界 |
| `selectedIndustrySource` | `"company_field"` / `"company_override"` / `"user_selected"` / null | 確定業界の解決元。BFF の `ResolvedIndustryState` から設定する |
| `selectedRole` | string / null | 確定職種 |
| `selectedRoleSource` | `"profile"` / `"company_doc"` / `"application_job_type"` / `"user_free_text"` / null | 保存用の職種解決元。`industry_default` などの UI source は API 境界で変換する |
| `industryReason` | string / null | 業界志望理由テキスト |
| `companyReason` | string / null | 企業志望理由テキスト |
| `selfConnection` | string / null | 自分との接続テキスト |
| `desiredWork` | string / null | やりたい仕事テキスト |
| `valueContribution` | string / null | 価値発揮テキスト |
| `differentiationReason` | string / null | 差別化テキスト |
| `confirmedFacts` | dict[str, bool] | 各スロットの確認状態 |
| `openSlots` | list[str] | 未確認スロット一覧 |
| `closedSlots` | list[str] | 確認済みスロット一覧 |
| `questionStage` | string | 現在のスロット |
| `stageAttemptCount` | int | 現スロットの再質問回数 |
| `lastQuestionMeta` | dict / null | 前回質問のメタ情報 |
| `draftReady` | bool | ES 作成可能フラグ |
| `draftReadyUnlockedAt` | string / null | draft_ready 解放時刻 (JST ISO) |
| `slotStates` | dict[str, str] | 内部スロット状態 (empty/rough/sufficient/locked) |
| `slotSummaries` | dict[str, str / null] | 各スロットの回答要約 |
| `slotEvidenceSentences` | dict[str, list[str]] | 各スロットの根拠文 |
| `slotIntentsAsked` | dict[str, list[str]] | 各スロットで聞いた intent 一覧 |
| `forbiddenReasks` | list[dict] | 再質問禁止リスト |
| `causalGaps` | list[dict] | deepdive の causal gap 一覧 |
| `weakSlotRetries` | dict[str, int] | filled_weak スロットの再質問回数 |
| `reaskBudgetBySlot` | dict[str, int] | 各スロットの再質問予算 |
| `turnCount` | int | 全体ターン数 |
| `deepdiveTurnCount` | int | deepdive ターン数 |

`applyConversationPayload` は `Partial<ConversationPayload>` 対応で、`"key" in` ガードにより未指定フィールドは既存 state を保持する。

---

## 10. 課金・認証

### 認証ルール

- **ログインユーザー**: 全機能利用可能
- **ゲスト**: 利用不可。BFF `conversation/stream` が `!userId` で 401 を返す。`generate-draft` も `!userId` で 401
- **owner 判定**: `buildMotivationOwnerCondition(companyId, userId, guestId)` で所有権を検証。ログインユーザーのみがアクセスするが、内部実装では `userId` と `guestId` の排他的管理を前提とした共通関数を使用している

### クレジット消費テーブル

| 操作 | feature キー | コスト | 方式 |
|---|---|---|---|
| 会話ストリーム（1 ターン） | `motivation` | 1 credit | post-success 消費（Reserve なし） |
| 下書き生成（会話あり） | `motivation_draft` | 6 credits | Reserve -> Confirm / Cancel |
| 下書き生成（会話なし） | `motivation_draft` | 6 credits | Reserve -> Confirm / Cancel |
| 深掘り再開 | `motivation_resume_deepdive` | 1 credit | Reserve -> Confirm / Cancel |

失敗時は消費しない（成功時のみ消費のビジネスルールに従う）。

---

## 11. テスト

### Draft Validation Profile

志望動機下書きの品質リトライは `LENIENT_PROFILE` の best-effort 方針に従う。文字数不足・企業キーワード不足などの soft failure は、リトライ後も残る場合に `telemetry.best_effort_adopted=true` として採用可能にし、hard block に相当する空本文・断片・自己否定・企業敬称混入は従来どおり failure として返す。

### テスト層

| 層 | コマンド | 内容 |
|---|---|---|
| Unit (Backend) | `python -m pytest backend/tests/motivation -q` | 26 テストファイル (~3,628 行) |
| Architecture | `python -m pytest backend/tests/architecture/ -q` | サービス層の境界分離 |
| Unit (Frontend) | `npm run test:unit` | コンポーネント + lib テスト |
| E2E | `make test-e2e-functional-local AI_LIVE_LOCAL_FEATURES=motivation` | ブラウザ統合テスト |

### 主要テストファイル

| ファイル | 内容 |
|---|---|
| `test_motivation_question_validation.py` | 質問バリデーション + fallback |
| `test_motivation_context_normalize.py` | コンテキスト正規化 |
| `test_motivation_retry.py` | リトライ + 品質検査 |
| `test_motivation_streaming.py` | SSE ストリーミング |
| `test_motivation_prompts.py` | プロンプト構造検証 |
| `test_generate_draft_from_profile.py` | プロフィールベース生成 |
| `test_motivation_draft_selection.py` | 下書き選択ロジック |
| `test_motivation_embedding_dedup.py` | 意味的重複検出 |
| `test_motivation_unresolved_patterns.py` | 未整理パターン検出 |
| `test_p4_2_semantic_confirm.py` | LLM による回答確認 |
| `test_p4_3_confidence_scoring.py` | confidence スコアリング |
| `test_p4_4_multipass_refinement.py` | マルチパス精錬 |
| `test_p4_5_slot_summary_injection.py` | スロット要約注入 |
| `test_p4_6_evidence_cards_in_question.py` | エビデンスカード連携 |

---

## 12. 主要ファイル一覧（クイックリファレンス）

| カテゴリ | ファイル | 行数 |
|---|---|---|
| **Backend Services** | `backend/app/services/motivation/facade.py` | ~793 |
| | `backend/app/services/motivation/question.py` | ~1,027 |
| | `backend/app/services/motivation/context.py` | ~780 |
| | `backend/app/services/motivation/validation.py` | ~665 |
| | `backend/app/services/motivation/pipeline.py` | ~639 |
| | `backend/app/services/motivation/draft.py` | ~594 |
| | `backend/app/services/motivation/retry.py` | ~583 |
| | `backend/app/services/motivation/company.py` | ~505 |
| | `backend/app/services/motivation/prompt_fmt.py` | ~303 |
| | `backend/app/services/motivation/models.py` | ~269 |
| | `backend/app/services/motivation/stream_service.py` | ~227 |
| | `backend/app/services/motivation/planner.py` | ~209 |
| | `backend/app/services/motivation/summarize.py` | ~141 |
| | `backend/app/services/motivation/sanitizers.py` | ~88 |
| | `backend/app/services/motivation/contract.py` | ~57 |
| **Router Facades** | `backend/app/routers/motivation*.py` (15 ファイル) | 各 ~11 |
| **BFF** | `src/bff/motivation/` (8 route ファイル + stream-service) | -- |
| | `src/bff/billing/motivation-stream-policy.ts` | ~65 |
| **Frontend Lib** | `src/lib/motivation/` (19 ファイル) | ~2,161 |
| **Frontend Components** | `src/components/motivation/` (13 ファイル) | ~1,449 |
| **Tests** | `backend/tests/motivation/` (26 ファイル) | ~3,628 |

---

## 補足: 関連ドキュメント

- ES 添削: `docs/features/ES_REVIEW.md`
- ガクチカ深掘り: `docs/features/GAKUCHIKA_DEEP_DIVE.md`
- 集客 LP: `src/app/(marketing)/shiboudouki-ai/page.tsx`
- プロンプト設計: `docs/features/AI_PROMPTS.md`
