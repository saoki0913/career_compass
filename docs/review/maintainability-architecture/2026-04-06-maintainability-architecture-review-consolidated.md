# 保守性レビュー結果

- レビュー対象: `/Users/saoki/work/career_compass`
- レビュー日: 2026-04-06
- 目的: 今後のリファクタリング対象を厳しめに洗い出し、改善優先順位を明確にする

## 対応状況（2026-04-08）

- 注記
  - このセクションを現在の対応状況の正本とする。以降のレビュー本文は 2026-04-06 時点の指摘スナップショットとして残しているため、行数・行番号・「未対応」前提の記述にはリファクタ前の情報が含まれる。
- 対応結果一覧


| 項目                                                                         | 優先度    | 今回の対応内容                                                                                                                                                                                                                                                  | 対応結果 | 残課題 / 次フェーズ                                                           |
| -------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------- |
| `src/app/api/companies/[id]/interview/shared.ts`                           | High   | `context.ts` / `persistence.ts` / `serialization.ts` / `types.ts` へ分割し、`shared.ts` は facade 化                                                                                                                                                            | 完了   | route 互換は維持。次は page/controller と合わせた domain service 境界の再整理            |
| `src/app/api/gakuchika/shared.ts`                                          | Medium | `state.ts` / `access.ts` / `fastapi-stream.ts` へ分割し、`shared.ts` は facade 化                                                                                                                                                                               | 完了   | dirty worktree との互換を優先したため public shape は据え置き。次は route 単位の依存整理        |
| `src/lib/server/app-loaders.ts`                                            | Medium | `loader-helpers.ts` と `company` / `document` / `dashboard` / `activation` loaders へ縦分割し、`app-loaders.ts` を再 export に変更                                                                                                                                   | 完了   | preload/view model の再編は次フェーズ                                          |
| `src/lib/calendar/sync.ts`                                                 | Medium | `sync-persistence.ts` / `sync-provider.ts` / `sync-queue.ts` / `sync-types.ts` へ分割し、`sync.ts` を facade 化                                                                                                                                                 | 完了   | provider adapter の純粋化と job state のより明確な model 化は次フェーズ                 |
| `src/lib/credits/index.ts`                                                 | Medium | `shared.ts` / `monthly-reset.ts` / `balance.ts` / `reservations.ts` へ分割し、`index.ts` は互換 export に変更                                                                                                                                                       | 完了   | transaction history read/model の独立は次フェーズ                              |
| `src/hooks/useESReview.ts`                                                 | High   | `es-review/transport.ts` を新設し、SSE consume と transport 境界を hook 本体から分離                                                                                                                                                                                    | 完了   | 次は controller 化や UI state reducer 化まで進める余地あり                          |
| `backend/app/utils/llm.py`                                                 | High   | `llm_prompt_safety.py` / `llm_usage_cost.py` / `llm_model_routing.py` / `llm_providers.py` / `llm_responses.py` / `llm_streaming.py` を新設し、provider 呼び出し・Responses API・ストリーミングを完全分離。`llm.py` は mutable state + orchestrator + facade re-export (902行) に縮小 | 完了   | `_resolve_openai_model` 潜在バグも修正済み。テスト `test_extract_pdf_openai.py` 追加 |
| `backend/app/utils/llm_model_routing.py`                                   | Medium | `get_model_config` / `get_model_display_name` / `resolve_feature_model_metadata` / `_resolve_model_target` を外出しし、`llm.py` は facade として re-export する形へ寄せた                                                                                                 | 完了   | client 初期化や call 実装は次フェーズ                                             |
| `backend/app/routers/motivation.py`                                        | High   | `motivation_sanitizers.py` / `motivation_models.py` / `motivation_context.py` / `motivation_planner.py` / `motivation_streaming.py` を新設し、コンテキスト正規化・フロー制御・SSE ストリーミングを完全分離。`motivation.py` はエンドポイント + プロンプト構築 + facade re-export (2,796行) に縮小             | 完了   | monkeypatch 互換維持済み。owner 条件重複も `buildMotivationOwnerCondition()` に統一  |
| `backend/app/routers/motivation_models.py`                                 | Medium | `Message` / `MotivationScores` / `NextQuestionRequest` / `NextQuestionResponse` などの Pydantic model を外出しし、`motivation.py` は re-export facade に寄せた                                                                                                         | 完了   | router 本体の planner / streaming / context normalization は次フェーズ         |
| `backend/app/routers/es_review.py`                                         | High   | `es_review_models.py` / `es_review_request.py` / `es_review_grounding.py` / `es_review_stream.py` に加えて、`es_review_pipeline.py` / `es_review_retry.py` / `es_review_validation.py` を新設し、rewrite orchestration と route entrypoint を facade 化               | 完了   | import / monkeypatch 互換は維持。validation / retry helper の更なる純粋化は任意の次フェーズ |
| `backend/app/routers/company_info.py`                                      | High   | `company_info_models.py` / `company_info_schedule.py` / `company_info_search.py` に加えて、`company_info_schedule_service.py` / `company_info_rag_service.py` / `company_info_ingest_service.py` を新設し、schedule / RAG / PDF / crawl orchestration を service 化  | 完了   | 検索周りの低レベル helper は既存のまま維持。大きい search route の更なる分割は次フェーズ               |
| `src/lib/db/schema.ts` の JSON text 状態                                      | Medium | `motivation_conversations` / `interview_conversations` / `interview_feedback_histories` の対象列を `jsonb` 化し、read/write helper と persistence を structured value 前提へ更新。`drizzle_pg/0018_conversation_jsonb.sql` を追加                                           | 完了   | structured columns の追加細分化は必要になった段階で別判断                                |
| `src/components/companies/CorporateInfoSection.tsx`                        | High   | `corporate-info-section/controller.ts` を新設し、web/url/pdf/delete、confirm、upload progress、modal transition、operation lock を controller へ集約                                                                                                                  | 完了   | UI 表現は維持。次は必要に応じて controller の reducer 化を検討                           |
| `src/lib/interview/session.test.ts`                                        | Medium | `normalizeInterviewTurnState()` の legacy `discussion_main` 互換テストを、型安全な legacy payload 経由の表現に修正                                                                                                                                                           | 完了   | runtime 挙動は不変。`normalizeFormatPhase()` の legacy 互換確認を維持               |
| `src/app/api/motivation/[companyId]/conversation/route.ts` DELETE owner 条件 | Low    | インライン owner 条件を `buildMotivationOwnerCondition()` に置換し、不要になった `and` import を削除                                                                                                                                                                           | 完了   | —                                                                     |
| `src/components/companies/CorporateInfoSection.tsx` インライン SVG アイコン         | Low    | 12 個のインライン SVG アイコンを `corporate-info-section/icons.tsx` へ抽出                                                                                                                                                                                              | 完了   | `lint:ui:guardrails` で新規違反なし                                          |
| `backend/app/utils/llm_responses.py` `_resolve_openai_model` 潜在バグ          | Medium | `extract_text_from_pdf_with_openai` が `model=None` 時に `_resolve_openai_model` を呼ぶが import 漏れだった問題を修正。`test_extract_pdf_openai.py` を新設                                                                                                                    | 完了   | —                                                                     |


### 今回対応項目一覧


| 項目                                                         | 対応前                                                                 | 今回の対応                                                                                                                                | テスト/確認                                                                                                                                                                                                                                                                                                                                                                                                                     | 対応結果 | 残課題                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------- |
| `backend/app/utils/llm.py`                                 | prompt safety / cost utility / model routing 分離済み                   | `llm_providers.py` (1,177行) / `llm_responses.py` (625行) / `llm_streaming.py` (419行) を新設し `llm.py` を 902行 の facade + orchestrator に縮小 | `pytest -q backend/tests/shared/test_llm_provider_routing.py test_llm_message_normalization.py test_extract_pdf_openai.py` / `pytest -q backend/tests/gakuchika/test_gakuchika_next_question.py` / `pytest -q backend/tests/interview/test_interview_streaming.py` / `pytest -q backend/tests/motivation/test_motivation_streaming.py` / smoke import テスト                                                                  | 完了   | —                                      |
| `backend/app/routers/motivation.py`                        | sanitize / models 分離済み                                              | `motivation_context.py` (767行) / `motivation_planner.py` (203行) / `motivation_streaming.py` (248行) を新設し `motivation.py` を 2,796行 に縮小 | `pytest -q backend/tests/motivation/test_motivation_flow_helpers.py test_motivation_streaming.py` / smoke import テスト                                                                                                                                                                                                                                                                                                       | 完了   | —                                      |
| `src/app/api/motivation/[companyId]/conversation/route.ts` | DELETE メソッドにインライン owner 条件                                          | `buildMotivationOwnerCondition()` に置換、不要 `and` import 削除                                                                             | TypeScript 型チェック                                                                                                                                                                                                                                                                                                                                                                                                           | 完了   | —                                      |
| `src/components/companies/CorporateInfoSection.tsx`        | 12 個のインライン SVG アイコン                                                 | `corporate-info-section/icons.tsx` へ抽出                                                                                               | `npm run lint:ui:guardrails` (新規違反なし)                                                                                                                                                                                                                                                                                                                                                                                      | 完了   | —                                      |
| `backend/app/utils/llm_responses.py`                       | `_resolve_openai_model` import 漏れ                                   | 明示 import 追加 + `test_extract_pdf_openai.py` 新設 (3テスト)                                                                                | `pytest -q backend/tests/shared/test_extract_pdf_openai.py`                                                                                                                                                                                                                                                                                                                                                                | 完了   | —                                      |
| `backend/app/routers/es_review.py`                         | helper 分離までで orchestration が残存                                      | `es_review_pipeline.py` / `es_review_retry.py` / `es_review_validation.py` を追加し、rewrite orchestration と route entrypoint を facade 化  | `pytest -q backend/tests/es_review/test_es_review_template_repairs.py backend/tests/es_review/test_es_review_template_rag_policy.py backend/tests/es_review/test_es_review_prompt_structure.py backend/tests/es_review/test_reference_es_quality.py`                                                                                                                                                                       | 完了   | retry / validation helper の更なる純粋関数化は任意 |
| `backend/app/routers/company_info.py`                      | helper / model 分離までで schedule / RAG / PDF / crawl orchestration が残存 | `company_info_schedule_service.py` / `company_info_rag_service.py` / `company_info_ingest_service.py` を追加し、router を facade 化         | `pytest -q backend/tests/company_info/test_schedule_search_policy.py backend/tests/company_info/test_upload_pdf_ingestion.py backend/tests/company_info/test_web_search_staged.py`                                                                                                                                                                                                                                         | 完了   | 検索 route の更なる分割は任意                     |
| `src/lib/db/schema.ts` と会話 persistence                     | JSON text に依存                                                       | conversation/interview 関連列を `jsonb` 化し、route/persistence を structured value 書き込みへ更新                                                  | `npm run test:unit -- src/lib/interview/conversation.test.ts src/lib/motivation/conversation.test.ts` / `npm run test:unit -- 'src/app/api/motivation/[companyId]/generate-draft/route.test.ts' 'src/app/api/motivation/[companyId]/generate-draft-direct/route.test.ts'` / `npm run test:unit -- 'src/app/api/companies/[id]/interview/start/route.test.ts' 'src/app/api/companies/[id]/interview/serialization.test.ts'` | 完了   | 列の意味単位での追加細分化は別途検討                     |
| `src/components/companies/CorporateInfoSection.tsx`        | component 内に workflow state が集中                                     | `controller.ts` へ workflow / confirm / upload / modal / lock を集約                                                                     | `npm run lint:ui:guardrails` / `npm run test:unit -- src/components/companies/CorporateInfoSection.test.ts` / `npm run test:ui:review -- '/companies/[id]'`                                                                                                                                                                                                                                                                | 完了   | controller の reducer 化は任意              |


- 完了
  - `src/app/(product)/companies/[id]/motivation/page.tsx`: setup / conversation / draft 生成 / playback の一体化を解消する初回スライスとして、会話状態・SSE・draft 操作を controller と client API helper へ分離済み。
  - `src/app/api/motivation/[companyId]/conversation/*` と `src/app/api/motivation/[companyId]/generate-draft/route.ts`: owner 判定、conversation 作成、職種候補取得、setup 判定、role source 解決の重複を `src/lib/motivation/server.ts` へ集約済み。
  - `src/components/companies/CorporateInfoSection.tsx`: 初回スライスとして、純粋 helper と client API helper を `src/components/companies/corporate-info-section/` 配下へ分離済み。対象は URL parse、PDF draft file 操作、見積表示、status meta、fetch-corporate/search/compliance/estimate/upload/delete の client API 境界。
  - `src/app/(product)/companies/[id]/interview/page.tsx`: 初回スライスとして、hydrate、SSE stream、start/send/feedback/continue/reset/satisfaction、persistence diagnostic、setup/role selection 状態を `src/hooks/useInterviewConversationController.ts` へ分離済み。client fetch 境界は `src/lib/interview/client-api.ts`、client-safe 型・表示定数・純粋 helper は `src/lib/interview/ui.ts` へ分離済み。
  - `src/app/(product)/gakuchika/[id]/page.tsx`: 初回スライスとして、会話取得、summary polling、SSE stream、streaming playback、session resume/restart、ES draft 生成、operation lock 連携を `src/hooks/useGakuchikaConversationController.ts` へ分離済み。client fetch 境界は `src/lib/gakuchika/client-api.ts`、client-safe 型・表示定数・純粋 helper は `src/lib/gakuchika/ui.ts` へ分離済み。
  - `src/app/api/companies/[id]/interview/shared.ts`: `context.ts` / `persistence.ts` / `serialization.ts` / `types.ts` へ本格分割済み。`shared.ts` は route 互換 facade に縮小済み。
  - `src/app/api/gakuchika/shared.ts`: `state.ts` / `access.ts` / `fastapi-stream.ts` へ本格分割済み。`shared.ts` は route 互換 facade に縮小済み。
  - `src/lib/server/app-loaders.ts`: `loader-helpers.ts` と domain 別 loader (`company-loaders.ts`, `document-loaders.ts`, `dashboard-loaders.ts`, `activation-loaders.ts`) へ分割済み。
  - `src/lib/calendar/sync.ts`: queue / persistence / provider / types の 4 モジュールへ分割済み。
  - `src/lib/credits/index.ts`: monthly reset / balance / reservations / shared constants へ分割済み。
  - `src/hooks/useESReview.ts`: `src/hooks/es-review/transport.ts` へ SSE parse / consume と transport の責務を分離済み。hook は UI state と orchestration 中心へ縮小済み。
- 完了（2026-04-08 追加分）
  - `backend/app/utils/llm.py`: `llm_providers.py` (1,177行) / `llm_responses.py` (625行) / `llm_streaming.py` (419行) を新設し、provider 呼び出し・OpenAI Responses API・SSE ストリーミングを完全分離。`llm.py` は 902行 の mutable state + orchestrator + facade re-export に縮小。`_resolve_openai_model` import 漏れの潜在バグも修正し、`test_extract_pdf_openai.py` を追加。
  - `backend/app/routers/motivation.py`: `motivation_context.py` (767行) / `motivation_planner.py` (203行) / `motivation_streaming.py` (248行) を新設し、コンテキスト正規化・フロー制御・SSE ストリーミングを完全分離。`motivation.py` は 2,796行 のエンドポイント + プロンプト構築 + facade re-export に縮小。monkeypatch 互換を維持（streaming テストの monkeypatch パスを `motivation_streaming` module に更新）。
  - `src/app/api/motivation/[companyId]/conversation/route.ts`: DELETE メソッドのインライン owner 条件を `buildMotivationOwnerCondition()` に統一。
  - `src/components/companies/CorporateInfoSection.tsx`: 12 個のインライン SVG アイコンを `corporate-info-section/icons.tsx` へ抽出。
- 部分対応
  - `src/lib/db/schema.ts` の JSON text 状態: `jsonb` migration と persistence 更新は完了したが、列を意味単位でさらに正規化するかは別判断。
  - `src/lib/motivation/conversation.ts` と conversation JSON state: parse / serialize helper は `jsonb` read/write 前提に更新済み。列の意味単位での追加細分化は別フェーズ。

## 1. 全体像

- ディレクトリ構成の要約
  - `src/app` が routing と page entrypoint、`src/components` が UI、`src/hooks` が client state、`src/app/api` が Next API、`src/lib` が shared domain / server utility、`backend/app` が FastAPI と AI/RAG の中核を担う構成。
  - `.omm/` と `docs/architecture/ARCHITECTURE.md` は全体像の補助として有効だが、実コードの肥大化速度に対して抽象度が高く、変更の危険箇所を直接は教えてくれない。
- レイヤー構成の要約
  - Browser -> App Router page/component/hook -> Next API -> DB/FastAPI/provider という経路が基本。
  - ただし会話系機能では page component 自身が state machine 化し、Next API shared が service 層化し、FastAPI router が orchestration と rule engine を兼務している。
- 全体の保守性の総評
  - 一部の server-first page と identity 集約は筋が良い。
  - その一方で、会話系 UI、企業情報取得 UI、Next API shared、FastAPI AI router に責務と状態が集中し、変更前に読む量が多すぎる。現状は「動いているが、人間が安全に直すには重い」構造が複数ある。
- 今のまま開発を続けた場合の主要リスク
  - AI関連要件の継ぎ足しで、`backend/app/routers/company_info.py` と `backend/app/routers/es_review.py` の局所理解不能化が進む。
  - 会話系ページに状態を足し続けることで、表示・保存・再開・課金・ストリーミングの順序バグが起きやすくなる。
  - guest/user 両対応の所有権判定と JSON text 状態の更新が散り、変更影響範囲の見積もりが難しくなる。
- 可読性・認知負荷の観点で特に危険な領域
  - `backend/app/routers/company_info.py` 6411 行
  - `backend/app/routers/es_review.py` 5220 行
  - `backend/app/routers/motivation.py` 3903 行
  - `backend/app/utils/llm.py` 3506 行
  - `src/components/companies/CorporateInfoSection.tsx` 3457 行
  - `src/app/(product)/companies/[id]/motivation/page.tsx` 2079 行
  - `src/app/(product)/companies/[id]/interview/page.tsx` 1932 行
  - `src/lib/server/app-loaders.ts` 919 行
- 状態管理の観点で特に危険な領域
  - `src/app/(product)/companies/[id]/motivation/page.tsx:425`
  - `src/app/(product)/companies/[id]/interview/page.tsx:709`
  - `src/app/(product)/gakuchika/[id]/page.tsx:219`
  - `src/hooks/useESReview.ts:66`
  - `src/app/api/companies/[id]/interview/shared.ts:444`
  - `src/app/api/gakuchika/shared.ts:1`

## 2. 良い点

- 現状でも保守しやすい点
  - `src/app/api/_shared/request-identity.ts` で identity 解決の入口を寄せている方向性は正しい。
  - `src/app/(product)/tasks/page.tsx`、`src/app/(product)/dashboard/page.tsx`、`src/app/(product)/companies/[id]/page.tsx`、`src/app/(product)/es/[id]/page.tsx` は thin page + preload 方向が比較的明確。
  - `.omm/` の `request-lifecycle` と `data-flow` は、レビュー時の共通認識としては有効。
- 責務分離が比較的うまくいっている点
  - `src/app/api/_shared/request-identity.ts` と owner XOR 制約は、guest/user 両対応を雑にしていない。
  - `src/lib/fastapi/client.ts` で FastAPI 呼び出しの入口を寄せている点は、provider 境界の散乱を一部抑えている。
- 今後も維持すべき構造
  - thin page + server preload の方向
  - identity 解決の共通入口
  - owner XOR 制約
  - アーキテクチャ資料を `.omm/` とコードで二重化している運用

## 3. 重大な問題

### 3-1. 会話系 product page が巨大な状態機械になっている

- 問題
  - page component が UI 状態、業務状態、永続化状態、SSE 再生状態、setup 状態を同時に持っている。
- 該当箇所
  - `src/app/(product)/companies/[id]/motivation/page.tsx:425`
  - `src/app/(product)/companies/[id]/interview/page.tsx:709`
  - `src/app/(product)/gakuchika/[id]/page.tsx:219`
- なぜ重大か
  - 状態主体の分け方が不自然で、1 つの修正でも会話進行、再生、保存、エラー回復、ロック、表示切替まで把握が必要になる。
- 放置リスク
  - 新しい質問ロジック、評価指標、保存形式、UI 補助が入るたびに分岐が増え、挙動差分の検証が難しくなる。
- 可読性・認知負荷への悪影響
  - `useState` 群が多すぎて、どの state が表示用でどれが業務の正本かを即座に判別しづらい。
- 状態管理への悪影響
  - `pendingCompleteData`、`streamingTargetText`、`setupSnapshot`、`stageStatus` などが混在し、状態遷移の順序と副作用の発火点が追いにくい。
- 改善の方向性
  - 会話進行、setup、stream transport、playback、document save を別の状態主体へ分離し、page は orchestration のみへ寄せる。
- 優先度
  - High

### 3-2. `CorporateInfoSection.tsx` が UI 兼 workflow engine になっている

- 問題
  - 企業情報 UI が検索、URL投入、PDF見積、アップロード、削除、コンプライアンス確認、料金制約、モーダル遷移を単一 component で抱えている。
- 該当箇所
  - `src/components/companies/CorporateInfoSection.tsx:660`
  - `src/components/companies/CorporateInfoSection.tsx:938`
  - `src/components/companies/CorporateInfoSection.tsx:1229`
  - `src/components/companies/CorporateInfoSection.tsx:1502`
- なぜ重大か
  - UI 表示変更でも workflow 状態や provider 制約に触れやすく、修正の安全性が低い。
- 放置リスク
  - 情報源種別や課金ポリシーが増えるたびにさらに複雑化し、AI による継ぎ足し実装の温床になる。
- 可読性・認知負荷への悪影響
  - アイコン、helper、fetch、見積、モーダル制御が混ざり、読む順序が見えない。
- 状態管理への悪影響
  - `webDraft`、`urlDraft`、`pdfDraft`、`fetchResult`、`pdfEstimate`、`modalStep`、`displayedStep` が相互依存し、どれが入力状態でどれが進行状態か曖昧。
- 改善の方向性
  - input mode ごとの workflow state を分離し、課金・見積・削除・コンプライアンス確認を専用ロジックへ切り出す。
- 優先度
  - High

### 3-3. Next API shared が service 層ではなく業務中枢化している

- 問題
  - shared route/module が所有権判定、DB 復元、JSON 正規化、状態更新、履歴保存、補助データ構築まで一括で持っている。
- 該当箇所
  - `src/app/api/companies/[id]/interview/shared.ts:444`
  - `src/app/api/gakuchika/shared.ts:1`
  - `src/app/api/documents/_services/handle-review-stream.ts:1`
  - `src/app/api/motivation/[companyId]/conversation/stream/route.ts:1`
- なぜ重大か
  - API 層の責務が厚すぎて、変更時に「どこが正本か」を判断しにくい。
- 放置リスク
  - route ごとの微妙な差分実装が増え、同じドメインの知識が複数箇所で少しずつずれていく。
- 可読性・認知負荷への悪影響
  - `shared` という名前から期待される小さな共通処理を超えて、巨大な業務ロジック置き場になっている。
- 状態管理への悪影響
  - 復元、正規化、保存、副作用発火が API 層に散在し、状態遷移の全体像をつかみにくい。
- 改善の方向性
  - domain service / persistence / serialization / transport を分け、route は入口に留める。
- 優先度
  - High

### 3-4. FastAPI 側の AI 中核が巨大単一モジュール化している

- 問題
  - router/util が endpoint、prompt rule、検索戦略、スコアリング、OCR、RAG、retry、telemetry を同時に抱えている。
- 該当箇所
  - `backend/app/routers/company_info.py`
  - `backend/app/routers/es_review.py`
  - `backend/app/utils/llm.py`
  - `backend/app/utils/vector_store.py`
  - `backend/app/utils/hybrid_search.py`
- なぜ重大か
  - AI 機能は要件変更が多いのに、局所的なルール追加がファイル全体の理解を要求する。
- 放置リスク
  - 仕様変更時に副作用範囲を見落としやすく、モデル切替や検索改善が別機能を壊す。
- 可読性・認知負荷への悪影響
  - 1 ファイル内の概念数が多すぎて、読者は API、検索、抽出、価格、fallback まで同時保持を強いられる。
- 状態管理への悪影響
  - request ごとの暗黙設定や fallback 状態が util 内で積み上がり、明示的な state model が見えにくい。
- 改善の方向性
  - endpoint、search strategy、provider policy、content extraction、billing/logging を分割する。
- 優先度
  - High

### 3-5. 会話・評価状態の正本が text JSON に埋まりすぎている

- 問題
  - 重要状態が型付き構造ではなく text JSON と parse/stringify の運用に依存している。
- 該当箇所
  - `src/lib/db/schema.ts:735`
  - `src/lib/db/schema.ts:762`
  - `src/lib/db/schema.ts:804`
- なぜ重大か
  - 状態の意味が schema から読めず、読み手は保存形式と各 parser の両方を追う必要がある。
- 放置リスク
  - 互換対応が増えるほど decode/normalize が散り、 silent break が起きやすい。
- 可読性・認知負荷への悪影響
  - `messages`、`conversationContext`、`turnStateJson`、`turnMetaJson`、`scores` の意味が DB 定義だけでは分からない。
- 状態管理への悪影響
  - 状態遷移の正本が DB row なのか API normalize 後なのか UI state なのか曖昧になる。
- 改善の方向性
  - 構造化カラム化、または少なくとも decode boundary の一本化と schema versioning を明示する。
- 優先度
  - High

## 4. 中程度の負債

### 4-1. `app-loaders.ts` が god-loader 化している

- 問題
  - companies、documents、dashboard、activation、detail page の集約ロジックが 1 ファイルに集中。
- 該当箇所
  - `src/lib/server/app-loaders.ts:104`
  - `src/lib/server/app-loaders.ts:276`
  - `src/lib/server/app-loaders.ts:694`
  - `src/lib/server/app-loaders.ts:819`
- 放置リスク
  - 画面都合の派生値が増えるたびに loader が肥大化し、server layer の境界が曖昧になる。
- 可読性・認知負荷への悪影響
  - file 名から受ける印象より責務が広く、探索起点として重い。
- 状態管理への悪影響
  - view model 生成と domain query が一体化し、表示状態と業務状態の境界が見えにくい。
- 改善の方向性
  - ドメイン別 loader へ分割し、view model 生成を別層へ寄せる。
- 優先度
  - Medium

### 4-2. guest/user 両対応の所有権知識が広く重複している

- 問題
  - owner 条件が route / shared / loader に繰り返し現れる。
- 該当箇所
  - `src/app/api/motivation/[companyId]/conversation/route.ts`
  - `src/app/api/motivation/[companyId]/conversation/start/route.ts`
  - `src/app/api/motivation/[companyId]/conversation/stream/route.ts`
  - `src/lib/server/app-loaders.ts:29`
  - `src/app/api/companies/[id]/interview/shared.ts:308`
- 放置リスク
  - 条件のずれや guest/user 片側だけの不具合を生みやすい。
- 可読性・認知負荷への悪影響
  - 読むたびに同じ分岐を再解釈する必要がある。
- 状態管理への悪影響
  - 所有権判定が状態遷移の前提条件なのに、前提が一箇所にまとまっていない。
- 改善の方向性
  - owner condition builder と access policy をドメイン単位で集約する。
- 優先度
  - Medium

### 4-3. `useESReview.ts` が transport と UI 再生制御を兼務している

- 問題
  - fetch、SSE parse、progress、playback、cancel、timer、error mapping を 1 hook に保持。
- 該当箇所
  - `src/hooks/useESReview.ts:66`
  - `src/hooks/useESReview.ts:144`
  - `src/hooks/useESReview.ts:464`
- 放置リスク
  - 表示改善でも transport に触れやすく、streaming 系のデグレが起きやすい。
- 可読性・認知負荷への悪影響
  - hook 内に複数の時間軸があり、読む側が request lifecycle を頭の中で再構築する必要がある。
- 状態管理への悪影響
  - `receivedReview` と `playbackReview` と `sseProgress` の境界が明示設計ではなく実装依存。
- 改善の方向性
  - transport state と presentation playback state を分離する。
- 優先度
  - Medium

### 4-4. `calendar/sync.ts` が同期ジョブ管理と provider 連携を一体化している

- 問題
  - queue 操作、同期判定、Google API 呼び出し、通知更新が同じ module にある。
- 該当箇所
  - `src/lib/calendar/sync.ts:1`
  - `src/lib/calendar/sync.ts:67`
  - `src/lib/calendar/sync.ts:191`
- 放置リスク
  - provider 仕様変更がジョブ状態管理へ波及しやすい。
- 可読性・認知負荷への悪影響
  - queue orchestration と provider adapter の区別がつきにくい。
- 状態管理への悪影響
  - sync job、deadline state、calendar event state の正本が追いにくい。
- 改善の方向性
  - job orchestration と provider adapter と state persistence を分ける。
- 優先度
  - Medium

### 4-5. `credits/index.ts` が業務ルールの集積所になっている

- 問題
  - 初期化、月次リセット、残高取得、プラン更新、消費ルールが一体化している。
- 該当箇所
  - `src/lib/credits/index.ts:1`
  - `src/lib/credits/index.ts:76`
  - `src/lib/credits/index.ts:161`
- 放置リスク
  - 新しい消費種別や例外ルールを足すほど分岐が増える。
- 可読性・認知負荷への悪影響
  - 残高取得だけでも月次リセットや初期化規則まで読む必要がある。
- 状態管理への悪影響
  - credit balance と transaction と monthly quota の責務境界が見えにくい。
- 改善の方向性
  - balance read、grant/reset、reservation/confirm/cancel を明確に分ける。
- 優先度
  - Medium

### 4-6. 命名が広すぎて責務を隠している

- 問題
  - `shared`、`conversation`、`page` が広すぎ、名前から責務が読めない。
- 該当箇所
  - `src/app/api/companies/[id]/interview/shared.ts`
  - `src/app/api/gakuchika/shared.ts`
  - `src/lib/motivation/conversation.ts`
- 放置リスク
  - 機能追加時に「とりあえずここへ足す」が発生しやすい。
- 可読性・認知負荷への悪影響
  - ファイルを開かないと責務の範囲が分からない。
- 状態管理への悪影響
  - 状態ごとの責任主体が名前から見えない。
- 改善の方向性
  - role / persistence / serialization / workflow など意味単位の命名へ寄せる。
- 優先度
  - Medium

## 5. 軽微だが整えたい点

- 問題
  - アイコン定義や小 helper が巨大 component file に埋もれている。
- 該当箇所
  - `src/components/companies/CorporateInfoSection.tsx`
  - `src/components/companies/CompanyDetailPageClient.tsx`
- 改善の方向性
  - view helper と icon を分け、主要ロジックの視認性を上げる。
- 問題
  - `buildHeaders()` や小さな fetch helper の局所重複がある。
- 該当箇所
  - `src/app/(product)/companies/[id]/motivation/page.tsx`
  - `src/components/companies/CompanyDetailPageClient.tsx`
- 改善の方向性
  - UI 側の軽い API client を揃える。
- 問題
  - `docs/review/README.md` は正本を指しているが、運用としてはレビュー本文側だけを見ないと完結しない。
- 該当箇所
  - `docs/review/README.md`
- 改善の方向性
  - レビュー文書の正本運用ルールを今後も一貫させる。

## 6. 観点別レビュー

### 6-1. 責務の混在

- `CorporateInfoSection.tsx` は UI、workflow、料金制約、provider 制約、削除確認まで混在。
- `handle-review-stream.ts` は ES review transport でありながら、credit reservation、RAG query 構築、profile/gakuchika context 収集まで持つ。

### 6-2. ファイル肥大化

- FastAPI 側は `company_info.py`、`es_review.py`、`motivation.py`、`llm.py` が突出。
- Next 側は `CorporateInfoSection.tsx`、`motivation/page.tsx`、`interview/page.tsx`、`app-loaders.ts` がホットスポット。

### 6-3. 密結合・レイヤー違反

- page component が transport / workflow と密結合。
- API shared が route 層を越えて service / persistence の中核になっている。

### 6-4. 重複した知識・ロジック

- guest/user 所有権条件
- conversation 状態の parse / normalize
- SSE 受信後の complete handling
- role option / setup 解決ロジック

### 6-5. 外部依存の散在

- Google Calendar 依存は `calendar/sync.ts` に集まっているが、逆に集まりすぎて adapter 境界が弱い。
- FastAPI provider 依存は `llm.py` に寄っているが、ここも provider policy の集中で変更波及が大きい。

### 6-6. データ境界・状態管理

- conversation 系の正本が DB text JSON、API normalize 後オブジェクト、UI local state にまたがる。
- どの層が canonical かをコードから即断しづらい。

### 6-7. 画面遷移と責務分担

- server-first の通常画面は比較的追いやすい。
- 会話系画面は setup 前後、streaming 中、draft 完成後で責務が切り替わるが、その境界が page 内で暗黙化している。

### 6-8. 可読性の低さ

- 巨大ファイルの先頭に icon/helper、中央に state、後半に view が混ざり、読解の足場が悪い。
- `shared` 命名が広すぎて、ファイルを開く前に責務が推測しづらい。

### 6-9. 開発時の認知負荷の高さ

- 1 箇所直す前に、UI state、DB row、API route、FastAPI response、credit rule を同時把握する箇所が多い。
- 特に motivation/interview/gakuchika は読む前提知識が過剰。

### 6-10. 状態主体の妥当性

- page component が本来別主体である setup state、conversation progression、stream playback、save result を同時保持している。
- `useESReview.ts` も transport と UI 再生を同一主体にしている。

### 6-11. 状態遷移の追跡容易性

- `pendingCompleteData` のような中間状態が複数存在し、complete 条件と適用タイミングが直線的でない。
- `interview/shared.ts` は hydrate、persist、feedback update の経路が長く、副作用位置が追いづらい。

### 6-12. AI継ぎ足し開発で負債化しやすい箇所

- `backend/app/routers/company_info.py`
- `backend/app/routers/es_review.py`
- `src/components/companies/CorporateInfoSection.tsx`
- `src/app/(product)/companies/[id]/motivation/page.tsx`
- `src/app/(product)/companies/[id]/interview/page.tsx`

### 6-13. 将来の変更容易性

- 画面改善だけでも domain state に触れやすい箇所が多く、変更容易性は低い。
- 逆に thin page + preload の通常画面は、今の方針を維持すれば比較的安全に拡張できる。

## 7. 優先度付き改善候補一覧

- 対象
  - `backend/app/routers/company_info.py`
  - 問題の概要: 検索、抽出、OCR、RAG、endpoint が巨大単一ファイルに集中
  - 主に改善されるもの: 保守性、可読性、認知負荷、変更容易性
  - 期待できる改善: 局所変更時の読解範囲縮小
  - 影響範囲: 企業情報取得、RAG 構築、検索
  - 放置リスク: AI継ぎ足しでさらに破綻しやすい
  - 優先度（High / Medium / Low）: High
- 対象
  - `backend/app/routers/es_review.py`
  - 問題の概要: ES review endpoint と review policy が過密
  - 主に改善されるもの: 保守性、認知負荷、障害調査容易性
  - 期待できる改善: ルール変更の影響範囲が見えやすくなる
  - 影響範囲: ES 添削全体
  - 放置リスク: 仕様変更時の副作用見落とし
  - 優先度（High / Medium / Low）: High
- 対象
  - `src/components/companies/CorporateInfoSection.tsx`
  - 問題の概要: UI と workflow state の混在
  - 主に改善されるもの: 可読性、認知負荷、状態管理の理解容易性
  - 期待できる改善: UI変更の安全性向上
  - 影響範囲: 企業詳細、RAG ソース管理
  - 放置リスク: 細かい改善でも壊しやすい
  - 優先度（High / Medium / Low）: High
- 対象
  - `src/app/(product)/companies/[id]/interview/page.tsx`
  - 問題の概要: page 内 state machine 化
  - 主に改善されるもの: 認知負荷、変更容易性、状態管理の理解容易性
  - 期待できる改善: setup / conversation / feedback の切り分け
  - 影響範囲: 面接対策 UI
  - 放置リスク: 新機能追加時の順序バグ
  - 優先度（High / Medium / Low）: High
- 対象
  - `src/app/(product)/companies/[id]/motivation/page.tsx`
  - 問題の概要: setup、conversation、draft 生成、playback が一体化
  - 主に改善されるもの: 可読性、認知負荷、変更容易性
  - 期待できる改善: 会話進行の正本が見えやすくなる
  - 影響範囲: 志望動機導線
  - 放置リスク: 状態追加ごとの複雑化
  - 優先度（High / Medium / Low）: High
- 対象
  - `src/hooks/useESReview.ts`
  - 問題の概要: transport と playback の一体化
  - 主に改善されるもの: 状態管理の理解容易性、可読性、テスト容易性
  - 期待できる改善: stream バグの切り分け容易化
  - 影響範囲: ES review UI
  - 放置リスク: UI 改修で transport デグレ
  - 優先度（High / Medium / Low）: High
- 対象
  - `src/app/api/companies/[id]/interview/shared.ts`
  - 問題の概要: hydrate / persist / normalize / feedback 履歴構築の集中
  - 主に改善されるもの: 保守性、可読性、障害調査容易性
  - 期待できる改善: API 層の責務明確化
  - 影響範囲: interview route 一式
  - 放置リスク: shared への継ぎ足しが続く
  - 優先度（High / Medium / Low）: High
- 対象
  - `src/lib/server/app-loaders.ts`
  - 問題の概要: god-loader 化
  - 主に改善されるもの: 保守性、可読性、変更容易性
  - 期待できる改善: 画面別責務の明確化
  - 影響範囲: product preload 全般
  - 放置リスク: loader 依存が増え続ける
  - 優先度（High / Medium / Low）: Medium
- 対象
  - `src/app/(product)/gakuchika/[id]/page.tsx`
  - 問題の概要: conversation / summary / draft 生成の状態集中
  - 主に改善されるもの: 認知負荷、状態管理の理解容易性
  - 期待できる改善: 深掘りと draft 生成の境界整理
  - 影響範囲: ガクチカ導線
  - 放置リスク: motivation/interview と同じ負債パターンを再生産
  - 優先度（High / Medium / Low）: Medium
- 対象
  - `src/app/api/gakuchika/shared.ts`
  - 問題の概要: normalize と persistence と FastAPI 中継知識の集中
  - 主に改善されるもの: 保守性、可読性
  - 期待できる改善: shared の役割明確化
  - 影響範囲: gakuchika API
  - 放置リスク: 状態仕様のドリフト
  - 優先度（High / Medium / Low）: Medium
- 対象
  - `src/lib/motivation/conversation.ts`
  - 問題の概要: 会話知識の中枢化
  - 主に改善されるもの: 保守性、変更容易性
  - 期待できる改善: 役割別ロジックの切り出し
  - 影響範囲: motivation route/UI
  - 放置リスク: 仕様追加のたびに複雑化
  - 優先度（High / Medium / Low）: Medium
- 対象
  - `src/lib/calendar/sync.ts`
  - 問題の概要: queue と provider 連携の混在
  - 主に改善されるもの: 保守性、障害調査容易性
  - 期待できる改善: 同期不具合の切り分け容易化
  - 影響範囲: calendar sync 全般
  - 放置リスク: provider 側仕様変更で波及
  - 優先度（High / Medium / Low）: Medium
- 対象
  - `src/lib/credits/index.ts`
  - 問題の概要: credit rule の集積
  - 主に改善されるもの: 可読性、変更容易性
  - 期待できる改善: 消費/付与/残高取得の責務分離
  - 影響範囲: credits 利用機能全般
  - 放置リスク: 例外ルールの増殖
  - 優先度（High / Medium / Low）: Medium
- 対象
  - `src/lib/db/schema.ts`
  - 問題の概要: ドメイン知識と JSON text 状態の集中
  - 主に改善されるもの: 保守性、状態管理の理解容易性
  - 期待できる改善: 状態の意味が読みやすくなる
  - 影響範囲: 全ドメイン
  - 放置リスク: parser 依存の silent break
  - 優先度（High / Medium / Low）: Medium
- 対象
  - `src/components/companies/CompanyDetailPageClient.tsx`
  - 問題の概要: detail UI と workflow helper の混在
  - 主に改善されるもの: 可読性
  - 期待できる改善: detail view の見通し改善
  - 影響範囲: 企業詳細画面
  - 放置リスク: 周辺機能の受け皿化
  - 優先度（High / Medium / Low）: Low

## 8. 追加で確認したい質問

- 現時点では必須の質問はありません。レビュー継続に必要な事実はコードと `.omm/` から取得できています。

