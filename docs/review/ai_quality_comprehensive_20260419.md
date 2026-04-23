# 就活Pass AI機能 包括品質評価レポート (2026-04-19)

## 実行環境

| 項目 | 値 |
|------|------|
| git branch | `develop` (uncommitted changes あり) |
| 実行日 | 2026-04-19 |
| 監査手法 | コード・プロンプト・テスト・eval結果・フロントエンドUI の静的解析 + 既存live eval結果の参照 |
| 採点軸 | 7 軸 × 100 点満点 (プロンプト 22 / 正確性 20 / 価値 20 / 耐性 13 / テスト 10 / 設計 8 / 安全 7) |
| 対象 | コア4機能 + 企業RAG + 企業情報検索 + RAG検索基盤 + LLM基盤 + プロンプト安全性 (計9領域) |
| 関連 | 個別機能 audit (feature/) との相互参照あり。本レポートは横断的な比較評価に特化 |

> **v2 修正**: quality-review フィードバックを受け6点の事実誤認を修正。ES添削のdiff表示存在、面接の法定遵守テスト存在、志望動機の重複回避実装、LLM基盤のfallback因果関係、企業情報検索のPrimary Gate FAIL反映、プロンプト安全性のテスト数修正。

---

## 1. エグゼクティブサマリー

### 評価軸と配点

| # | 評価軸 | 配点 | 重み根拠 |
|---|--------|------|----------|
| A | **プロンプト設計の成熟度** | **22** | AI出力の品質上限を決定 |
| B | **AI出力の正確性・信頼性** | **20** | 誤った添削・アドバイスは就活生に直接不利益 |
| C | **ユーザー価値（就活生への実用性）** | **20** | サービスが就活生の成功に寄与するかの最終指標 |
| D | **エラー耐性・リカバリ設計** | **13** | LLM出力は非決定論的。失敗時の復旧力が品質を左右 |
| E | **テスト・品質保証** | **10** | 品質維持の自動テストと評価基盤 |
| F | **アーキテクチャ・保守性** | **8** | 長期的な機能改善速度への影響 |
| G | **安全性・コンプライアンス** | **7** | インジェクション防御、法的リスク、個人情報保護 |

### 総合スコア一覧

| 領域 | A(22) | B(20) | C(20) | D(13) | E(10) | F(8) | G(7) | **合計** | **等級** |
|------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| 1. ES添削 | 19 | 16 | 19 | 12 | 8 | 6 | 6 | **86** | **A** |
| 2. 志望動機 | 18 | 17 | 16 | 10 | 7 | 6 | 6 | **80** | **A** |
| 3. 面接対策 | 18 | 14 | 20 | 10 | 7 | 7 | 7 | **83** | **A** |
| 4. ガクチカ深掘り | 17 | 11 | 14 | 8 | 6 | 7 | 5 | **68** | **B** |
| 5. LLM基盤 | 16 | 15 | 18 | 10 | 7 | 6 | 5 | **77** | **A** |
| 6. 企業RAG | 15 | 13 | 14 | 8 | 5 | 6 | 4 | **65** | **B** |
| 7. RAG検索基盤 | 14 | 13 | 12 | 8 | 5 | 6 | 5 | **63** | **B** |
| 8. プロンプト安全性 | 13 | 11 | 10 | 7 | 5 | 5 | 5 | **56** | **C** |
| 9. 企業情報検索 | 13 | 9 | 11 | 7 | 5 | 5 | 4 | **54** | **C** |
| **全体加重平均** | | | | | | | | **70.2** | **B** |

### 等級定義

| 等級 | 基準 | 得点率 |
|------|------|--------|
| S | 業界最高水準 | 90-100% |
| A | 高品質 | 75-89% |
| B | 標準的。明確な改善余地あり | 60-74% |
| C | 課題あり | 40-59% |
| D | 不十分 | 0-39% |

---

## 2. コア4機能の詳細評価

### 2-1. ES添削 — 86点 (A)

> 個別audit: [es_review_quality_audit_20260417_v2.md](feature/es_review_quality_audit_20260417_v2.md) (旧軸72/100 B-)

**強み:**
- `es_templates.py`(2,205行): 9テンプレートに `required_elements`, `anti_patterns`, `retry_guidance`, `playbook` を完備。スタイルルールがスコープ別(all/company/short_only/mid_long)にテンプレート適合性つきで定義
- 企業グラウンディング4段階(none/light/standard/deep)がテンプレートごとに設計
- `LengthControlProfile` がモデルファミリー別×文字数帯×リカバリステージの調整を実装
- `es_review_retry.py`(871行): strict→focused retry×2→length-fix→degraded→422 の5段階リトライ
- `es_review_validation.py`(983行): 文字数検証、AI臭7カテゴリ検出、結論ファーストシグナル検出
- **diff表示UI**: `ReflectModal.tsx:141`に`DiffHighlightView`(追加=緑/削除=赤+取消線)、`text-diff.ts:98`にLCSベースの日本語文節diff計算エンジン。デスクトップ2パネル/モバイル1パネル対応
- テスト約183,000行: template_repairs, prompt_structure, final_quality_cases, reference_es_quality

**減点根拠:**
- **B軸-4点**: hallucination検出(ユーザーが言っていない事実をLLMが生成)がバリデーション層に不在。AI臭検出は表層パターンマッチのみ
- **C軸-1点**: 添削受容率の追跡フィードバックループが未実装。diff表示はあるが「なぜこう直したか」の説明生成はない
- **F軸-2点**: `es_review.py`(1,279行)と`es_review_orchestrator.py`(1,284行)の責務境界がやや曖昧

**旧audit (6軸72点) との差異**: 旧auditは「差分可視化UIなし [U-01]」を減点していたが、`ReflectModal.tsx` + `text-diff.ts` にLCSベースdiff UIが実装済みのため本評価では加点。また旧auditの「機能専門性」30点配点に対し本評価は「プロンプト設計」22点+「正確性」20点で見ており、プロンプト設計の高品質が反映されやすい

---

### 2-2. 志望動機 — 80点 (A)

> 個別audit: [motivation_quality_audit_20260412.md](feature/motivation_quality_audit_20260412.md) (旧軸95+ A+)

**強み:**
- `motivation_prompts.py`(256行): 6要素骨格の判定基準が明確。グラウンディングルール(「事実として断定せず、関心の有無を問う形に」)
- `motivation_context.py`(777行): semantic confirmation、causal gaps、矛盾検出、一般論フィルタ
- slot-fill + deepdive の2段階会話型UX
- **サーバー側重複回避**: `motivation.py:1431` `_semantic_question_signature`(stage/intent/anchor等5項目の意味的シグネチャ) + `motivation.py:1479` `_ensure_distinct_question`(会話履歴との文字レベル重複検出+fallback質問生成)
- テスト約39,000行: semantic_confirm, fallback_validation, confidence_scoring, draft_selection

**減点根拠:**
- **A軸-4点**: 深掘り段階のプロンプトにfew-shot例がない。6要素の充足基準に曖昧な部分あり
- **B軸-3点**: 重複回避はシグネチャベースで実装済みだが、embedding類似度による意味的重複検出は未実装。類義質問(言い回しだけ異なる)の検出に限界
- **D軸-3点**: ES添削のような多段階リトライ機構がない
- **F軸-2点**: `motivation.py`が4,150行のGod Router

---

### 2-3. 面接対策 — 83点 (A)

> 個別audit: [interview_quality_audit_20260412.md](feature/interview_quality_audit_20260412.md) (Phase 2完了時 旧軸91/100 A)

**強み:**
- `interview_prompts.py`(437行): 3ギア×4ペルソナ×3面接段階×4方式。`FOLLOWUP_STYLE_POLICY`で33パターンの決定論的マトリックス
- `SCORING_RUBRIC`: BARS+Evidence-Linked の7軸×6段階採点基準
- 3モデル分業: GPT-5.4(計画), Haiku(質問), Sonnet(講評)
- **法定遵守テスト**: `harness/evaluator.py:197`に`FORBIDDEN_DISCRIMINATORY_PATTERNS`(厚労省14事項の正規表現14個)定義。`test_harness_deterministic.py:141`で24ケース×4テスト=96 assertionsでfallback質問の差別パターン不在を検証
- 各フェーズにfallbackペイロード生成関数を完備
- テスト約124,000行: deterministic, streaming, prompt_shapes
- テキストベース模擬面接としてのユーザー価値は十分（音声入力は現フェーズの対象外）

**減点根拠:**
- **B軸-6点**: 採点ルブリックのキャリブレーション(人間評価との一致率)が未測定。質問品質の自動評価がLLM自己評価に依存

**旧audit (Phase 2完了91点) との差異**: 旧auditは6軸(コード品質15/AI20/機能30/UX15/テスト10/セキュリティ10)で「機能専門性」30点配点が大きく、Stage 0-10の充実した改善が高反映された。本評価は「正確性」軸で採点キャリブレーション未測定を厳しく評価

---

### 2-4. ガクチカ深掘り — 68点 (B)　※v3 live test 結果で 75→68 に再評価

> 個別audit: [gakuchika_quality_audit_20260417.md](feature/gakuchika_quality_audit_20260417.md) (旧軸72/100 B-) / [cycle 1 実測](feature/gakuchika_prompt_measurement_20260418.md) (judge 91.96/100 A)
> v3 live test 詳細: Appendix A

**強み:**
- `gakuchika_prompts.py`(531行): 14禁止表現パターン。良い質問/悪い質問の比較例
- `input_richness_mode`(seed_only/rough_episode/almost_draftable)による質問戦略の動的切替
- 深掘り8観点(role, challenge, action_reason, result_evidence, learning_transfer, credibility, future, backstory)
- `STRUCTURED_SUMMARY_PROMPT`でSTAR構造化+面接対策メモ生成
- 明確なレイヤー分離: prompts→prompt_builder→normalization→evaluators→text helpers→router
- cycle 1 golden set 実測: judge mean 4.598/5、Tier 1 AI臭 -82% (28→5)（静的トランスクリプト評価）

**v3 live test (8ケース) で判明した課題:**
- **pass=1 / degraded=3 / fail=4**
- 8ケース中6ケースがテストインフラのフォールバック汚染の影響を受けている（Appendix A-1）
- 汚染を除外しても、LLM品質に3つの構造的課題が確認された（Appendix A-2）

**減点根拠:**
- **B軸-9点 (14→11)**: 質問品質はLLM自己評価に強く依存（既知）。加えてv3で質問ループ（同一質問を3〜11回反復、リダイレクトなし）+ question_groupカバレッジ偏り（4件全て satisfied_groups=1/2、「結果数値確認」に偏重し role/motivation/learning に遷移しない）が判明
- **C軸-6点 (16→14)**: live test pass率 1/8。テストインフラ汚染を差し引いても、3 degraded + 2 real fail は実ユーザー体験にギャップあり
- **D軸-5点 (9→8)**: 多段階リトライ機構なし（既知）。加えて質問ループ状態からの回復機構なし（ループ検出→トピックスキップの仕組み不在）
- **E軸-4点 (7→6)**: テストインフラに `GAKUCHIKA_FALLBACK_ANSWERS` 汚染バグ（`conversation_runner.py` L23-29 のグローバルfallbackが6/8ケースに塾講師シナリオの回答を注入）
- **G軸-2点**: 固有のインジェクション検出なし。学生エピソード中の個人情報の取り扱いルールが不明確

---

## 3. 基盤層の詳細評価

### 3-1. LLM基盤 — 77点 (A)

**強み:**
- `llm.py`(2,810行)+5サブモジュール計5,538行の包括的基盤
- `CircuitBreaker`(threshold=3, reset_timeout=5min)
- エラー分類: billing/rate_limit/network/auth/parse/unknown の6種
- JSON修復(ストリーミング中含む)、コスト推定(contextvars)
- LLMコスト情報は運営側の価格設計・分析用途に限定しており、ユーザーに非公開なのは意図的な設計

**減点根拠(実コード検証済):**
- **B軸-5点, D軸-3点**: cross-provider fallbackが**二重に機能しない**。(1) `_feature_cross_fallback_model`が`return None`のまま未実装(`llm_model_routing.py:149-151`)、(2) `llm.py:1252`で`error_type not in {"billing", "rate_limit", "network"}`のためrate_limit/networkエラー（最も一般的な障害）がフォールバック対象外
- **C軸-2点**: レスポンス時間SLAの仕組みがない
- **F軸-2点**: `llm.py`が2,810行

### 3-2. 企業RAG — 65点 (B)

**強み:**
- HyDE+マルチクエリ拡張→Dense+Sparse→RRF融合→Cross-Encoder rerankの多段階パイプライン
- `CONTENT_TYPE_BOOSTS`でクエリインテント別重み付け
- `japanese-reranker-small-v2`、A/Bテスト基盤あり

**減点根拠:**
- **A軸-7点**: HyDEプロンプトの日本語最適化が不足。クエリ拡張にfew-shot例なし
- **E軸-5点**: unit testが薄い。350社curated live eval基盤は存在するが最新結果がPrimary Gate FAIL
- **G軸-3点**: RAG経由でのデータリーク防止機構の可視性が低い

### 3-3. RAG検索基盤 — 63点 (B)

**強み:**
- vector_store, hybrid_search, bm25_store, reranker, text_chunker, content_classifier, japanese_tokenizer, embeddings の明確なモジュール分離
- lazy importパターン、embedding backend自動フォールバック

**減点根拠:**
- **A軸-8点**: 日本語クエリ拡張最適化が不十分。企業名表記ゆれ対応が体系化されていない
- **B軸-7点**: BM25日本語トークナイズ品質の評価が不明。チャンクサイズの最適化根拠が不明
- **E軸-5点**: bm25_store, reranker, japanese_tokenizerのテストが不足

> RAG arch 個別audit: [2026-04-17-rag-design-review.md](rag-architecture/2026-04-17-rag-design-review.md)

---

## 4. 横断層の詳細評価

### 4-1. プロンプト安全性 — 56点 (C)

**強み:**
- ホモグリフ対策(25文字マッピング)+NFKC正規化+ゼロ幅文字除去の3層正規化
- high/medium リスクの2段階分類
- `detect_es_injection_risk`でSQL注入、PII抽出、外部機能実行誘導の検出
- テスト12件pass(9関数、parametrized含む): Unicodeバイパス4変種、false positive防止(正常ES/「システム開発」文脈/英語essay)

**減点根拠:**
- **A軸-9点**: パターンが固定リストで新手法への適応性が低い。間接インジェクション(RAGデータ経由)への対策がない
- **B軸-9点**: 偽陽性率・偽陰性率の計測データなし。**出力側ガードレールが未実装** — jailbreak成功時に内部プロンプトや参考ESが漏洩するリスク
- **C軸-10点**: IT系ガクチカで` ``` `がmediumリスクになる等の過剰検出リスク。エラーメッセージが不親切
- **E軸-5点**: 12テストケースはバイパス変種とfalse positive基本ケースをカバーするが、OpenAI Cookbookが推奨するlabeled test dataset + precision/recall計測の方式が未導入

> security 個別audit: [security_audit_2026-04-14.md](security/security_audit_2026-04-14.md)、[llm_ai_security.md](security/llm_ai_security.md)

### 4-2. 企業情報検索 — 54点 (C)

**強み:**
- 締切/募集区分/提出物/応募方法の4要素を自動抽出。各項目に根拠URL+信頼度付与
- PDF/URL両方のingest対応、Firecrawl+httpxのフォールバック
- **350社curated live eval基盤**: `company_loader.py`(企業リスト)、`metrics.py`(0-3 graded relevance)、6項目CI gate check

**減点根拠:**
- **B軸-11点**: **最新eval結果がPrimary Gate FAIL**(`live_company_info_search_20260418_142454_curated.md`)。350社×11コンテンツタイプ=3,850クエリ中、全クエリが`empty_response`(Grade ERROR 100%)。overall/recruitment/corporate/candidate_mrr/ndcg@5/mean_grade_scoreの全6ゲートが0.0000でFAIL
- **A軸-9点**: LLM抽出プロンプトが`company_info.py`(3,216行)に埋め込まれたまま未分離
- **D軸-6点**: 外部サービス(DuckDuckGo, Firecrawl)障害時のフォールバックが限定的
- **F軸-3点**: `company_info.py`が3,216行のGod Router

---

## 5. 改善優先度ランキング

優先度 = (100 - スコア) × ユーザーインパクト × 改善容易度

| 順位 | 領域 | スコア | 最優先改善アクション |
|:---:|------|:---:|------|
| **1** | 企業情報検索 | 54 | Primary Gate FAILの原因調査・修正、プロンプト外部化、`company_info.py`分割 |
| **2** | プロンプト安全性 | 56 | 出力側ガードレール追加、labeled test dataset構築、precision/recall計測導入 |
| **3** | RAG検索基盤 | 63 | BM25日本語品質評価、チャンクサイズ最適化、コンポーネント別テスト追加 |
| **4** | 企業RAG | 65 | retrieval品質テスト拡充、HyDEプロンプト最適化、eval基盤のPrimary Gate修復 |
| **5** | ガクチカ深掘り | 68 | テストインフラ汚染修正、質問ループ検出+スキップ、question_group動的計画 |
| **6** | LLM基盤 | 73 | cross-provider fallback二重問題の修正（未実装 + network/rate_limit除外） |
| **7** | 面接対策 | 78 | 採点キャリブレーション(人間評価との一致率測定) |
| **8** | 志望動機 | 80 | `motivation.py`分割、embedding類似度による意味的重複検出 |
| **9** | ES添削 | 86 | hallucination検出、添削理由の説明生成、受容率フィードバックループ |

---

## 6. 即座に着手すべきTop 5アクション

### Action 1: 企業情報検索 Primary Gate FAIL の原因調査・修正
- **現状**: 最新eval(`live_company_info_search_20260418_142454_curated.md`)で3,850クエリ全てが`empty_response`。全6ゲートが0.0000
- **影響**: ES添削・志望動機の企業グラウンディング品質に直結
- **対象**: `backend/evals/company_info_search/`, `backend/app/routers/company_info.py`

### Action 2: LLM基盤 cross-provider fallback の二重問題修正
- **現状**: (1) `_feature_cross_fallback_model`が`return None`(`llm_model_routing.py:149-151`)、(2) network/rate_limitエラーがフォールバック対象外(`llm.py:1252`)
- **影響**: プロバイダー障害時に全AI機能が停止する単一障害点
- **対象**: `backend/app/utils/llm_model_routing.py`, `backend/app/utils/llm.py`

### Action 3: プロンプト安全性の出力側ガードレール追加
- **現状**: 入力側のみ検査(12テストpass)。LLM出力は未チェック
- **影響**: jailbreak成功時に内部プロンプト・参考ES本文が漏洩
- **対象**: `backend/app/utils/llm_prompt_safety.py`, `backend/tests/shared/test_prompt_safety.py`

### Action 4: プロンプト安全性のlabeled test dataset構築
- **現状**: 12テストケースで基本カバーはあるが網羅性不足
- **推奨**: OpenAI Cookbookのagentic governance方式に準拠し、labeled datasetでprecision/recall計測を導入
- **対象**: `backend/tests/shared/test_prompt_safety.py`

### Action 5: 企業情報検索プロンプトの外部化 + `company_info.py` 分割
- **現状**: 3,216行のGod Routerにプロンプトが埋込み
- **対象**: `backend/app/routers/company_info.py`

---

## 7. 総合所見

**全体スコア: 70.2点 (B)**

コア3機能+LLM基盤がA圏(ES添削86、面接83、志望動機80、LLM基盤77)で、プロンプト設計の成熟度は就活支援SaaSとして高い水準にある。特にES添削の5段階リトライ+LCSベースdiff表示、面接対策の3ギア×4ペルソナの合成設計+法定遵守テスト96 assertionsは卓越。

**ガクチカ(68)はv3 live testで会話ループとquestion_groupカバレッジの構造的課題が判明しBに降格。** ただし8ケース中6ケースがテストインフラのフォールバック汚染（`GAKUCHIKA_FALLBACK_ANSWERS`が塾講師シナリオ固定）の影響を受けており、LLM品質のみの実力は68点より高い可能性がある。テストインフラ修正後の再評価が必要。cycle 1 golden set（静的トランスクリプト）では judge 91.96/100 の高水準を示しており、動的会話ループでの品質改善が鍵。

**最大のボトルネックは企業情報検索(54)**。350社live evalでPrimary Gate FAILは、eval基盤の存在自体は成熟の証だが、検索品質が閾値を大幅に下回っている。プロンプト安全性(56)も出力側ガードレール不在が構造的弱点。

LLM基盤(77)のcross-provider fallbackが二重に機能しない問題(未実装+network/rate_limit除外)は可用性の観点から早期対応が必要。

### 採点軸の違いに関する注記

本レポートは7軸評価(プロンプト22/正確性20/価値20/耐性13/テスト10/設計8/安全7)を採用しており、個別feature auditの6軸(コード品質15/AI20/機能専門性30/UX15/テスト10/セキュリティ10)とは配点構造が異なる。特に「機能専門性」30点配点がない代わりに「プロンプト設計」22点+「正確性」20点+「ユーザー価値」20点で分解しているため、同一機能でもスコアが異なりうる。両方の視点を補完的に参照されたい。

---

## Appendix A: ガクチカ v3 Live Test 結果詳細 (2026-04-19)

### A-0. テスト概要

| 項目 | 値 |
|------|------|
| テスト日 | 2026-04-19 |
| テスト種別 | AI Live テスト (`conversation_runner.py` 経由、ローカル実行) |
| suite | extended |
| ケース数 | 8 (smoke: 3, extended: 5) |
| 結果 | **pass=1 / degraded=3 / fail=4** |
| snapshotHash | `acb0695d824ecffe...` |

### A-1. テストインフラ問題: フォールバック汚染

**問��の所在**: `backend/tests/conversation/conversation_runner.py` L23-29, L174

`GAKUCHIKA_FALLBACK_ANSWERS` はグロ��バルに固定された塾講師シナリオ（「宿題提出率」「保護者相談」「学習継続率」）の��答バンク。`build_deterministic_gakuchika_followup()` L174 で `case_answers` が 4 件未満の場合に自動的にこのバンクにフォールバックする。

**影響範囲**:

| ケース | case_answers 件数 | フォールバック発生 | 備考 |
|--------|:-:|:-:|------|
| scope_and_role | 8 | 部分的 | 8問超の場合に発生する可能性 |
| quantitative_outcome | 8 | なし | |
| team_conflict | 8 | 部分的 | 8問超の場合に発生する可能性 |
| process_over_result | 3 | **あり** | 4問目以降で塾講師シナリオが注入 |
| retail_shift_coordination | 3 | **あり** | 同上 |
| engineering_team_latency | 3 | **あり** | 同上 |
| volunteer_outreach | 3 | **あり** | 同上 |
| research_lab_reproducibility | 3 | **あり** | 同上 |

**汚染メカニズム**: 例えば「学園祭実行委員」シ��リオで case_answers が 3 件で尽きると、4問目以降で「宿題未提出が続く生徒が増え…」「宿題提出率が上がり…」という完全に無関係な塾講師の回答が注入される。LLMはこの文脈逸脱に対して混乱し、同じ質問を繰り返すか、ドラフトに矛盾した事実を含める結果となる。

**結論**: これはテストインフラのバグであり、LLM の品質問題ではない。修正は `conversation_runner.py` のフォールバック戦略改善（ケース別 answers 拡充 + 汎用 STAR テンプレートへの置換）で対応する。

### A-2. LLM品質課題 (テストインフラとは独立)

#### A-2-1. 質問ループ (3 degraded)

30ターン上限以内にドラフト生成段階に到達できず、会話がループした。

| ケース | ループ回数 | ループパターン |
|--------|:-:|------|
| scope_and_role | 3回 | 「その経験で、特にどんな課題に向き合う必要があったのですか」を同一文で反復 |
| team_conflict | 8+回 | 「折衷案を提示した後、代表からの反応は？」を言い換えながら反復 |
| volunteer_outreach | 11回 | 「その経験で、特にどんな課題に…」を同一文で反復 |

**根本��因**: ユーザーが同一/無関係な回答を返した場合、LLMは「まだ答えが得られていない」と判断して同じ質問を繰り返す。重複質���検出・トピックスキップのロジックが不在。

**注**: `scope_and_role` は 8 件の case_answers を持つため、初期ラウン��ではフォールバック汚染なしでループが発生。これは純粋な LLM 品質問題。

#### A-2-2. question_group カバレッジ不足 (4 fail)

必須の質問トピックグループ 2 つ中 1 つしかカバーできていない。

| ケース | satisfied_groups | judge 結果 | 備考 |
|--------|:-:|:-:|------|
| process_over_result | 1/2 | pass (4/4/4/3/3) | ドラフト���質は高いが質問網羅が不足 |
| retail_shift_coordination | 1/2 | **fail** (2/1/2/3/2) | フォールバック汚染で事実保全崩壊 |
| engineering_team_latency | 1/2 | **fail** (3/2/3/2/4) | フォールバック汚染で事実保全崩壊 |
| research_lab_reproducibility | 1/2 | pass (4/4/4/3/4) | ドラフト品質は高いが質問網羅が不足 |

**根本原因**: LLMの質問計画が「結果数値確認」に偏重し、他の required group（role/motivation, learning/transfer）に遷移しない。question_count が増えても未到達グループへの動的遷移ロジックが不在。

#### A-2-3. ドラフト品質崩壊 (2 judge fail)

| ケース | star | fact | flow | depth | natural | 主な低スコア理由 |
|--------|:-:|:-:|:-:|:-:|:-:|------|
| retail_shift_coordination | 2 | **1** | 2 | 3 | 2 | 別エピソードの事実（宿題提出率）がドラフトに混入 |
| engineering_team_latency | 3 | **2** | 3 | 2 | 4 | 同上。会話途中で文脈が塾講師に切り替わる |

**根本原因**: 主にテストインフラのフォールバック汚染起因。た��し、LLMがユーザー発言と矛盾する情報をドラフトに含めないガード機構がないことも課題（user_fact_preservation の構造的弱点）。

### A-3. ケース別結果一覧

| # | ケース | suite | answers | ステータス | failure_type | judge (star/fact/flow/depth/natural) | 所要時間 |
|:-:|--------|:---:|:-:|:-:|------|------|------|
| 1 | scope_and_role | smoke | 8 | degraded | conversation_did_not_reach_draft_ready | N/A (ドラフ��未生��) | 61s |
| 2 | quantitative_outcome | smoke | 8 | **pass** | — | 4/4/4/3/4 | 29s |
| 3 | team_conflict | smoke | 8 | degraded | conversation_did_not_reach_draft_ready | N/A (ドラフト未生成) | 62s |
| 4 | process_over_result | ext | 3 | fail | required_question_group_miss (1/2) | pass 4/4/4/3/3 | 28s |
| 5 | retail_shift_coordination | ext | 3 | fail | required_question_group_miss (1/2) | **fail** 2/1/2/3/2 | 24s |
| 6 | engineering_team_latency | ext | 3 | fail | required_question_group_miss (1/2) | **fail** 3/2/3/2/4 | 37s |
| 7 | volunteer_outreach | ext | 3 | degraded | conversation_did_not_reach_draft_ready | N/A (ドラフト未生成) | 48s |
| 8 | research_lab_reproducibility | ext | 3 | fail | required_question_group_miss (1/2) | pass 4/4/4/3/4 | 46s |
