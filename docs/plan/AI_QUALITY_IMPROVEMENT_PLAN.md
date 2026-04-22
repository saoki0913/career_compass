---
topic: ai-quality
plan_date: 2026-04-19
based_on_review: ai_quality_comprehensive_20260419.md
status: 完了（全Phase完了、残タスク3-0b/4-3も2026-04-20に実装済み）
last_update: 2026-04-20
---

# AI機能 品質改善計画 v2

**作成日:** 2026-04-19
**根拠:** `docs/review/ai_quality_comprehensive_20260419.md`（全AI機能 7軸100点満点 包括評価、全体 71/100 B）
**スコープ:** 9領域の横断的品質改善。Phase 1A/1B 並行 → Phase 2 → Phase 3 → Phase 4
**方針:** 依存関係ベースのボトムアップ。レビュー7項目を反映済み。

---

## 0. Context

### 0.1 なぜこの計画が必要か

包括評価で以下の構造的課題が特定された:

1. **企業情報検索が Primary Gate FAIL** — 350社×11コンテンツタイプ=3,850クエリ全てが `empty_response`。全6ゲート 0.0000。ES添削・志望動機の企業グラウンディング品質に直結
2. **LLM基盤の cross-provider fallback が二重に機能しない** — `_feature_cross_fallback_model` 未実装 + network/rate_limit がフォールバック対象外。プロバイダー障害時に全AI機能が停止する単一障害点
3. **プロンプト安全性の出力側ガードレール不在** — 入力側のみ検査（12テストpass）。LLM応答の内部プロンプト漏洩は未チェック

### 0.2 スコア概要

| 領域 | スコア | 等級 | 主な課題 |
|------|:---:|:---:|------|
| ES添削 | 86 | A | hallucination検出、添削理由説明 |
| 面接対策 | 83 | A | 採点キャリブレーション |
| 志望動機 | 80 | A | motivation.py 4,150行分割、embedding重複検出 |
| LLM基盤 | 77 | A | cross-fallback二重問題、観測性不足 |
| ガクチカ | 75 | A | 質問品質自動評価、リトライ機構 |
| 企業RAG | 65 | B | HyDEプロンプト最適化、retrieval品質テスト |
| RAG検索基盤 | 63 | B | BM25日本語品質、チャンクサイズ最適化 |
| プロンプト安全性 | 56 | C | 出力側ガードレール、labeled dataset |
| 企業情報検索 | 54 | C | **Primary Gate FAIL**、God Router分割 |

### 0.3 既存計画との関係

| 既存計画 | 関係 | 現状 (2026-04-20) |
|---------|------|------|
| [ES_REVIEW_QUALITY_IMPROVEMENT_PLAN](ES_REVIEW_QUALITY_IMPROVEMENT_PLAN.md) | Phase 4 で残課題を継続 | **完了** (Phase 10 検証済み 86/100 A)。4-1 hallucination検出は Phase 9 で実装済み。残: 4-2 添削理由説明 |
| [MOTIVATION_QUALITY_IMPROVEMENT_PLAN](MOTIVATION_QUALITY_IMPROVEMENT_PLAN.md) | Phase 3 で残課題を継続 | **完了** (P1-P4 全完了 92/100 A)。3-3a 分割・3-4 embedding重複は実装済み。残: 3-3b few-shot deepdive |
| [GAKUCHIKA_QUALITY_IMPROVEMENT_PLAN](GAKUCHIKA_QUALITY_IMPROVEMENT_PLAN.md) | Phase 3 で残課題を継続 | **完了** (Phase 7-A〜7-H 全完了、judge mean 92/100)。3-0a・3-1・3-2 すべて実装済み |
| [INTERVIEW_QUALITY_IMPROVEMENT_PLAN](INTERVIEW_QUALITY_IMPROVEMENT_PLAN.md) | Phase 3 完了 | **Phase 3 完了** (90+/100 目標, 2026-04-21)。A: prompt/fallback改善, B: UX改善7件, C: テスト拡充 |
| [RAG_ARCHITECTURE_IMPROVEMENT_PLAN](RAG_ARCHITECTURE_IMPROVEMENT_PLAN.md) | Phase 1B/2 が P0 の前提を一部カバー | 未着手。6ゲートFAIL根本原因(web_search.py)はこのスコープ |
| [MAINTAINABILITY_IMPROVEMENT_PLAN](MAINTAINABILITY_IMPROVEMENT_PLAN.md) | Phase 2/3 のファイル分割が M-3/M-4 と連動 | company_info.py・motivation.py 分割完了で連動部分は解消 |

### 0.4 設計方針

```
                ┌─────────────────┐  ┌─────────────────────┐
                │  Phase 1A       │  │  Phase 1B            │
                │  基盤安定化     │  │  検索基盤修復        │
                │  (LLM+安全性)   │  │  (Primary Gate FAIL) │
                └────────┬────────┘  └──────────┬──────────┘
                         │                      │
                         └──────────┬───────────┘
                                    ▼
                         ┌──────────────────────┐
                         │  Phase 2              │
                         │  検索品質向上         │
                         │  (RAG+企業検索分割)   │
                         └──────────┬───────────┘
                                    ▼
                         ┌──────────────────────┐
                         │  Phase 3              │
                         │  会話型機能改善       │
                         │  (ガクチカ+志望動機)  │
                         └──────────┬───────────┘
                                    ▼
                         ┌──────────────────────┐
                         │  Phase 4              │
                         │  コア機能仕上げ       │
                         │  (ES添削+面接対策)    │
                         └──────────────────────┘
```

- **Phase 1A / 1B は完全並行**: LLM基盤変更と Primary Gate FAIL 調査は独立。1B は既存モデル呼び出しのまま切り分け
- **Phase 2 以降は直列**: 検索基盤修復の結果が上位の品質改善の前提

---

## Phase 1A: 基盤安定化（LLM基盤 + プロンプト安全性）

### 1A-1: cross-provider fallback 二重問題修正 + 観測性

| 項目 | 内容 |
|------|------|
| **対象ファイル** | `backend/app/utils/llm_model_routing.py`, `backend/app/utils/llm.py`, `backend/app/utils/llm_client_registry.py` |
| **作業内容** | (1) `_feature_cross_fallback_model` 実装（`llm_model_routing.py:149-151`）(2) `llm.py:1252` の error_type フィルタ修正（network/rate_limit をフォールバック対象に追加）(3) CircuitBreaker にイベント発火追加 |
| **受け入れ条件** | フォールバック発火時にログ出力（失敗理由・選択モデル・レイテンシ） / `secure_logger` 経由で構造化ログ（JSON形式） / テスト: フォールバック経路の動作確認 + 既存テスト全pass |
| **工数感** | 中 |
| **根拠** | 現状: CircuitBreaker はイベント未発火、レイテンシ未計測。観測なしだと障害の見え方が変わるため、メトリクスを受け入れ条件に含める |

### 1A-2: 出力側ガードレール追加（ログのみティア）

| 項目 | 内容 |
|------|------|
| **対象ファイル** | `backend/app/utils/llm_prompt_safety.py`, `backend/app/utils/llm.py` |
| **作業内容** | (1) LLM応答の内部プロンプト漏洩検出関数 `detect_output_leakage` を追加 (2) 検出方式: システムプロンプトとの embedding cosine類似度（閾値 0.8）+ regex パターン（`[SYSTEM]`, `role:` 等）(3) 検出時はログ記録のみ（ブロック・マスクしない） |
| **受け入れ条件** | 検出時に `secure_logger` へ構造化ログ出力 / 偽陽性計測の仕組み（ログから集計可能な形式） / エスカレーション基準の文書化: 2週間のログ蓄積後、FP率 < 2% ならマスクティアに昇格 |
| **段階的強化ロードマップ** | ログのみ（2週間）→ マスク（該当部分を置換、2週間）→ ブロック（FP率 < 0.5% 確認後） |
| **工数感** | 中 |

### 1A-3: プロンプト安全性テスト拡充（labeled dataset + precision/recall）

| 項目 | 内容 |
|------|------|
| **対象ファイル** | `backend/tests/shared/test_prompt_safety.py`, 新規: `backend/tests/shared/fixtures/prompt_safety_dataset.json` |
| **作業内容** | (1) positive/negative labeled dataset 構築（攻撃パターン 50+ / 正常パターン 100+）(2) precision/recall 計測フレームワーク (3) 1A-2 の出力側検出もテスト対象に含める |
| **受け入れ条件** | precision >= 0.95, recall >= 0.90 を CI ゲート化 / 入力側 + 出力側の両方をカバー |
| **工数感** | 中 |

---

## Phase 1B: 検索基盤修復（Primary Gate FAIL 調査・修正）— Phase 1A と完全並行

> **前提**: 1B は既存のモデル呼び出し・LLM基盤をそのまま使って調査する。LLM基盤の変更（1A-1）とは独立。

### 1B-0: FAIL 定義と再現手順の固定（1日）

| 項目 | 内容 |
|------|------|
| **作業内容** | (1) `make backend-test-live-search` で再現確認 (2) 6ゲート閾値（overall 0.95 / recruitment 0.95 / corporate 0.94 / candidate_mrr 0.75 / ndcg@5 0.80 / mean_grade 0.85）を明文化 (3) 100% hard failure の意味を切り分け（データ未投入 vs ロジックバグ vs インフラ障害） |
| **対象ファイル** | `backend/evals/company_info_search/config.py`, `Makefile` |
| **成果物** | 再現手順 + FAIL 定義の1ページドキュメント |

### 1B-1: Primary Gate FAIL 原因調査

| 項目 | 内容 |
|------|------|
| **対象ファイル** | `backend/evals/company_info_search/`, `backend/app/routers/company_info.py`, `backend/evals/company_info_search/runner.py`, `backend/evals/company_info_search/judge.py` |
| **作業内容** | (1) ログ・固定シードの整理 (2) 全3,850クエリが `empty_response` / `hard_fail` になる原因の特定: データストア空？インデックス未構築？API接続エラー？ロジックバグ？ (3) 原因に応じた修正範囲の見積もり |
| **工数感** | 小（調査のみ） |

### 1B-2: 調査結果に基づく修正

| 項目 | 内容 |
|------|------|
| **作業内容** | 1B-1 の結果次第（データ投入のみなら小、ロジック修正なら中〜大） |
| **受け入れ条件** | `make backend-test-live-search` で 6ゲートのうち少なくとも 3 ゲート PASS |

### 1B-3: BM25 日本語品質評価・チャンクサイズ最適化 — 条件付き実行

| 項目 | 内容 |
|------|------|
| **対象ファイル** | `backend/app/utils/bm25_store.py`, `backend/app/utils/text_chunker.py`, `backend/app/utils/japanese_tokenizer.py` |
| **実行条件** | **1B-1 の結論が「検索ロジック起因」の場合のみ着手**。データ未投入のみが原因なら本タスクはスキップし、Phase 2 の eval 定常化に統合 |
| **作業内容** | (1) BM25 日本語トークナイズ品質の定量評価 (2) チャンクサイズ(500)/オーバーラップ(100) の最適化実験 (3) コンポーネント別テスト追加 |
| **工数感** | 中 |

### 1B-4: コンポーネント別テスト追加

| 項目 | 内容 |
|------|------|
| **対象ファイル** | `backend/tests/` に新規追加 |
| **作業内容** | bm25_store, reranker, japanese_tokenizer のユニットテスト |
| **工数感** | 中 |

---

## Phase 2: 検索品質向上（企業RAG + 企業情報検索リファクタ）

> **着手条件**: Phase 1B-2 完了（Primary Gate FAIL の原因修正済み）

### 2-1a: `company_info.py` ファイル分割（挙動不変リファクタのみ）

| 項目 | 内容 |
|------|------|
| **対象ファイル** | `backend/app/routers/company_info.py`(3,216行) → 複数ファイル |
| **作業内容** | **挙動不変の機械的リファクタのみ**。ルート定義・データ変換・外部API呼び出し・バリデーションを責務別ファイルに分離。プロンプトはまだ触らない |
| **受け入れ条件** | 全既存テスト pass / `make backend-test-live-search` のスコアが分割前と同一 |
| **工数感** | 中〜大 |

### 2-1b: プロンプト外部化（分割後）

| 項目 | 内容 |
|------|------|
| **対象ファイル** | 2-1a で分離されたファイル群 → `backend/app/prompts/company_info_prompts.py` |
| **作業内容** | LLM抽出プロンプトを `prompts/` に外部化。テンプレート化して改善イテレーションを容易にする |
| **受け入れ条件** | eval スコア不変 / プロンプト変更が prompts/ 内で完結する |
| **工数感** | 中 |

### 2-2: HyDE プロンプト日本語最適化・few-shot 追加

| 項目 | 内容 |
|------|------|
| **対象ファイル** | `backend/app/utils/hybrid_search.py` |
| **作業内容** | HyDE 生成の日本語品質改善、クエリ拡張プロンプトに few-shot 例追加 |
| **工数感** | 中 |

### 2-3: retrieval 品質テスト拡充・eval 定常化

| 項目 | 内容 |
|------|------|
| **対象ファイル** | `backend/evals/rag/`, `backend/evals/company_info_search/` |
| **作業内容** | (1) eval を CI/定期実行に組み込み (2) リグレッション検出の閾値設定 (3) baseline 管理の自動化 |
| **受け入れ条件** | 6ゲート全 PASS（overall 0.95 / recruitment 0.95 / corporate 0.94 / candidate_mrr 0.75 / ndcg@5 0.80 / mean_grade 0.85） |
| **工数感** | 中 |

---

## Phase 3: 会話型機能改善（ガクチカ + 志望動機）— 実質完了

> **着手条件**: Phase 2 の企業情報検索品質が安定（6ゲート PASS 目処）
>
> **実装状況 (2026-04-20):** 独立プランにより大半が実装済み。
> - 3-0a: **完了** — GAKUCHIKA_QUALITY_IMPROVEMENT_PLAN Phase 7-B で Jaccard bigram ループ検出実装
> - 3-1: **完了** — Phase 7-D 質問品質自動評価 (14禁止パターン) + 7-C 4グループカバレッジ動的計画
> - 3-2: **完了** — Phase 7-E 4段階リトライ + SSE契約変更
> - 3-3a: **完了** — MOTIVATION_QUALITY_IMPROVEMENT_PLAN P1 で13モジュール分割 (4,150行→6,525行/13ファイル)
> - 3-4: **完了** — P4-2 semantic confirmation 実装済み
> - 3-0b: **未実装** — テスト分離は未着手
> - 3-3b: **完了** — MOTIVATION P1-P4 で実装済み（deepdive few-shot 3例 + 6要素4段階充足基準 → 92/100達成）

### 3-0a: テストインフラ修正 — フォールバック汚染排除（前提作業・最優先）

| 項目 | 内容 |
|------|------|
| **根拠** | v3 live test で 6/8 ケースが `GAKUCHIKA_FALLBACK_ANSWERS` 汚染の影響を受けた（詳細: `ai_quality_comprehensive_20260419.md` Appendix A-1） |
| **対象ファイル** | `backend/tests/conversation/conversation_runner.py` L23-29/L174, ケース定義元 |
| **作業内容** | ① extended 5ケースの answers を各 8 件以上に拡充（各シナリオのドメインに適合した回答） ② フォール���ック閾値を `>= 4` から `>= 8` に引き上げ ③ `GAKUCHIKA_FALLBACK_ANSWERS` のグローバル塾講師シナリオを廃止し、汎用 STAR 質問応答テンプレ���トに置換 |
| **受け入れ条件** | v3 テスト再実行でフォールバック汚染 0 件。全 8 ケースが case_answers のみで会話完了 |
| **工数感** | 小 |
| **備考** | LLM 品質改善ではないが、3-1 以降の品質改善効果を正確に測定するための前提条件 |

### 3-0b: 企業コンテキスト有り/無しのテスト分離（前提作業）

| 項目 | 内容 |
|------|------|
| **作業内容** | 志望動機・ガクチカの質問品質評価テストを「企業情報を使うケース」と「使わないケース」に分離。Phase 2 の検索品質変動がテスト結果にノイズを入れないようにする |
| **工数感** | 小 |

### 3-1: ガクチカ — 質問品質の自動評価基盤（v3 live test 結果で拡充）

| 項目 | 内容 |
|------|------|
| **対象ファイル** | `backend/app/routers/gakuchika.py`, `backend/app/prompts/gakuchika_prompts.py`, `backend/app/prompts/gakuchika_prompt_builder.py`, `backend/tests/gakuchika/` |
| **作業内容** | ① **質問ループ検出+スキップ** (v3 新規): 直近 N 問の質問テキスト類似度を計���し、閾値超の重複質問を検出。検出時に `blocked_focuses` に追加し次の question_group にスキップ ② **question_group 動的計画** (v3 新規): `satisfied_groups` を本番ループ中にトラッキングし、未到達グループへの��移をプロンプトに明示注入 ③ question_group ごとの到達率メトリクスを SSE イベントに含める ④ 到達率が閾値未満の場合に質問計画を動的調整 |
| **受け入れ条件** | AI Live テストで `required_question_group_miss` = 0 件 AND ループ起因の `conversation_did_not_reach_draft_ready` = 0 件 |
| **工数感** | 中〜大 |
| **v3 エビデンス** | scope_and_role: 3x loop / team_conflict: 8+x loop / volunteer_outreach: 11x loop / 4ケース全て satisfied_groups=1/2 |

### 3-2: ガクチカ — リトライ機構追加

| 項目 | 内容 |
|------|------|
| **対象ファイル** | `backend/app/routers/gakuchika.py` |
| **作業内容** | ES添削の5段階リトライを参考に、質問生成のリトライ機構を追加 |
| **工数感** | 中 |

### 3-3a: `motivation.py` ファイル分割（挙動不変リファクタのみ）

| 項目 | 内容 |
|------|------|
| **対象ファイル** | `backend/app/routers/motivation.py`(4,150行) → 複数ファイル |
| **作業内容** | **挙動不変の機械的リファクタのみ**。会話管理・slot-fill・deepdive・draft 生成を責務別に分離 |
| **受け入れ条件** | 全既存テスト pass |
| **工数感** | 大 |

### 3-3b: 志望動機プロンプト改善（分割後）

| 項目 | 内容 |
|------|------|
| **作業内容** | 深掘り段階の few-shot 例追加、6要素充足基準の明確化 |
| **工数感** | 中 |

### 3-4: embedding 類似度による意味的重複検出

| 項目 | 内容 |
|------|------|
| **対象ファイル** | `backend/app/routers/motivation.py`（分割後の該当ファイル） |
| **作業内容** | 既存の `_semantic_question_signature` + `_ensure_distinct_question` を補完。embedding cosine 類似度で類義質問を検出 |
| **工数感** | 中 |

---

## Phase 4: コア機能仕上げ（ES添削 + 面接対策）— 一部完了

> **実装状況 (2026-04-20):** 独立プランにより大半が実装済み。
> - 4-1: **完了** — GAKUCHIKA_QUALITY_IMPROVEMENT_PLAN Phase 7-F ドラフト事実矛盾検出 / ES_REVIEW_QUALITY_IMPROVEMENT_PLAN Phase 9 hallucination検出
> - 4-2: **完了** — `es_review_explanation.py` で改善理由3-5箇条書き生成 + SSEストリーミング + UI表示実装済み
> - 4-3: **未実装** — 採点キャリブレーション（人間評価一致率測定）

### 4-1: ES添削 — hallucination 検出

| 項目 | 内容 |
|------|------|
| **対象ファイル** | `backend/app/routers/es_review_validation.py` |
| **作業内容** | ユーザー原文に存在しない事実を LLM が生成するケースの検出。原文との照合ロジック追加 |
| **工数感** | 中〜大 |

### 4-2: ES添削 — 添削理由の説明生成

| 項目 | 内容 |
|------|------|
| **対象ファイル** | `backend/app/prompts/es_templates.py`, `backend/app/routers/es_review.py` |
| **作業内容** | diff 表示（既存）に加え、「なぜこう直したか」の説明文を生成 |
| **工数感** | 中 |

### 4-3: 面接 — 採点キャリブレーション

| 項目 | 内容 |
|------|------|
| **対象ファイル** | `backend/tests/interview/harness/evaluator.py` |
| **作業内容** | BARS+Evidence-Linked ルブリックの人間評価との一致率測定 |
| **工数感** | 中〜大 |

---

## フェーズ間の依存関係と判断ポイント

| 判断ポイント | タイミング | 判断基準 | 影響 |
|-------------|-----------|---------|------|
| 1B-1 結論 | Phase 1B-1 完了時 | FAIL 原因がデータ/ロジック/インフラのどれか | 1B-3 の実行可否、Phase 2 の工数再見積もり |
| 1A-2 FP率 | 1A-2 導入2週間後 | FP率 < 2% か | マスクティアへの昇格可否 |
| Phase 2 eval | 2-3 完了時 | 6ゲート PASS か | Phase 3 着手可否 |
| 3-0a テスト再実��� | 3-0a 完了時 | フォールバック汚染 0 件か | 3-1 品質改善の計測信頼性 |
| 3-0b テスト分離 | Phase 3 冒頭 | 企業コンテキスト依存の影響度 | 3-1〜3-4 のテスト信頼性 |

## 初手の進め方

**並行ブランチ2本を同週に着手**:
- **Branch A**: 1A-1（cross-fallback 修正 + 観測性）から開始
- **Branch B**: 1B-0（FAIL 定義と再現手順の固定）→ 1B-1（原因調査）

1B-1 の結果が「データ未投入のみ」なら Phase 2 の工数は大幅に縮小し、「検索ロジック起因」なら 1B-3 に着手する。
