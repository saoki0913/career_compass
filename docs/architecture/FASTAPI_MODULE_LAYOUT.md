# FastAPI Module Layout

就活Pass の FastAPI 側は、router に endpoint と最小限の orchestration だけを残し、Pydantic schema、contract builder、streaming、domain helper を責務単位で分ける。

## 目的

- 1 ファイルに AI feature のプロンプト構築、LLM 呼び出し、レスポンス整形、SSE、永続化補助が集まる状態を避ける。
- route 変更時の影響範囲を読み取りやすくし、レビューと pytest の対象を絞れるようにする。
- prompt / LLM provider / streaming / domain logic の境界を明確にし、出力品質や leakage 防止の変更を局所化する。

## 基本ルール

- `router.py` または既存 router ファイルは endpoint と orchestration のみを持つ。目安は 800 行以下。
- `*_models.py` は request / response / internal DTO など Pydantic schema を持つ。
- `*_contract.py` は API response の組み立て、frontend に返す shape の正規化、互換フィールドの集約を持つ。
- `*_streaming.py` は SSE event 生成、stream lifecycle、partial result handling を持つ。
- domain helper は `slot_engine`、`prompt_builder`、`quality_gate`、`selection_parser` など責務名で分ける。
- provider 固有処理は `backend/app/utils/llm_*.py` に寄せ、feature router から低レベル SDK を直接扱わない。
- prompt 本体は `backend/app/prompts/**` に残す。router や util へ prompt 文を分散させない。

## 実績パターン

### motivation

`motivation.py` は endpoint / orchestration を中心にし、会話の判定、retry、draft、summary、streaming を周辺モジュールへ分けている。M-3 時点では約 700 行で、AI feature router の分割後の基準例とする。

主な分割先:

- `motivation_models.py`: API schema
- `motivation_streaming.py`: stream response と progress event
- `motivation_pipeline.py`: 会話進行の orchestration helper
- `motivation_question.py`: 次質問生成
- `motivation_retry.py`: retry / fallback path
- `motivation_draft.py`: draft 生成
- `motivation_summarize.py`: summary 生成
- `motivation_sanitizers.py`: user input sanitization

### company_info

`company_info.py` は endpoint を薄くし、検索、LLM 抽出、スケジュール抽出、PDF / corporate enrichment を分割している。M-3 時点では約 400 行で、外部 I/O と AI 呼び出しを route から切り離す基準例とする。

主な分割先:

- `company_info_models.py`: API schema
- `company_info_llm_extraction.py`: LLM extraction
- `company_info_schedule_service.py`: selection schedule extraction
- `company_info_pdf.py`: PDF ingest / extraction
- `company_info_rag.py`: RAG source handling
- `company_info_*_service.py`: 外部 I/O や enrich 処理

## LLM Utilities

`backend/app/utils/llm.py` は高レベル orchestration に限定する。

残す責務:

- `call_llm_with_error`
- `call_llm_text_with_error`
- JSON repair orchestration
- request-level cost log wrapper
- 既存 route の public compatibility surface

分割先:

- `llm_providers.py`: provider client、SDK 呼び出し、エラー分類、JSON parse helper
- `llm_responses.py`: OpenAI Responses API、refusal、PDF OCR
- `llm_streaming.py`: token / field streaming
- `llm_model_routing.py`: model alias、provider routing、fallback model
- `llm_usage_cost.py`: token / cost estimation、request summary state
- `llm_prompt_safety.py`: prompt sanitization、output leakage detection
- `llm_client_registry.py`: client cache、circuit breaker

## 今後の分割候補

### gakuchika

`gakuchika.py` は質問生成、深掘り状態、streaming、draft 生成、quality gate を分ける。既存の `gakuchika_question_pipeline.py` は question orchestration の受け皿として維持し、route から LLM prompt assembly と retry policy を追い出す。

推奨分割:

- `gakuchika_models.py`
- `gakuchika_streaming.py`
- `gakuchika_question_pipeline.py`
- `gakuchika_draft.py`
- `gakuchika_quality.py`

### interview

`_interview/` 配下の endpoints / generators 構造を正本にし、面接質問生成、回答評価、最終講評、calibration helper を route から分ける。LLM judge や rubric は domain helper として isolation する。

推奨分割:

- `_interview/models.py`
- `_interview/endpoints.py`
- `_interview/generators.py`
- `_interview/feedback.py`
- `_interview/rubric.py`

## 変更時チェック

- route が 800 行を超える変更では、追加前に helper へ切り出す。
- `backend/app/utils/llm.py` に provider 固有 SDK 呼び出しを戻さない。
- output quality に影響する変更では、対象 feature の pytest と AI output audit path を明記する。
- prompt 本体変更が必要な場合は `backend/app/prompts/**` の変更として扱い、prompt edit confirmation flow に乗せる。
