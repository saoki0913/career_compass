# プラン実行順序

**最終更新**: 2026-04-20
**進捗追跡**: [docs/review/TRACKER.md](../review/TRACKER.md)

---

## AI品質改善計画: 完了

**計画書**: [AI_QUALITY_IMPROVEMENT_PLAN.md](AI_QUALITY_IMPROVEMENT_PLAN.md)
**根拠**: [包括評価 2026-04-19](../review/ai_quality_comprehensive_20260419.md)（全体 71/100 B）
**完了日**: 2026-04-20

### 完了フェーズ

| Phase | 内容 | 完了日 | 備考 |
|-------|------|:---:|------|
| **1A** | cross-fallback修正+観測性、出力ガードレール、labeled dataset | 2026-04-19 | 子プラン1・3 完了 |
| **1B** | Primary Gate FAIL調査・修正、eval runner bug fix | 2026-04-19 | 子プラン2 完了 |
| **2** | company_info.py 分割、プロンプト外部化、HyDE最適化 | 2026-04-20 | 子プラン4 完了（フォールバック適用: 6ゲートFAIL、原因は web_search.py 側） |
| **3** | ガクチカ+志望動機の品質改善 | 2026-04-20 | 独立プラン（GAKUCHIKA/MOTIVATION）で実質完了 |
| **3-0b** | 企業コンテキスト有り/無しテスト分離 | 2026-04-20 | pytest マーカー `uses_company_context` / `no_company_context` 追加 |
| **4 (一部)** | ES添削 hallucination検出 | 2026-04-20 | ES_REVIEW Phase 9 で完了 |
| **4-3** | 面接 採点キャリブレーション | 2026-04-20 | GPT-5.4 LLM judge、Cohen's kappa、`make backend-test-interview-calibration` |

> **Note:**
> - 4-2（ES添削 添削理由説明生成）は `es_review_explanation.py` で実装済み
> - 3-3b（志望動機 few-shot deepdive）は MOTIVATION P1-P4 で実装済み（92/100達成）

### 子プラン一覧

| 子プラン | スコープ | ステータス |
|---------|---------|-----------|
| [Phase 1A-1 / 1B-0 / 1B-1](AI_QUALITY_IMPROVEMENT_PHASE1A1_1B01_PLAN.md) | cross-fallback + FAIL調査 | 完了 |
| [Phase 1A-2 / 1A-3 / 1B-2](AI_QUALITY_IMPROVEMENT_PHASE1A2_1A3_1B2_PLAN.md) | 出力ガードレール + labeled dataset + eval修正 | 完了 |
| [Phase 1B-3/4 or 2-1a](AI_QUALITY_IMPROVEMENT_PHASE_1B34_OR_2_PLAN.md) | Route A: God Router分割 | 完了 |
| [Phase 2 残り](AI_QUALITY_IMPROVEMENT_PHASE2_REMAINING_PLAN.md) | 2-1b + 2-2 + 2-3 | 完了（フォールバック適用） |

---

## 完了済み計画

### Phase 0: セキュリティ — 完了

**計画書**: [SECURITY_HOTFIX_PLAN.md](SECURITY_HOTFIX_PLAN.md), [LLM_COST_CONTROL_PLAN.md](LLM_COST_CONTROL_PLAN.md)

Phase 0a（SECURITY_HOTFIX）+ Phase 0b（LLM_COST_CONTROL）全タスク完了。

### Phase 1 (旧): 機能品質 — 各プラン個別完了

| 計画書 | ステータス |
|--------|-----------|
| [ES_REVIEW_QUALITY_IMPROVEMENT_PLAN](ES_REVIEW_QUALITY_IMPROVEMENT_PLAN.md) | 完了（Phase 10 検証済み、86/100 A）。残課題 4-2 は AI品質改善の残タスクとして管理 |
| [MOTIVATION_QUALITY_IMPROVEMENT_PLAN](MOTIVATION_QUALITY_IMPROVEMENT_PLAN.md) | 完了（P1-P4 全完了、92/100 A）。3-3b は AI品質改善の残タスクとして管理 |
| [GAKUCHIKA_QUALITY_IMPROVEMENT_PLAN](GAKUCHIKA_QUALITY_IMPROVEMENT_PLAN.md) | 完了（Phase 7-A〜7-H 全完了、133 tests、judge mean 92/100） |
| [INTERVIEW_QUALITY_IMPROVEMENT_PLAN](INTERVIEW_QUALITY_IMPROVEMENT_PLAN.md) | Phase 2 完了（83/100 A）。残課題 4-3 は AI品質改善の残タスクとして管理 |

### Phase 3 (旧): ハーネス — 完了

**計画書**: [HARNESS_IMPROVEMENT_PLAN.md](HARNESS_IMPROVEMENT_PLAN.md) — v4 完了。

### LP — 完了

**計画書**: [LP_IMPROVEMENT_PLAN.md](LP_IMPROVEMENT_PLAN.md) — SEO 改善フェーズ完了。

---

## 未着手計画（AI品質改善の残タスク完了後に検討）

### RAG 基盤

**計画書**: [RAG_ARCHITECTURE_IMPROVEMENT_PLAN.md](RAG_ARCHITECTURE_IMPROVEMENT_PLAN.md)

AI品質改善の Phase 1B/2 が P0 の前提を一部カバー。残項目（P0-2 tenant fail-closed、P0-3 OTel）は AI品質改善完了後に再評価。company-info-search の 6ゲート FAIL 根本原因（web_search.py のクエリ生成・リランキング）もこのスコープで対応。

### 保守性

**計画書**: [MAINTAINABILITY_IMPROVEMENT_PLAN.md](MAINTAINABILITY_IMPROVEMENT_PLAN.md)

Phase 0/1/2/4 完了済み。Phase 3/5/6 残件。AI品質改善で company_info.py / motivation.py の分割が完了し、M-3/M-4 と連動する部分は解消。

### Architecture Direction

**計画書**: [MAINTAINABILITY_IMPROVEMENT_PLAN.md](MAINTAINABILITY_IMPROVEMENT_PLAN.md)

canonical 判定 (2026-04-17): MAINTAINABILITY = canonical / [CLEAN_ARCHITECTURE_REFACTORING](CLEAN_ARCHITECTURE_REFACTORING.md) = superseded。

### DB 再設計

**計画書**: [DB_REDESIGN_PLAN](DB_REDESIGN_PLAN.md)

blast radius 最大。全品質改善完了後に別スプリントで実施。

---

## 依存根拠

### AI品質改善の Phase 順序

- **Phase 1A/1B 並行**: LLM基盤変更（`llm_model_routing.py`, `llm.py`）と Primary Gate FAIL 調査（`company_info.py`, `evals/`）はファイル・機能が完全に独立
- **Phase 1B → Phase 2**: 検索基盤の FAIL 原因が判明しないと、分割やプロンプト外部化の境界判断ができない
- **Phase 2 → Phase 3**: 志望動機は企業 RAG/企業情報に依存。検索品質が不安定だとテスト結果にノイズが入る。3-0 でテスト分離を先行
- **Phase 3 → Phase 4**: ES添削・面接は既に A 評価。B/C 圏の底上げを優先
- **巨大ファイル分割は2段階**: (a) 挙動不変の機械的分割 → (b) プロンプト外部化。同一 PR にするとレビュー負荷が大きい
- **1B-3 は条件付き**: FAIL がデータ要因のみなら BM25/チャンク最適化はスキップし、eval 定常化に統合

### 旧 Phase 1 (機能品質) の各プラン依存

- `backend/app/prompts/es_templates.py` を ES_REVIEW / MOTIVATION / GAKUCHIKA が変更する競合点は、各プラン完了により解消済み
- 残課題は AI品質改善計画の対応する Phase に引き継ぎ

### DB_REDESIGN は最後

- 他計画の前提になっていない
- 変更範囲が最大: `src/lib/db/schema.ts`, `drizzle_pg/`, 多数の API/loader
- 品質改善群を収束させた後に別スプリントで実施するのが最も安全

---

## 新しい Phase の追加

末尾に Phase N として追加するか、Phase N.5 で既存 Phase 間に挿入する。
計画書を追加したら [TRACKER.md](../review/TRACKER.md) にも行を追加すること。
