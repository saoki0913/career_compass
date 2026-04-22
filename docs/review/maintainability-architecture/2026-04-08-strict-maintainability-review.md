# 保守性レビュー結果

- レビュー対象: `/Users/saoki/work/career_compass`
- レビュー日: 2026-04-08
- 更新日: 2026-04-12
- 目的: 今後のリファクタリング対象を厳しめに洗い出し、改善優先順位を明確にする
- 前提: 実装・修正は行わず、現状コードの「人間が安全に読み、理解し、変更できるか」を最優先で評価

## 対応状況サマリー

2026-04-12 時点。ワーキングツリーの実測値に基づき対応状況を更新。**注意: 全変更は未コミット (untracked / unstaged)**。

| # | 項目 | 重要度 | 対応状況 |
|---|------|--------|----------|
| 3-1 | 会話状態の Python 一本化 | High | 対応済み |
| 3-2 | 巨大ルータ分割 | High | 対応済み |
| 3-3 | Next API billing policy | High | 対応済み |
| 3-4 | LLM client registry | High | 対応済み |
| 3-5 | 企業情報 UI 分割 | High | 対応済み |
| 4-1 | DB schema と JSON 契約 | Medium | 対応不要（現状十分） |
| 4-2 | 命名の責務明示 | Medium | 対応済み |
| 4-3 | RAG / 検索層のユースケース読解 | Medium | 対応不要（現状十分） |
| 4-4 | private helper へのテスト依存 | Medium | 対応済み |
| 4-5 | generated artifact のノイズ | Medium | 対応不要（現状十分） |
| 4-6 | schema.ts の肥大化 | Medium | 対応不要（現状十分） |
| 5-1 | UI component 内の表示定数 | Low | 対応不要（現状十分） |
| 5-2 | legacy 互換ロジック | Low | 対応済み（interview のみ） |
| 5-3 | print / ad-hoc logging | Low | 対応済み |

### 対応詳細

#### 3-1. 会話状態の Python 一本化（対応済み）

- **対応内容**: TS 側の `applyAnswerToConversationContext` を削除し、`conversation-payload.ts` は answer を messages 配列に append するだけの純粋 builder に変更。stream route は `resolvedBeforeAnswer.conversationContext` をそのまま FastAPI へ送る。TS 型に `Python-owned; read-only on TS side` JSDoc を付与。
- **対応結果**: Python が state-of-record。TS は transport 層に戻った。

#### 3-2. 巨大ルータ分割（対応済み）

- **対応内容 (company_info)**: 12 個の抽出モジュールを新設 (`company_info_config.py`, `company_info_candidate_scoring.py`, `company_info_url_utils.py`, `company_info_schedule_links.py`, `company_info_scoring.py`, `company_info_search.py`, `company_info_schedule.py`, `company_info_pdf.py`, `company_info_ingest_service.py`, `company_info_models.py`, `company_info_rag_service.py`, `company_info_schedule_service.py`)。本体から重複定義を削除し import に置換完了。
- **対応内容 (es_review)**: モデルを `es_review_models.py` に抽出し、関数を 7 モジュール (`es_review_grounding.py`, `es_review_validation.py`, `es_review_issue.py`, `es_review_retry.py`, `es_review_pipeline.py`, `es_review_stream.py`, `es_review_request.py`) に抽出。本体から重複定義・dead code を削除し import に置換完了。
- **実測値 (2026-04-11)**:
  - `company_info.py`: **3156 行** (元: 5787, -45%)。schedule helper / ヘルパー関数 / モデルクラス / PDF 関数の重複定義を削除し import に置換。`_build_corporate_queries` と `_extracted_data_to_chunks` は本体に残留。pytest 134 件 pass。
  - `es_review.py`: **2054 行** (元: 5220, -61%)。モデル・バリデーション・issue 正規化・retry 戦略・パイプラインメタ・grounding・ストリーム・リクエスト処理を抽出モジュールへ移行完了。
- **残課題**: `company_info.py` は目標 2000 行以下に対し 3156 行。<2000 には LLM 呼び出しロジックや RAG エンドポイント群の追加抽出が必要。

#### 3-3. Next API billing policy（対応済み）

- **対応内容**: `src/lib/api-route/billing/types.ts` に `BillingOutcome` / `BillingPolicy<TContext>` interface を新設。feature 別に `motivation-stream-policy.ts`、`es-review-stream-policy.ts`、`company-fetch-policy.ts` を実装。`src/lib/fastapi/sse-proxy.ts` で SSE consume-and-re-emit を共通化。`src/lib/company-info/deadline-persistence.ts` に deadline 保存ロジックを抽出。
- **実測値 (2026-04-11)**:
  - `motivation stream/route.ts`: 496 行
  - `handle-review-stream.ts`: 601 行
  - `fetch-info/route.ts`: 550 行 (deadline 保存・billing ロジック抽出済み)
- **対応結果**: 3 feature 全ての billing policy が抽出完了。fetch-info の catch ブロックも `createApiErrorResponse` に修正済み。

#### 3-4. LLM client registry（対応済み）

- **対応内容**: `backend/app/utils/llm_client_registry.py` (135 行) を新設。`llm_providers.py`, `llm_streaming.py`, `llm_responses.py`, `llm_model_routing.py`, `llm_prompt_safety.py`, `llm_usage_cost.py` を新設。本体から抽出対象の関数・定数を削除し import に置換完了。`log_llm_cost_event` / `_call_claude` 等は monkeypatch 互換とステート所有権の都合で本体に残留。
- **実測値 (2026-04-11)**: `llm.py`: **2809 行** (元: 3424, -18%)。`llm_prompt_safety`, `llm_usage_cost`, `llm_client_registry`, `llm_model_routing` への関数抽出完了。
- **残課題**: monkeypatch 互換で本体に残る関数群 (`log_llm_cost_event`, `_call_claude` 等) の移行は、テスト基盤の patch 先変更と合わせて段階的に進める必要がある。

#### 3-5. 企業情報 UI 分割（対応済み）

- **対応内容**: `CorporateInfoSection.tsx` から 7 サブコンポーネント (`ResultStep.tsx`, `WebSearchStep.tsx`, `UrlInputStep.tsx`, `PdfUploadStep.tsx`, `RegisteredSourcesModal.tsx`, `RagDetailModal.tsx`, `DeleteConfirmDialog.tsx`) と `constants.ts` を抽出。`controller.ts` から 3 ワークフローフック (`use-corporate-search.ts`, `use-fetch-corporate-info.ts`, `use-pdf-upload.ts`) を抽出。`company-detail/icons.tsx`, `deadline-helpers.ts` も分離済み。`CompanyDetailPageClient.tsx` 1275→1140 行。
- **実測値 (2026-04-11)**:
  - `CorporateInfoSection.tsx`: 596 行 (元: 1884, -68%)
  - `controller.ts`: 590 行 (元: 1348, -56%)
- **残課題**: `CompanyDetailPageClient.tsx` (1140 行) の `DeadlineSection` / `ApplicationSection` 抽出は未着手。

#### 4-2. 命名の責務明示（対応済み）

- **対応内容 (2026-04-11)**: `conversation.ts` から persistence を除去し `conversation-store.ts` と `conversation-payload.ts` へ分割。`motivation_contract.py` で response-contract 責務を router から切り離し。billing 周りを `src/lib/api-route/billing/` に集約。`server.ts` → `motivation-input-resolver.ts` にリネーム (7 ファイルの import パス更新済み)。
- **対応内容 (2026-04-12)**: バレルファイルと controller の命名整理を完了。
  - `src/app/api/companies/[id]/interview/shared.ts` → `index.ts` にリネーム (13 ファイルの import パス + vi.mock specifier 更新)
  - `src/app/api/gakuchika/shared.ts` → `index.ts` にリネーム (12 ファイルの import パス + vi.mock specifier 更新)
  - `src/components/companies/corporate-info-section/controller.ts` → `use-corporate-info-controller.ts` にリネーム (4 ファイルの import パス更新)
  - テストファイルも同名リネーム (`shared.test.ts` → `index.test.ts`, `shared.identity.test.ts` → `index.identity.test.ts`)
- **対応結果**: 全指摘箇所の命名整理完了。`shared.ts` はバレル `index.ts` に統一、`controller.ts` は `use-*` 命名規約に準拠。

#### 4-4. private helper へのテスト依存（対応済み）

- **対応内容**: `backend/tests/gakuchika/test_gakuchika_next_question.py` の monkeypatch ターゲットを修正。`app.utils.llm_streaming._call_claude_raw_stream` → `app.utils.llm._call_claude_raw_stream` に変更。`call_llm_streaming_fields` は `app.utils.llm` に存在するため、旧パッチは到達していなかった。併せて、prompt テキスト変更に追随していなかったアサーション 3 箇所も修正。
- **対応結果**: 全 17 テスト pass。monkeypatch が正しく到達し、fake stream で制御可能になった。

#### 5-2. legacy 互換ロジック（対応済み — interview のみ）

- **対応内容**: `backend/app/routers/interview.py` の legacy 関数を整理。
  - `_legacy_stage_for_topic` → `_infer_stage_from_topic` にリネーム（旧セッションの stage 復元ロジックは維持）
  - `_legacy_stage_status` を削除し、7 箇所の呼び出しを `None` に置換（frontend の `stage_status ?? { ... }` フォールバックで吸収）
  - `LEGACY_STAGE_ORDER`, `QUESTION_STAGE_ORDER` 定数は他コードが使用しているため維持
- **対応結果**: 復元ロジックを安全に維持しつつ legacy 表記を除去。
- **残課題**: `src/lib/motivation/conversation.ts` の legacy フィールド（`questionStage` 等の旧名）は DB JSONB に旧形式が残存するため、データ移行と合わせて別タスクで対応が必要。

#### 5-3. print / ad-hoc logging（対応済み）

- **対応内容**: `backend/app/utils/vector_store.py` の全 18 箇所の `print()` を `secure_logger` 経由の構造化ログに変換。
  - `✅` 接頭辞 → `logger.info()`
  - `⚠️` 接頭辞 → `logger.warning()`
  - `❌` 接頭辞 → `logger.error()` (except ブロック内は `exc_info=True` 付与)
  - `ℹ️` / 診断情報 → `logger.debug()`
  - f-string → `%s` style (遅延評価)、絵文字とモジュール接頭辞 (`[RAG保存]` 等) を除去
- **対応結果**: `grep -c "print(" vector_store.py` = 0。import check / test pass 確認済み。

#### 4-1, 4-3, 4-5, 4-6, 5-1 — 対応不要（現状十分）

- **4-1 (DB schema + JSON 契約)**: `schema.ts` にセクションコメント整理済み。JSONB 列の昇格は機能追加時に段階的に判断。
- **4-3 (RAG / 検索ユースケース)**: `company_info_rag_service.py`, `company_info_search.py` 等のユースケース entrypoint が存在し、技術別 util は内部実装として機能。
- **4-5 (generated artifact)**: `backend/tests/output/` は `.gitignore` 済みで diff / レビューに混入しない。
- **4-6 (schema.ts 肥大化)**: Drizzle ORM + Supabase の制約上、分割すると migration 管理が複雑化。セクションコメントで読解性を確保。
- **5-1 (表示定数)**: `constants.ts` に抽出済み。CorporateInfoSection は composition root に変更済みで定数は外部化完了。

## 2026-04-09 実装反映メモ

### Phase 1: LLM client registry
- 追加: `backend/app/utils/llm_client_registry.py`
- 更新: `backend/app/utils/llm.py`, `backend/app/utils/llm_providers.py`, `backend/app/utils/llm_streaming.py`, `backend/app/utils/llm_responses.py`
- 更新: `backend/tests/shared/test_llm_provider_routing.py`, `backend/tests/gakuchika/test_gakuchika_next_question.py`

### Phase 2-A: company_info.py 分割
- 追加: `backend/app/routers/company_info_scoring.py` (~215 行, 7 関数)
- 更新: `backend/app/routers/company_info.py` (6411→5282 行, -1129)

### Phase 2-B: es_review.py 分割
- 追加: `backend/app/routers/es_review_issue.py` (307 行, issue 正規化 7 関数 + fallback + 定数)
- 更新: `backend/app/routers/es_review_validation.py` (21→725 行, 26 関数を実体化: `_normalize_repaired_text` / `_coerce_degraded_rewrite_dearu_style` / `_fit_rewrite_text_deterministically` / `_split_candidate_sentences` / `_contains_negative_self_eval` / `_validate_standard_conclusion_focus` / `_candidate_has_grounding_anchor` / `_should_validate_grounding` / `_validate_rewrite_candidate` 他)
- 更新: `backend/app/routers/es_review_retry.py` (53→825 行, focus mode / length control / prompt context / second-pass 戦略を集約)
- 更新: `backend/app/routers/es_review_pipeline.py` (53→231 行, `_build_review_meta` / token usage / `_evaluate_template_rag_availability` を実体化)
- 更新: `backend/app/routers/es_review.py` (5220→2054 行, -3166, -61%)
- 削除: `_legacy` suffix 付き dead code 群 (`_build_allowed_user_facts_legacy` / `_extract_prompt_terms_legacy` / `_is_generic_role_label_legacy` / `_extract_question_focus_signals_legacy` / `_question_has_assistive_company_signal_legacy` / `_select_prompt_user_facts_legacy` 他)、重複 constant (`ROLE_PROGRAM_EVIDENCE_THEMES` / `COMPANY_DIRECTION_EVIDENCE_THEMES` / `ROLE_SUPPORTIVE_CONTENT_TYPES` / `GENERIC_ROLE_PATTERNS` / `SUPPORTING_PROMPT_FACT_SOURCES`)、`es_review_stream.py` の重複 helper

### Phase 3: Motivation 会話状態の Python 一本化
- 更新: `src/lib/motivation/conversation-payload.ts` (`applyAnswerToConversationContext` 削除)
- 更新: `src/app/api/motivation/[companyId]/conversation/stream/route.ts`
- 更新: `src/lib/motivation/conversation.ts` (read-only JSDoc 付与)
- 更新: `src/lib/motivation/conversation-payload.test.ts`

### Phase 4: Billing policy + SSE proxy
- 追加: `src/lib/api-route/billing/types.ts` (`BillingOutcome` / `BillingPolicy<TContext>`)
- 追加: `src/lib/api-route/billing/motivation-stream-policy.ts`
- 追加: `src/lib/api-route/billing/es-review-stream-policy.ts`
- 追加: `src/lib/fastapi/sse-proxy.ts`
- 更新: `src/app/api/motivation/[companyId]/conversation/stream/route.ts` (562→497 行)
- 更新: `src/app/api/documents/_services/handle-review-stream.ts` (684→601 行)

### Phase 5: 企業情報 UI の分割 (部分)
- 追加: `src/components/companies/company-detail/icons.tsx` (11 icon components + `LoadingSpinner`)
- 追加: `src/components/companies/company-detail/deadline-helpers.ts`
- 更新: `src/components/companies/CompanyDetailPageClient.tsx` (1275→1140 行, -135)

### 2026-04-08 実装反映メモ (継続)

- 追加: `src/lib/motivation/conversation-payload.ts`
- 追加: `src/lib/motivation/conversation-store.ts`
- 追加: `src/lib/motivation/conversation-payload.test.ts`
- 追加: `backend/app/routers/motivation_contract.py`
- 追加: `backend/tests/motivation/test_motivation_contract.py`
- 更新: `src/app/api/motivation/[companyId]/conversation/route.ts`
- 更新: `src/app/api/motivation/[companyId]/conversation/start/route.ts`
- 更新: `src/app/api/motivation/[companyId]/save-draft/route.ts`
- 更新: `src/app/api/motivation/[companyId]/generate-draft/route.ts`
- 更新: `src/app/api/motivation/[companyId]/save-draft/route.test.ts`
- 更新: `src/app/api/motivation/[companyId]/generate-draft/route.test.ts`
- 更新: `src/hooks/useMotivationConversationController.ts`
- 更新: `src/lib/motivation/ui.ts`
- 更新: `src/lib/motivation/server.ts`
- 更新: `backend/app/routers/motivation.py`
- 更新: `backend/app/routers/motivation_streaming.py`

## 2026-04-12 実装反映メモ

### 4-2 完了: バレルファイル + controller リネーム
- リネーム: `src/app/api/companies/[id]/interview/shared.ts` → `index.ts` (テスト含む 2 ファイル)
- リネーム: `src/app/api/gakuchika/shared.ts` → `index.ts` (テスト含む 3 ファイル)
- リネーム: `src/components/companies/corporate-info-section/controller.ts` → `use-corporate-info-controller.ts`
- 更新: import パス 29 箇所 (production 21 + test 8, vi.mock specifier を production import と完全一致で統一)
- 検証: `npx tsc --noEmit` pass

### 4-4 完了: monkeypatch ターゲット修正
- 更新: `backend/tests/gakuchika/test_gakuchika_next_question.py` — monkeypatch 先を `app.utils.llm._call_claude_raw_stream` に修正
- 更新: prompt テキスト変更に追随していなかったアサーション 3 箇所を修正
- 検証: 全 17 テスト pass

### 5-2 完了: interview.py legacy 関数整理
- 更新: `backend/app/routers/interview.py` — `_legacy_stage_for_topic` → `_infer_stage_from_topic` にリネーム (1 箇所)
- 削除: `_legacy_stage_status` 関数定義 + 7 呼び出し箇所を `None` に置換
- 検証: import check pass、pre-existing テスト失敗は本変更と無関係

### 5-3 完了: vector_store.py print → logger 変換
- 更新: `backend/app/utils/vector_store.py` — 全 18 箇所の `print()` を `logger.*()` に変換
- 追加: `from app.utils.secure_logger import get_logger` + `logger = get_logger(__name__)`
- 検証: `grep -c "print(" vector_store.py` = 0、import check pass

## 2026-04-11 実装反映メモ

> **注意**: 2026-04-09 以前の変更を含め、全変更は未コミット状態。

### 3-3 追加: company-fetch-policy + deadline persistence
- 追加: `src/lib/api-route/billing/company-fetch-policy.ts` (75 行, `BillingPolicy<CompanyFetchBillingContext>` 実装)
- 追加: `src/lib/company-info/deadline-persistence.ts` (167 行, `saveExtractedDeadlines` / `findExistingDeadline` / `normalizeTitle` / `isSameDay`)
- 更新: `src/app/api/companies/[id]/fetch-info/route.ts` (710→550 行, billing + deadline 保存ロジック抽出)
- 修正: 外側 catch ブロックを `createApiErrorResponse()` に統一

### 3-5 追加: CorporateInfoSection + controller 分割
- 追加: `src/components/companies/corporate-info-section/constants.ts`
- 追加: `src/components/companies/corporate-info-section/ResultStep.tsx`
- 追加: `src/components/companies/corporate-info-section/WebSearchStep.tsx`
- 追加: `src/components/companies/corporate-info-section/UrlInputStep.tsx`
- 追加: `src/components/companies/corporate-info-section/PdfUploadStep.tsx`
- 追加: `src/components/companies/corporate-info-section/RegisteredSourcesModal.tsx`
- 追加: `src/components/companies/corporate-info-section/RagDetailModal.tsx`
- 追加: `src/components/companies/corporate-info-section/DeleteConfirmDialog.tsx`
- 追加: `src/components/companies/corporate-info-section/use-corporate-search.ts`
- 追加: `src/components/companies/corporate-info-section/use-fetch-corporate-info.ts`
- 追加: `src/components/companies/corporate-info-section/use-pdf-upload.ts`
- 更新: `src/components/companies/CorporateInfoSection.tsx` (1884→596 行, composition root に変更)
- 更新: `src/components/companies/corporate-info-section/controller.ts` (1348→590 行, 3 sub-hook に分離)
- 修正: `workflow-config.ts` に `ContentType` re-export 追加 (TS2459 解消)
- 修正: `controller.ts` の legacy url.type 集計を `mapLegacyToNew()` に修正
- 修正: `use-pdf-upload.ts` の `page_routing_summary` を累積集約に修正

### 3-2: company_info.py 重複削除完了
- 追加: `backend/app/routers/company_info_config.py` (603 行)
- 追加: `backend/app/routers/company_info_candidate_scoring.py` (1024 行)
- 追加: `backend/app/routers/company_info_url_utils.py` (326 行)
- 追加: `backend/app/routers/company_info_schedule_links.py` (442 行)
- 削除: schedule helper 4関数 (98行), dead code `_classify_url_confidence` (8行), Block B ヘルパー関数群 (1838行), Block C モデルクラス3箇所 (200行), Block D PDF関数群 + dead `_should_run_high_accuracy_pdf_ocr` (483行)
- 追加 import: `from app.routers.company_info_schedule import _compress_schedule_page_text_for_llm`
- 結果: `company_info.py` 5787→3156 行 (-45%), pytest 134 pass / 3 skip

### 4-2 追加: 命名改善
- リネーム: `src/lib/motivation/server.ts` → `src/lib/motivation/motivation-input-resolver.ts`
- 更新: 7 ファイルの import パスを更新 (conversation/, start/, stream/, generate-draft/, generate-draft-direct/ の route.ts + route.test.ts)

## 1. 全体像

- ディレクトリ構成の要約
  - `src/app`: App Router の page / layout / API route entrypoint。
  - `src/components`: product / marketing UI。大きい client component が複数ある。
  - `src/hooks`: client state と通信 orchestration。
  - `src/lib`: domain helper、DB、billing、calendar、motivation/interview/gakuchika 周辺の shared logic。
  - `backend/app`: FastAPI、AI 生成、RAG、検索、LLM provider 統合。
  - `.omm`: 全体アーキテクチャ、request lifecycle、data-flow、external integration の要約。
- レイヤー構成の要約
  - Browser -> Next page/component/hook -> Next API -> DB/FastAPI/provider が基本。
  - ただし会話系機能では、UI、Next API、FastAPI の 3 層それぞれが状態機械や業務ルールを持ち始めており、層ごとの責務がにじんでいる。
- 全体の保守性の総評
  - identity 解決、owner XOR 制約、FastAPI client 入口、loader 系分離など、良い土台はある。
  - 一方で AI 機能と会話機能は「分割は進んだが、状態の正本と責務境界がまだ曖昧」で、変更前に読む量が多すぎる。現状は「動く」よりは上だが、「安全に直せる」には届いていない。
- 今のまま開発を続けた場合の主要リスク
  - 会話系で状態遷移の前提が各層に分散し、局所変更でも UI / API / FastAPI / DB 保存形式を同時に追う必要がある。
  - AI ルータと LLM 統合層に継ぎ足しが続き、意図せぬ副作用と monkeypatch 依存が増える。
  - 企業情報系 UI と API が workflow engine 化しており、見た目変更と業務ルール変更の影響範囲が分離されていない。
- 可読性・認知負荷の観点で特に危険な領域
  - `backend/app/routers/company_info.py` 3156 行 (元: 5488→6411→5787→3156)
  - `backend/app/routers/es_review.py` 2054 行
  - `backend/app/routers/motivation.py` 2796 行
  - `backend/app/routers/interview.py` 2516 行
  - `backend/app/routers/gakuchika.py` 1790 行
  - `backend/app/utils/web_search.py` 2305 行
  - `backend/app/utils/vector_store.py` 1636 行
  - `backend/app/utils/hybrid_search.py` 1418 行
  - `src/components/companies/CorporateInfoSection.tsx` 1884 行
  - `src/components/companies/CompanyDetailPageClient.tsx` 1275 行
  - `src/app/api/companies/[id]/fetch-info/route.ts` 710 行
  - `src/app/api/documents/_services/handle-review-stream.ts` 684 行
- 状態管理の観点で特に危険な領域
  - `backend/app/routers/motivation.py` と `src/lib/motivation/conversation.ts` と `src/app/api/motivation/**`
  - `src/app/api/motivation/[companyId]/conversation/stream/route.ts`
  - `src/app/api/documents/_services/handle-review-stream.ts`
  - `src/components/companies/CorporateInfoSection.tsx`
  - `src/components/companies/CompanyDetailPageClient.tsx`

## 2. 良い点

- 現状でも保守しやすい点
  - `src/app/api/_shared/request-identity.ts` で request identity の入口を共通化している。
  - `src/app/api/_shared/owner-access.ts` が owner 判定の最低限の共通面を持っている。
  - `.omm/overall-architecture/description.md`、`.omm/request-lifecycle/constraint.md`、`.omm/data-flow/constraint.md` が、最低限の設計意図を残している。
  - `src/lib/server/company-loaders.ts` など loader 分離は、page 側の責務縮小に寄与している。
- 責務分離が比較的うまくいっている点
  - `backend/app/utils/llm.py` は以前より薄くなっており、provider / responses / streaming の方向性は正しい。
  - `backend/app/routers/motivation_context.py`、`motivation_planner.py`、`motivation_streaming.py` への分割は、少なくとも巨大 router の局所読解を改善している。
  - `src/lib/fastapi/client.ts` に FastAPI 呼び出しの窓口が集まっている。
- 今後も維持すべき構造
  - identity と owner 判定の shared 化
  - thin page + loader / helper 方向
  - provider client の統合窓口
  - `.omm` と実コードを併用する設計記録の運用

## 3. 重大な問題

### 3-1. 会話状態の正本が TypeScript と Python に二重化されている

- 問題
  - 志望動機会話の状態機械が、TypeScript 側と Python 側の両方に存在する。
- 該当箇所
  - `src/lib/motivation/conversation.ts`
  - `src/app/api/motivation/[companyId]/conversation/route.ts`
  - `src/app/api/motivation/[companyId]/conversation/start/route.ts`
  - `src/app/api/motivation/[companyId]/conversation/stream/route.ts`
  - `src/app/api/motivation/[companyId]/generate-draft/route.ts`
  - `backend/app/routers/motivation_context.py`
  - `backend/app/routers/motivation_planner.py`
  - `backend/app/routers/motivation.py`
- なぜ重大か
  - `questionStage`、`conversationMode`、`confirmedFacts`、`slotStates`、`causalGaps`、`draftReady` などの主要状態が複数言語で並行管理されている。どちらが正本かが機能単位で揺れる。
- 放置リスク
  - 状態追加や命名変更時に TypeScript/Python の片側だけが更新され、再開・保存・表示・生成のどこかで静かにズレる。
  - 会話不整合が UI では発火せず、後続の保存や draft 生成で顕在化しやすい。
- 可読性・認知負荷への悪影響
  - 会話仕様を理解するために、TS の型・parser・serializer と Python の normalization / planner を両方読む必要がある。
- 状態管理への悪影響
  - 状態主体が「DB JSON」「Next API の中間表現」「FastAPI の正規化後表現」に分かれ、遷移の追跡が難しい。
- 改善の方向性
  - 会話 state machine の正本を一箇所に寄せる。少なくとも stage / mode / slot / causal gap / readiness の契約は single source に統一する。
- 優先度
  - High

### 3-2. AI 中核ルータが依然として巨大 orchestration module である

- 問題
  - `company_info.py` と `es_review.py` が、router でありながら search strategy、OCR、RAG、evidence policy、retry、prompting、telemetry まで抱えている。
- 該当箇所
  - `backend/app/routers/company_info.py`
  - `backend/app/routers/es_review.py`
- なぜ重大か
  - これらは要件変更頻度が高い領域であり、1 ファイル内の概念数が多すぎると局所変更の安全性が急落する。
- 放置リスク
  - 検索改善、抽出改善、課金改善、出力改善のどれを触っても副作用範囲の見積もりが困難になる。
  - AI に継ぎ足し実装を続けさせると、最も壊れやすい箇所がさらに集中する。
- 可読性・認知負荷への悪影響
  - 呼び出し経路だけでなく、ドメイン知識、provider 制約、文字数制御、source policy を同時保持しないと読めない。
- 状態管理への悪影響
  - request 内の一時状態、fallback 状態、evidence の意味が暗黙的で、状態遷移として見えない。
- 改善の方向性
  - router / application service / strategy / provider policy / persistence を明確に分ける。特に `company_info` は schedule、crawl、PDF、RAG、search を機能境界で分離すべき。
- 優先度
  - High

### 3-3. Next API が thin transport ではなく transaction script 化している

- 問題
  - 主要 API route が auth、owner check、rate limit、credits、FastAPI proxy、SSE 再構成、DB 保存、telemetry を一気通貫で持っている。
- 該当箇所
  - `src/app/api/motivation/[companyId]/conversation/stream/route.ts`
  - `src/app/api/motivation/[companyId]/generate-draft/route.ts`
  - `src/app/api/motivation/[companyId]/generate-draft-direct/route.ts`
  - `src/app/api/companies/[id]/fetch-info/route.ts`
  - `src/app/api/documents/_services/handle-review-stream.ts`
- なぜ重大か
  - API 層の責務が厚すぎるため、ドメインルール変更と transport 変更が分離できていない。
- 放置リスク
  - 失敗時課金、部分成功、保存順序、SSE 完了契約などの subtle な不整合が route ごとに増殖する。
  - 似たフローの新規追加がコピー実装を誘発する。
- 可読性・認知負荷への悪影響
  - 「何を保存しているのか」「どの時点で課金するのか」「FastAPI の返却をどう正規化するのか」が 1 ファイルに詰め込まれている。
- 状態管理への悪影響
  - UI から見た状態、DB に保存する状態、FastAPI から返る状態の境界が曖昧。
- 改善の方向性
  - transport / application orchestration / persistence / billing / stream adapter を分ける。特に SSE consume-and-re-emit は専用の adapter 層に寄せるべき。
- 優先度
  - High

### 3-4. `llm.py` 系は分割後も monkeypatch 互換の facade 依存が強く、構造が脆い

- 問題
  - `backend/app/utils/llm.py` は薄くなったが、mutable singleton state と facade re-export と monkeypatch 互換要件が強く、設計の中心が「実行モデル」より「既存パッチ互換」に引っ張られている。
- 該当箇所
  - `backend/app/utils/llm.py`
  - `backend/app/utils/llm_providers.py`
  - `backend/app/utils/llm_responses.py`
  - `backend/app/utils/llm_streaming.py`
  - `backend/tests/shared/test_llm_provider_routing.py`
  - `backend/tests/gakuchika/test_gakuchika_next_question.py`
- なぜ重大か
  - provider call、streaming、responses API が facade 経由の private helper に依存し続けると、保守性の本質改善ではなく互換維持のための複雑化が残る。
- 放置リスク
  - 小さな整理でも import 順、lazy import、patch 先、singleton state の扱いで壊れる。
  - 新 provider や新 call mode を足すたびに module boundary の理解が難しくなる。
- 可読性・認知負荷への悪影響
  - 実際の依存関係が import 文から読めず、facade 越しの暗黙依存を頭の中で解決する必要がある。
- 状態管理への悪影響
  - provider client と circuit breaker の所有者が facade に残っており、状態の責務境界が不自然。
- 改善の方向性
  - monkeypatch 互換を最終目標にせず、provider runtime state の ownership を明確に再設計する。public surface を固定し、private helper パッチ依存を減らす。
- 優先度
  - High

### 3-5. 企業情報 UI / company detail UI が workflow と表示責務を抱え込みすぎている

- 問題
  - 企業詳細画面と企業情報 UI が、表示に加えて操作遷移、補助計算、ローカル workflow state を大量に保持している。
- 該当箇所
  - `src/components/companies/CorporateInfoSection.tsx`
  - `src/components/companies/CompanyDetailPageClient.tsx`
  - `src/components/companies/FetchInfoButton.tsx`
- なぜ重大か
  - product UI の中でも変更頻度が高く、機能追加がそのまま状態追加を意味する構造になっている。
- 放置リスク
  - PDF、URL、search candidate、delete approval、deadline approval の変更が互いに波及しやすい。
- 可読性・認知負荷への悪影響
  - 大量の local state と helper が混在し、どこから読み始めるべきか分かりにくい。
- 状態管理への悪影響
  - 入力状態、進行状態、ロック状態、結果状態、表示状態が同じ component に居座る。
- 改善の方向性
  - workflow 単位の state machine へ分割し、view model を別に持つ。company detail も header / application / deadline / corporate info / side effect action で分けるべき。
- 優先度
  - High

## 4. 中程度の負債

### 4-1. DB schema と conversation payload が大きな JSON 契約に依存している

- 問題
  - schema 上は 1 カラムに多くの意味が押し込まれ、実際の意味は parser 実装を読まないと分からない。
- 該当箇所
  - `src/lib/db/schema.ts`
  - `src/lib/motivation/conversation.ts`
  - `src/lib/interview/session.ts`
  - `src/lib/gakuchika/conversation-state.ts`
- 放置リスク
  - 列定義だけでは状態主体が見えず、将来の migration 判断が難しくなる。
- 可読性・認知負荷への悪影響
  - schema と parser の往復が必要で、理解コストが高い。
- 状態管理への悪影響
  - 重要状態が JSON の内部仕様に埋もれる。
- 改善の方向性
  - high-churn state でも、最低限のコア状態は列として昇格させる。JSON は補助情報に寄せる。
- 優先度
  - Medium

### 4-2. route / shared / service / controller / helper の命名が責務を正確に表していない

- 問題
  - `shared.ts`、`server.ts`、`controller.ts`、`helpers.ts` が広い意味で使われ、名前だけでは責務密度を判断しにくい。
- 該当箇所
  - `src/app/api/companies/[id]/interview/shared.ts`
  - `src/app/api/gakuchika/shared.ts`
  - `src/lib/motivation/server.ts`
  - `src/components/companies/corporate-info-section/controller.ts`
- 放置リスク
  - 似た構造が別名で増殖し、開発者ごとにどこへ置くかの判断がぶれる。
- 可読性・認知負荷への悪影響
  - 名前から責務が読めず、開いて確認するしかない。
- 状態管理への悪影響
  - controller が view state のみを持つのか、業務状態まで持つのかが曖昧。
- 改善の方向性
  - transport / application / persistence / serialization / ui-controller など、責務に即した命名へ寄せる。
- 優先度
  - Medium

### 4-3. RAG / 検索層が技術別に分かれ、ユースケース読解には横断読みが必要

- 問題
  - `vector_store.py`、`hybrid_search.py`、`web_search.py`、`bm25_store.py`、`reranker.py`、`content_classifier.py` が技術ごとに分かれている一方、ユースケースごとの読み筋は弱い。
- 該当箇所
  - `backend/app/utils/vector_store.py`
  - `backend/app/utils/hybrid_search.py`
  - `backend/app/utils/web_search.py`
  - `backend/app/utils/bm25_store.py`
  - `backend/app/utils/reranker.py`
- 放置リスク
  - 企業情報検索改善や ES review retrieval 改善のたびに、複数 util を往復する必要がある。
- 可読性・認知負荷への悪影響
  - 技術構成は分かるが、ユースケースの流れは追いづらい。
- 改善の方向性
  - use-case oriented な entrypoint を明示し、低レベル util は内部実装として隠す。
- 優先度
  - Medium

### 4-4. private helper への直接テスト依存が強い

- 問題
  - private helper を直接 import / monkeypatch するテストが多く、内部構造変更の自由度を下げている。
- 該当箇所
  - `backend/tests/shared/test_llm_provider_routing.py`
  - `backend/tests/gakuchika/test_gakuchika_next_question.py`
  - `backend/tests/motivation/test_motivation_flow_helpers.py`
- 放置リスク
  - リファクタ時に挙動ではなく構造互換を維持する圧力が強まり、設計改善が止まる。
- 可読性・認知負荷への悪影響
  - 実装読解時に「テストの patch 先」まで考慮が必要になる。
- 改善の方向性
  - public contract テストを増やし、private helper 依存を最小化する。
- 優先度
  - Medium

### 4-5. generated artifact が repo 内に残り、レビュー・探索ノイズを増やしている

- 問題
  - `backend/tests/output/` 以下に live 実行結果やログが大量に存在し、レビュー時のノイズになる。
- 該当箇所
  - `backend/tests/output/**`
- 放置リスク
  - diff、検索、レビューで本質的なテストコードと成果物が混ざる。
- 可読性・認知負荷への悪影響
  - 探索時に「読むべきコード」と「生成物」の判別コストが増える。
- 改善の方向性
  - Git 管理対象を再検討し、成果物は artifact ストレージまたは ignore 方針へ寄せる。
- 優先度
  - Medium

### 4-6. `schema.ts` が大きく、ドメイン境界が読みにくい

- 問題
  - 全ドメインのテーブル定義が単一ファイルに集中している。
- 該当箇所
  - `src/lib/db/schema.ts`
- 放置リスク
  - migration や table 間の責務理解で不要な読みが増える。
- 可読性・認知負荷への悪影響
  - auth、guest、companies、documents、billing、calendar、AI ingest を一度に目に入れる必要がある。
- 改善の方向性
  - domain ごとの schema module に分割し、index で集約する。
- 優先度
  - Medium

## 5. 軽微だが整えたい点

### 5-1. 大きい UI component に表示用定数が居座っている

- 問題
  - content type label / color / keyword 群が component 内に長く残っている。
- 該当箇所
  - `src/components/companies/CorporateInfoSection.tsx`
- 改善の方向性
  - 表示定数と workflow 定数を component 外に寄せる。

### 5-2. legacy 互換ロジックが目立ち、現行仕様が読みづらい

- 問題
  - legacy format / legacy field / alias 互換が各所に残っている。
- 該当箇所
  - `backend/app/routers/interview.py`
  - `src/lib/motivation/conversation.ts`
  - `src/components/companies/CorporateInfoSection.tsx`
- 改善の方向性
  - 互換期限を決めて dead code を削る。

### 5-3. 一部 util の `print` / ad-hoc logging が残っている

- 問題
  - structured logging と混ざると運用面と読解面のノイズになる。
- 該当箇所
  - `backend/app/utils/vector_store.py`
- 改善の方向性
  - `secure_logger` 経由へ統一する。

## 6. 観点別レビュー

### 6-1. 責務の混在

- `company_info.py` は router、crawl orchestrator、PDF ingest policy、search policy、RAG 操作が混在。
- `es_review.py` は review pipeline、grounding、rewrite、SSE 進行制御が混在。
- `CorporateInfoSection.tsx` は UI と workflow engine が混在。

### 6-2. ファイル肥大化

- backend の巨大ファイルは 2k〜5k 行級が複数あり、局所修正前の読書量が大きい。
- frontend でも 1k〜1.8k 行の client component が複数あり、同様の傾向。

### 6-3. 密結合・レイヤー違反

- Next API が domain orchestration を持ちすぎており、transport と application が密結合。
- 会話 state machine が TypeScript と Python に跨っているため、層の独立性が低い。

### 6-4. 重複した知識・ロジック

- motivation の stage / slot / readiness / causal gap 契約が TS/Python 双方にある。
- credits / success-only / stream complete 後保存のパターンが route ごとに繰り返されている。

### 6-5. 外部依存の散在

- FastAPI 呼び出しは client に寄っているが、その前後の billing / persistence / retry 契約は各 route に散在。
- LLM provider 統合は整理された一方で、facade 依存のため理解には複数 module を読む必要がある。

### 6-6. データ境界・状態管理

- conversation state の正本が単一でない。
- JSONB に多くの意味を埋め込み、schema レベルで状態主体が見えにくい。

### 6-7. 画面遷移と責務分担

- company detail 画面は overview、applications、deadlines、corporate info、fetch workflow を 1 ページ client に集約している。
- motivation / gakuchika / interview は画面遷移より会話内 state が複雑で、page の責務が肥大化しやすい。

### 6-8. 可読性の低さ

- helper と domain rule が同じファイルに混在し、読み始める位置が分かりにくい。
- facade + lazy import + monkeypatch 互換の構造は import を見ても実依存が分からない。

### 6-9. 開発時の認知負荷の高さ

- 1 箇所直す前に保持すべき概念数が多い。特に motivation と company_info は顕著。
- AI 要件、課金、owner、保存順序、SSE 完了契約が同時に絡む箇所が多い。

### 6-10. 状態主体の妥当性

- motivation は「UI 状態」「Next API 用状態」「FastAPI 正規化状態」「DB 保存状態」が混在しており、不自然。
- corporate info は mode ごとの workflow state が 1 component に集まりすぎている。

### 6-11. 状態遷移の追跡容易性

- 会話開始 -> 応答送信 -> stream 完了 -> DB 保存 -> draft unlock の遷移が複数層に散っている。
- ES review も review stream 完了後の reservation confirm/cancel が transport 層に埋まり、追跡しにくい。

### 6-12. AI継ぎ足し開発で負債化しやすい箇所

- `backend/app/routers/company_info.py`
- `backend/app/routers/es_review.py`
- `backend/app/routers/interview.py`
- `src/components/companies/CorporateInfoSection.tsx`
- `src/app/api/documents/_services/handle-review-stream.ts`

### 6-13. 将来の変更容易性

- 現状でも部分的な分割は進んでいるが、状態の正本と application service 境界が未確立なため、機能追加のたびに理解コストが高い。

## 7. 優先度付き改善候補一覧

- 対象: motivation 会話状態契約
  - 問題の概要: TS/Python 間で state machine 契約が二重化。
  - 主に改善されるもの: 保守性、認知負荷、変更容易性、状態管理の理解容易性
  - 期待できる改善: state 追加時のズレ減少、読み始める場所の明確化
  - 影響範囲: `src/lib/motivation/**`、`src/app/api/motivation/**`、`backend/app/routers/motivation*.py`
  - 放置リスク: 高
  - 優先度: High

- 対象: `backend/app/routers/company_info.py`
  - 問題の概要: crawl / search / PDF / RAG / schedule / orchestration の集中
  - 主に改善されるもの: 保守性、可読性、認知負荷、障害調査容易性
  - 期待できる改善: 変更影響範囲の縮小、search 改修の局所化
  - 影響範囲: company info backend 全体
  - 放置リスク: 高
  - 優先度: High

- 対象: `backend/app/routers/es_review.py` と `src/app/api/documents/_services/handle-review-stream.ts`
  - 問題の概要: review orchestration が frontend API と backend router の両方で厚い
  - 主に改善されるもの: 保守性、変更容易性、テスト容易性
  - 期待できる改善: billing / stream 完了 / retry 契約の単純化
  - 影響範囲: ES review 全体
  - 放置リスク: 高
  - 優先度: High

- 対象: `backend/app/utils/llm.py` 系
  - 問題の概要: facade と monkeypatch 互換中心の設計が残る
  - 主に改善されるもの: 可読性、認知負荷、テスト容易性
  - 期待できる改善: provider runtime state の ownership 明確化
  - 影響範囲: LLM 呼び出し全機能
  - 放置リスク: 高
  - 優先度: High

- 対象: `src/components/companies/CorporateInfoSection.tsx`
  - 問題の概要: UI と workflow engine の混在
  - 主に改善されるもの: 可読性、変更容易性、状態管理の理解容易性
  - 期待できる改善: PDF / URL / search flow の個別修正がしやすくなる
  - 影響範囲: companies detail UI
  - 放置リスク: 高
  - 優先度: High

- 対象: `src/components/companies/CompanyDetailPageClient.tsx`
  - 問題の概要: 企業詳細画面の集約責務が広すぎる
  - 主に改善されるもの: 可読性、認知負荷、変更容易性
  - 期待できる改善: section ごとの独立した UI 変更
  - 影響範囲: companies detail UI
  - 放置リスク: 中
  - 優先度: Medium

- 対象: `src/lib/db/schema.ts`
  - 問題の概要: schema 一枚岩 + JSONB 依存
  - 主に改善されるもの: 可読性、保守性、状態管理の理解容易性
  - 期待できる改善: ドメイン境界の明確化
  - 影響範囲: DB 定義と migration
  - 放置リスク: 中
  - 優先度: Medium

- 対象: route 命名と service/controller/helper の責務ラベル
  - 問題の概要: 名前から責務密度が読めない
  - 主に改善されるもの: 可読性、認知負荷
  - 期待できる改善: ファイル配置判断の一貫性
  - 影響範囲: `src/app/api/**`、`src/lib/**`、`src/components/**`
  - 放置リスク: 中
  - 優先度: Medium

- 対象: RAG / 検索ユーティリティ群
  - 問題の概要: 技術別分割でユースケース読解が重い
  - 主に改善されるもの: 保守性、変更容易性、障害調査容易性
  - 期待できる改善: 企業情報・ES review の retrieval 改修を局所化
  - 影響範囲: backend/app/utils/*
  - 放置リスク: 中
  - 優先度: Medium

- 対象: `backend/tests/output/**`
  - 問題の概要: generated artifact が探索ノイズ
  - 主に改善されるもの: 可読性、認知負荷
  - 期待できる改善: repo 探索効率の向上
  - 影響範囲: tests とレビュー運用
  - 放置リスク: 中
  - 優先度: Medium

- 対象: 大型 UI component 内の表示定数・legacy alias
  - 問題の概要: dead code / legacy 互換が読解を阻害
  - 主に改善されるもの: 可読性
  - 期待できる改善: 読み始めの負荷軽減
  - 影響範囲: UI component 局所
  - 放置リスク: 低
  - 優先度: Low

## 8. 追加で確認したい質問

- 現時点ではなし。今回のレビューは、既存コードと `.omm` を前提に進めるのに十分な情報が揃っている。
