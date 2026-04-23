---
target: gakuchika v4 Phase 2+3+4 フルスタック改善
review_date: 2026-04-17
verdict: PASS_WITH_REFACTOR
plan_file: /Users/saoki/.claude/plans/gakuchika-quality-improvement-plan-web-a-concurrent-candle.md
---

# architecture-gate レビュー結果

## 1. 全体所見

改善計画は `.omm/` に記述されたレイヤー境界 (FastAPI routers / prompt-assets / Next API route handlers / client domain-services) と大きく矛盾しない。ただし **B.0 (ConversationState SSOT) の実行順序**、**SSE partial/complete event contract**、**prompt_builder の責務境界** の 3 点に要対応箇所あり。

## 2. 良い点

- A.2 責務分離 (evaluators / normalization / prompt_builder) は `.omm/overall-architecture/fastapi-ai/` の routers/prompt-assets 分離意図に合致
- B.1-B.3 プロンプト拡充は既存 `backend/app/prompts/` 構造を尊重し prompt-assets 層の立ち位置が明確
- `_normalize_es_build_payload` の domain-service 層分離は `.omm/request-lifecycle/domain-services/` の intent と一致
- UI SSOT 方向性は `.omm/data-flow/` の非同期 drift リスク軽減に寄与
- SSE 拡張対象ファイル群は下地として整理されている

## 3. 重要な懸念点

- **B.0 の順序誤り**: 現行プランは `A.2 → B.0` だが、`state.ts` と `conversation-state.ts` の二重定義を先に解消しないと、A.2 で routers 分離後に両方へ patch が必要 (`.omm/request-lifecycle/concern.md` の "sync drift" に直結)
- **SSE partial/complete pattern 未記載**: `.omm/request-lifecycle/next-route-handlers/ai-stream-routes/` には既存 SSE pattern しかなく、partial state patch vs complete final state の distinction がプランに欠落
- **prompt_builder 責務混在**: `_build_draft_quality_checks` (evaluator) や `_extract_student_expressions` (normalization) を prompt_builder に入れる案は責務混在
- **coachProgressMessage の SSE 乗せ方**: Next API route vs FastAPI のどちらで生成するか、partial event で送るか complete で送るか、契約が未確定
- **normalization 関数の failure path**: invalid payload 時のエラー契約が未記載 (`.omm/request-lifecycle/constraint.md` "structured API errors" に対応必要)

## 4. 観点別レビュー

### A. 責務境界 (evaluators / normalization / prompt_builder)
部分的合致。`_build_draft_quality_checks` / `_build_causal_gaps` は evaluator、`_extract_student_expressions` は normalization、`_build_es_prompt` / `_build_deepdive_prompt` は prompt template。`_determine_deepdive_phase` / `_build_draft_diagnostics` は orchestration (routers 残置) に分類すべき。

### B. ConversationState SSOT
**非合致**。現行の二重定義は `.omm/request-lifecycle/concern.md` / `.omm/data-flow/concern.md` の "drift" 懸念と衝突。B.0 を A.2 より前に実行する必要あり。

### C. SSE partial/complete pattern
曖昧。C.2 実装前に contract を明文化し `.omm/` に追記が必要:
- partial event: `{ type: "partial", path: string, value: any }` (state patch)
- complete event: `{ type: "complete", conversationState, question, nextAction }` (final state)

### D. Prompt 構築責務と llm-runtime
部分的合致。prompts/ 層は "instruction payloads" (template + few-shot + constraints) に絞る。phase detection / diagnostics JSON は routers orchestration に残す。

### E. 既出懸念との衝突
一部解消 (code navigation 改善、routers 複雑度低減)。未対応 (external provider dependency 増、SSOT 未統合による state drift)。

## 5. 改善優先順位 (最小リファクタ、PASS 達成条件)

### 必須
1. **B.0 を Phase A の最初に移動** (A.2 前)
   - `src/lib/gakuchika/conversation-state.ts` を SSOT に宣言
   - `src/app/api/gakuchika/state.ts` を lib の re-export に置換
   - `coachProgressMessage: string | null` を SSOT 型に追加
   - `buildHintPayload()` (`src/app/api/gakuchika/index.ts:34`) の条件更新

2. **SSE event contract 明文化**
   - `docs/architecture/GAKUCHIKA_SSE_CONTRACT.md` を新規作成
   - partial / complete の distinction を spec 化
   - `.omm/request-lifecycle/next-route-handlers/` の note.md に追記リンク

3. **prompt_builder の責務を template-only に限定**
   - 名前を `gakuchika_prompt_templates.py` (または `prompt_builder.py` のまま) で内容を:
     - **入れる**: `_build_es_prompt` / `_build_deepdive_prompt` / `_generate_initial_question` の template formatting 部分
     - **routers 残す**: `_determine_deepdive_phase` / `_build_draft_diagnostics` / payload assembly
     - **normalization 移す**: `_extract_student_expressions`
     - **evaluators 移す**: `_build_draft_quality_checks` / `_build_causal_gaps`

### 推奨
4. 各新モジュールの unit test カバレッジ 80% 以上
5. normalization 関数の failure path / error contract 明記

## 6. 追加確認事項

1. `_build_draft_diagnostics` (gakuchika.py L558) の責務は prompt-builder か evaluator か → **routers orchestration に残す**
2. `coachProgressMessage` はどこで生成か → **FastAPI `/gakuchika/{id}/conversation` 応答で state に含める。Next API は pass-through**

## 最終判定: **PASS_WITH_REFACTOR**

必須 3 点 (B.0 順序変更 / SSE contract 明文化 / prompt_builder 責務限定) を満たせば PASS。improve-architecture RFC は不要 (既存レイヤーの細分化のみ、新規レイヤー導入なし)。

## 計画 (rev2 → rev3) への反映内容

- Phase A に B.0 を組み込み、A.0 (SSOT 先行) → A.1 (architecture-gate 完了済み) → A.2 (helper 分離) → A.3 (deep-dive fail 修正) の順に組み換え
- A.2 の A.2.a (prompt template 切り出し) を `gakuchika_prompt_builder.py` に限定し、`_build_draft_quality_checks` は evaluators へ、`_extract_student_expressions` は normalization へ配置
- 新 Phase A.4 で SSE event contract を `docs/architecture/GAKUCHIKA_SSE_CONTRACT.md` に明文化
