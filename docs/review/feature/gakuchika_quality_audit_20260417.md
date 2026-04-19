# ガクチカ深掘り・作成機能 品質監査レポート (2026-04-17)

## 実行環境

| 項目 | 値 |
|------|------|
| git SHA | `d161b8bd77d093d03e3a80da963a3a32b4c75545` + 本日の Phase 0+1 コミット |
| 実行日 | 2026-04-17 |
| 監査手法 | コード・プロンプト・既存 test 静的解析 (LLM 実出力は非検証) |
| 採点軸 | 面接機能 audit (20260412) と同じ 6 軸 × 100 点満点 |
| 前回 audit | `gakuchika_quality_audit_20260412.md` (52/100 Grade C) |

---

## 1. エグゼクティブサマリー

### 6 軸評価マトリクス

| 軸 | 配点 | 得点 | 評価 | 判定根拠 |
|---|---:|---:|:---:|---|
| **コード品質・設計** | 15 | 11 | **A-** | Router 1,054 行 (500 行ルールを 2 倍超過)。Prompt Builder 分離 + sanitize guard + SSE lease は適切。Phase 0+1 で payload シャドウイング 4 handler 除去・ImportError 解消完了 |
| **AI / プロンプト品質** | 20 | 14 | **B+** | Phase 0+1 で TASK_IMPLICIT_PATTERNS (14) + OTHER_ACTOR uniform + result_traceability + `_build_known_facts` 先頭 2+末尾 3+1200 字キャップが実装済と verify。COACH_PERSONA + 3 段 QUESTION_TONE の構造は良好。AI 臭 (「〜の重要性を学んだ」等) 明示禁止なし、Few-shot 見本 10 未満が課題 |
| **機能専門性 (ガクチカ深掘りプロ品質)** | 30 | 21 | **B+** | 3 フェーズ設計 (es_aftercare → evidence_enhancement → interview_expansion)、draft_diagnostics feedback loop、STAR 再整列 blocked guard、LEARNING_WISH_ONLY vs LEARNING_CONCRETE 区別、SHALLOW_REASON_HEDGES 検出。Live 収束性未 verify、複数エピソード管理は frontend 任せ、Few-shot 統合薄 |
| **UX・ユーザー体験** | 15 | 11 | **B** | SSE 字句単位 streaming、coach_progress_message + remaining_questions_estimate 表示、draft diagnostics tag UI。page.tsx 912 行 (30+ useState)、polling 12 秒、auto-save なし |
| **テスト・信頼性** | 10 | 7 | **B-** | 81 test 関数 / 2,224 行、normalization 層 unit test 充実、prohibited_expressions fallback 検証。SSE streaming test ゼロ、Live E2E 収束性検証不足、`test_gakuchika_live_scenarios.py` に既存 fail |
| **セキュリティ基礎** | 10 | 8 | **A-** | `require_career_principal("ai-stream")` + `sanitize_user_prompt_text` (3000-5000 字) + `PromptSafetyError` + SseLease。NextQuestionRequest に gakuchika_id 無しで ownership は frontend 信頼 |

### 総合スコア: **72/100 (グレード B-)**

前回 52 → 今回 72 で **+20 点**。Phase 0+1 完了による加点内訳:
- `_build_known_facts` 先頭 2+末尾 3+1200 字キャップ (+3)
- TASK_IMPLICIT_PATTERNS 14 パターン (+3)
- result_traceability guard 実装 (+2)
- OTHER_ACTOR uniform 表現 (+1)
- STAR realign blocked guard (+2)
- payload シャドウイング 4 handler 除去 (+2)
- test ImportError 解消 (+1)
- draft_diagnostics feedback loop 整備 (+3)
- coach_progress_message + remaining estimate (+3)

残 Phase 2-5 (プロンプト / frontend / es_templates AI 臭 / テスト拡充) が未実装のため 85+ に届かず。

### 最重要改善 5 点

1. **Few-shot 見本が gakuchika_prompts.py で 10 件未満 [P-01]** — audit 2026-04-12 の 3.4 指摘。`question_few_shot_for(input_richness_mode)` は dynamic 配信機構があるが、渡される見本そのものが薄い
2. **AI 臭 (テンプレ臭) 排除の明示禁止なし [P-02]** — 「〜の重要性を学んだ」「〜に貢献したい」など ChatGPT 臭フレーズを禁止しないため ES draft が一般論化
3. **Router 1,054 行の責務集約 [C-01]** — `_determine_deepdive_phase` / `_is_deepdive_request` / draft diagnostics / normalization orchestration が同一ファイルに混在。面接 audit と同じ「2,000 行超 God Object」には至らないが分割候補
4. **Live E2E 収束性が未 verify [T-01]** — audit 2026-04-12 で「Live テストで draft_ready に一度も到達」と指摘されたが、Phase 0+1 後の検証ログなし。`test_gakuchika_live_scenarios.py` の既存 fail (`evaluate_deepdive_completion shallow followup`) も解消未確認
5. **複数エピソード管理が backend 非対応 [Q-01]** — 学生は通常 2-3 個のガクチカを持つが、NextQuestionRequest に gakuchika_id を持たない。`useGakuchikaConversation` hook が frontend で state isolation しているのみで、backend での ownership check が弱い

---

## 2. ガクチカ対話のプロ品質監査 (配点 30、得点 21)

### 2-1. 評価フレームワーク (ガクチカ品質 6 軸)

| 品質軸 | 評価 | 概要 |
|---|:---:|---|
| **論点設計力** | **B+** | 3 フェーズ (es_aftercare / evidence_enhancement / interview_expansion) の phase-aware な preferred_focuses 自動選択が就活指導の実態に合致 |
| **深掘り技術** | **B** | `build_deepdive_prompt_text` で draft diagnostics (strength/issue/recommendation/risk) を渡し、weakness tag flow → deepdive feedback。SHALLOW_REASON_HEDGES 検出あり。具体例拡張余地 |
| **STAR 構造化** | **A-** | `_normalize_es_build_payload` で focus realign to first missing (STAR 順)、blocked_focuses skip で ループ防止。Phase 0+1 で整備 |
| **完成度判定** | **B+** | `_evaluate_deepdive_completion` で credibility_risk + learning_concrete 両要件。Legacy list[Message] path を保持しており union 型複雑性あり |
| **エピソード選定** | **C** | 単一エピソード単位、推奨ロジックなし。業界空白地帯だが本機能も未到達 |
| **多回答整合性** | **C** | ES draft 生成時に conversation_state dict で state host、ただし複数ガクチカ間整合は未実装 |

### 2-2. Phase 0+1 実装検証 (TRACKER 記載の 7 項目)

| ID | 内容 | コード検証 | 実装場所 |
|----|------|:----------:|---------|
| 0.1 | test ImportError 解消 | ✅ | pytest 33 passed (過去 collection error 無し) |
| 0.2 | request=payload シャドウイング 4 handler 除去 | ✅ | `gakuchika.py` の handler 内部で新シンボル使用確認 |
| 0.3 | STAR 再整列 blocked guard | ✅ | `normalization/gakuchika_payload.py` の focus realign skip |
| 1.1 | TASK_IMPLICIT_PATTERNS 14 パターン | ✅ | `gakuchika_text.py:93-107` |
| 1.2 | OTHER_ACTOR uniform guard + 複合 ACTION 分岐 | ✅ | `gakuchika_text.py:123-134` |
| 1.3 | result_traceability digit 代替 | ✅ | `gakuchika_text.py:35` + `gakuchika.py:366-369` |
| 1.4 | `_build_known_facts` 先頭 2+末尾 3+1200 字キャップ | ✅ | `gakuchika.py:291-318` |

**7/7 完了**。TRACKER と実装は一致。

### 2-3. 深掘りフロー

```
[学生入力] 
  → POST /gakuchika/next-question
  → _determine_deepdive_phase(turn_count)
     ├─ 0-2 turn: es_aftercare (基礎確認)
     ├─ 3-5 turn: evidence_enhancement (根拠深掘り)
     └─ 6+ turn:  interview_expansion (面接想定)
  → build_deepdive_prompt_text(phase, draft_diagnostics, focus)
  → LLM 生成 (gpt-5.4-mini, temp=0.35)
  → _sse_event("question_chunk") 字句単位 streaming
  → _sse_event("complete", {question, focus_update, completion_signals})
```

draft_diagnostics の 4 tag (strength / issue / recommendation / risk) が毎 turn 更新され、プロンプトにフィードバックされる構造は比較同業他社 (内定くんAI / ES Maker) より先進的。

### 2-4. 既存 audit (2026-04-12) の指摘解消状況

| 分類 | 件数 | 解消 | 残置 |
|------|---:|---:|---:|
| Critical (C-01〜C-04) | 4 | 3 | 1 (Router 1,054 行の責務集約、C-03 分割未) |
| Major (P-01〜P-06, Q-01〜Q-04) | 10 | 5 | 5 |
| Moderate (U-01〜U-03, T-01〜T-05) | 8 | 3 | 5 |
| Minor (細かな hygiene) | 6 | 2 | 4 |

**合計 28 指摘中 13 件解消 (46%)**。

---

## 3. コード品質・設計 (配点 15、得点 11)

### 3-1. 強み

- **Prompt Builder と Router の責務分離:** `gakuchika_prompt_builder.py` (202 行) は pure function で side-effect なし
- **SSE concurrency 管理:** `SseLease` で同時接続制限、`_sse_event` helper で payload 構造化
- **security guard 整備:** `sanitize_user_prompt_text`, `PromptSafetyError`, `_prompt_safety_http_error` の 3 点セットが全 handler に適用

### 3-2. 弱み

- **`gakuchika.py` 1,054 行 (CLAUDE.md 500 行ルールの 2 倍超):** 面接の 2,694 行ほどではないが、`_determine_deepdive_phase` / `_is_deepdive_request` / draft diagnostics / normalization orchestration が handler に混在 (行 390-400, 335-387 等)
- **test coverage が router 層で thin:** 81 件中大半は normalization 層。エンドポイント統合テスト (POST `/next-question` の完全往復) が不足
- **legacy path 並存:** `_evaluate_deepdive_completion` が list[Message] legacy を保持し union 型複雑性あり

### 3-3. 推定スコア: 11/15 (A-)

Router 規模は懸念だが、面接機能の façade pattern を Phase 2+ で適用すれば A+ に到達可能。

---

## 4. AI / プロンプト品質 (配点 20、得点 14)

### 4-1. プロンプト構造

`gakuchika_prompts.py` (530 行):
- `COACH_PERSONA` (面接対策コーチ人格)
- `QUESTION_TONE_AND_ALIGNMENT_RULES` (トーン・方向性)
- `APPROVAL_AND_QUESTION_PATTERN` (承認→質問パターン)
- `ES_BUILD_QUESTION_PRINCIPLES` (107 字で STAR 優先 + 骨格優先)
- `DEEPDIVE_QUESTION_PRINCIPLES` (phase-aware、8 focus 対応)
- `PROHIBITED_EXPRESSIONS` 14 パターン

### 4-2. 強み

- **3 段階ガイダンス整備:** COACH_PERSONA → QUESTION_TONE → PATTERN の層が明確
- **禁止表現 14 パターン:** 明示的カタログ化 (gakuchika_text.py 123-134)
- **phase-aware focus 選択:** 質問 turn 数から動的に preferred_focus を絞る

### 4-3. 弱み

- **Few-shot 見本 10 件未満:** `question_few_shot_for(input_richness_mode)` の配信機構はあるが見本そのものが薄く、LLM が「それっぽい質問」を生成できない
- **AI 臭排除の明示禁止なし:** 「〜の重要性を学んだ」「〜に貢献したい」等の ChatGPT 臭フレーズを禁止していない
- **学生の言葉保存指示が非適用:** `_extract_student_expressions` (Phase B.5) は ES draft 生成には入るが、質問生成には未適用
- **structured_summary 17 項目を一度に要求:** audit 3.4 指摘、LLM の attention が分散しやすい

### 4-4. 推定スコア: 14/20 (B+)

Phase 0+1 で禁止パターン + 1200 字キャップ整備済。Phase 2 (プロンプト) で Few-shot + AI 臭排除が入れば 17-18/20 に到達。

---

## 5. 機能専門性・ガクチカプロ品質 (配点 30、得点 21)

前述 §2 参照。**21/30 (B+)**。

---

## 6. UX・ユーザー体験 (配点 15、得点 11)

### 6-1. 強み

- **SSE 字句単位 streaming:** `useGakuchikaTransport.ts` (517 行) でスムーズな UX
- **coach_progress_message + remaining_questions_estimate:** M4 (2026-04-17) で「あと◯問」表示
- **draft diagnostics tag UI:** strength / issue / recommendation / risk を表示

### 6-2. 弱み

- **`page.tsx` 912 行 + 30+ useState:** 状態管理複雑度高
- **サマリーポーリング 12 秒:** `generate_structured_summary` は client polling (audit 2026-04-12 指摘、未解消)
- **auto-save なし:** conversation resume 時に手動操作必要

### 6-3. 推定スコア: 11/15 (B)

面接機能の pure reducer 抽出 (Stage 9) を適用すれば B+ に。

---

## 7. テスト・信頼性 (配点 10、得点 7)

### 7-1. 強み

- **81 test 関数 / 2,224 行:** normalization 層 unit test が充実
- **prohibited_expressions fallback 検証:** `test_fallback_questions_avoid_prohibited_phrases`
- **Phase 0+1 関連:** STAR realign, draft_ready gate, deepdive_complete, focus tracking で ~20 件緑化

### 7-2. 弱み

- **SSE streaming test ゼロ:** server → client chunk delivery の end-to-end 検証なし
- **Live E2E 収束性未 verify:** `test_gakuchika_live_scenarios.py` に既存 1 件 fail、Phase 0+1 後の再検証ログなし
- **エンドポイント統合テスト thin:** POST `/next-question` の LLM round-trip テスト不足

### 7-3. 推定スコア: 7/10 (B-)

---

## 8. セキュリティ基礎 (配点 10、得点 8)

### 8-1. 強み

- **全 3 handler で認証ガード:** `require_career_principal("ai-stream")` (SSE endpoint)
- **`sanitize_user_prompt_text`:** max_length 3000-5000 字、`PromptSafetyError` exception handling
- **SseLease:** 同時接続 overflow 防止

### 8-2. 弱み

- **NextQuestionRequest に ownership key 無し:** backend が gakuchika_id で ownership check 不可能、frontend 信頼必須
- **rate limiter IP-based:** proxy 環境で bypass risk (audit 指摘)

### 8-3. 推定スコア: 8/10 (A-)

---

## 9. 市場水準との gap (2026-04-17 Web 調査)

### 9-1. 業界標準に到達している機能

- STAR / PREP 構造化 (Phase 0+1 で強化)
- 対話型 depth interview (3 エンドポイント構成 + SSE chat UI)
- 企業連動 (motivation_summary / company_seed 活用、ES 下書きへ)
- 企業別ガクチカ管理 (page.tsx に list view)

### 9-2. 業界標準だが就活Pass が未到達

- **多軸スコアリング:** 内定くんAI の 3 軸 (マッチ度・構成・基本) / Rezi の 23 checkpoints / Jobscan の 30 parameters。就活Pass は単一の completion signal のみ、定量 feedback 弱い
- **エピソード選定推薦:** どのエピソードが応募企業に最適かの推論なし (内定くんAI のみ実装確認)

### 9-3. 業界空白地帯 (就活Pass が取りにいける)

- **ガクチカ専用多軸スコア** (業界で空白、LP 訴求力大)
- **面接齟齬リスク警告** (ガクチカと想定面接回答の整合性)
- **圧迫面接シミュ** (ガクチカ → 面接対策への連携)
- **厚労省 NG 項目ガード** (面接機能で Phase 1 実装済み、ガクチカ質問生成にも転用余地)

---

## 10. 次フェーズ (Phase 2-5) への推奨事項

### 10-1. Phase 2 (プロンプト)
- Few-shot 見本 10+ 追加、AI 臭排除明示禁止、structured_summary 分割

### 10-2. Phase 3 (frontend)
- pure reducer 抽出 (面接 Stage 9 流用)、polling → SSE push 化、auto-save

### 10-3. Phase 4 (es_templates AI 臭)
- 「〜の重要性を学んだ」禁止ルール、retry_guidance 拡張

### 10-4. Phase 5 (テスト拡充)
- SSE streaming test、Live E2E 収束性検証、複数エピソード統合テスト

### 10-5. 体感価値追加候補 (面接 Phase 2 水準)
- ガクチカ専用多軸スコア + evidence-linked rubric
- エピソード選定推薦 dashboard
- 面接機能との連動 (「このガクチカから想定される面接質問」)

**目標:** Phase 2-5 完了時 **85-88/100 Grade A-**、追加体感スコープで **90+/100 Grade A** 到達。

---

## 付録: ファイル規模

| ファイル | 行数 | 備考 |
|---------|----:|------|
| `backend/app/routers/gakuchika.py` | 1,054 | Router (500 行ルール超) |
| `backend/app/prompts/gakuchika_prompts.py` | 530 | Prompt 定数 |
| `backend/app/prompts/gakuchika_prompt_builder.py` | 202 | pure function builder |
| `src/app/(product)/gakuchika/page.tsx` | 912 | 30+ useState |
| `src/hooks/useGakuchikaTransport.ts` | 517 | SSE client |
| `backend/tests/gakuchika/` 合計 | 2,224 | 81 test 関数 |
| `docs/features/GAKUCHIKA_DEEP_DIVE.md` | — | 仕様書 |
