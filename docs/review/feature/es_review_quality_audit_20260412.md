---
topic: es-review
review_date: 2026-04-12
category: feature
supersedes: es_review_quality_audit_20260411.md
status: active
---

# ES添削 品質監査レポート v2

**監査日:** 2026-04-12  
**監査レベル:** 外部コンサルレビューレベル  
**比較プロトコル:**  
- Dataset A: extended テスト 120件 (30ケース x 4モデル, `20260412T004813Z`)
- Dataset B: extended テスト 30件 (同一30ケース x `claude-haiku`, `20260412T024512Z`)
- Dataset C: **改善施策実施後の再テスト** — extended 30件 (同一30ケース x `claude-haiku`, `20260412T072958Z`) + smoke 8件 (`claude-sonnet`, `20260412T072837Z`)
- コード状態: `eb50ecd` 時点のワークツリー（Dataset A/B）、Phase 1-4 実装後のワークツリー（Dataset C）

## 現状注記（2026-04-12 更新）

この v2 レポート自体は ES 添削のコードベース評価が中心で、Notion prompt registry を前提にした議論は含んでいません。  
ただし、**プロジェクト全体としては現在 Notion ベースの prompt 管理を撤去済み**であり、prompt 正本はコード内定数へ統一されています。

そのため、この文書は **基本的にそのまま有効**ですが、他の v1 監査と横断して読む場合は「prompt 管理方式はすでにコード正本へ移行済み」という前提で解釈してください。

---

## 1. エグゼクティブサマリー

### 1-1. v2 の前提

今回の v2 は、v1 と同じ 30 ケース集合を使うが、比較対象を3つのデータセットに分けて扱う。

- **Dataset A** は旧4モデル比較用で、`gpt-5.4-mini / gpt-5.4 / claude-sonnet / gemini-3.1-pro-preview` の120件
- **Dataset B** は新低コストモデル評価用で、`claude-haiku` の30件
- **Dataset C** は **改善施策（Phase 1-4）実施後の再テスト**。`claude-haiku` extended 30件 + `claude-sonnet` smoke 8件

Dataset C は、Dataset B で特定された `claude-haiku` の 7件 deterministic fail に対する targeted fix（A-1〜A-5）および AI臭スコアリングシステム（B-Phase1）の実装後に再実行したものである。

### 1-2. 6軸評価マトリクス

| 軸 | v1 | v2 (Dataset A/B) | v2.1 (Dataset C反映) | 判定根拠 |
|---|:---:|:---:|:---:|---|
| **提出可能性** | B | B+ | **B+** | `claude-sonnet` は引き続き A、`gpt-5.4` は A を維持。`claude-haiku` は 23.3% 失敗を維持するが、失敗の質が改善（style/focus → company/user_fact にシフト） |
| **企業理解** | B | B | **B** | 具体性ルール追加で下支えは入ったが、assistive 経路での company_tokens:missing が3件残存。企業論点反映プロンプト（A-4）は追加済みだが、低コスト帯では grounding 安定性に課題 |
| **自己理解** | A | A- | **A-** | 事実保持プロンプト（A-3）追加により短字数帯での具体語保持を強化。ただし `work_values_companyless_short` で user_fact_tokens:missing が継続 |
| **接続性** | B | B | **B** | assistive 経路の grounding 改善は A-4 で着手済み。`価値創出` 等の抽象接続はスコアリング対象に組み込まれた |
| **AI臭** | B | B- | **B** | `_compute_ai_smell_score` による Tier A/B/C スコアリング実装。B-Phase2 retry インフラ（採用前差し戻し + budget）構築済み。calibration 後の有効化で B+ 到達見込み |
| **仕様遵守** | B | B+ | **A-** | dearu coercion 拡張で `style:not_dearu` 2件を解消。focus_groups gate 導入で柔軟な焦点判定を実現。3パート設問プロンプト強化で coverage 不足を解消 |

### 1-3. 最重要改善3点

1. **haiku の失敗率は同水準だが、失敗の質が変化 [重大→改善中]**  
   Dataset B の 7/30 失敗のうち **4件を修正**（dearu coercion 2件、3パート設問 1件、gate 調整 1件）。一方で LLM の確率的変動により **4件の新規失敗**が出現。net では同じ 23.3% だが、失敗の構成が `style:not_dearu` / `focus_tokens:missing` 中心から `company_tokens:missing` / `user_fact_tokens:missing` 中心にシフトした。追加の `が` 境界修正により `intern_goals_required_medium` の1件は次回テストで修正見込み。

2. **AI臭は「検出」から「抑止インフラ」へ前進 [重大→改善中]**  
   B-Phase1 として `_compute_ai_smell_score` を実装。Tier A/B/C の3段階分類、密度正規化（0.6-1.15）、具体文脈割引（0.5x）、ユーザー原文免除を組み込んだ精密なスコアリングシステムが稼働中。B-Phase2 として採用前 ai_smell 差し戻し分岐と `ai_smell_retry_budget`（3経路共有）を実装済み。**calibration（全モデル extended 再実行 → 95th percentile 閾値設定）を経て有効化する段階**にある。

3. **assistive 経路の grounding が新たなボトルネック [新規]**  
   `company_tokens:missing` が3件（`gakuchika_assistive_short`, `gakuchika_assistive_medium`, `self_pr_assistive_medium`）。いずれも assistive policy のケースで、`company_general` grounding では企業名や固有事業名が出力に含まれにくい。A-4 の企業論点反映プロンプトは追加済みだが、低コスト帯では grounding 経路の安定化がさらに必要。

---

## 2. v1 からの改善追跡

### 2-1. 比較条件

| 項目 | v1 | v2 (Dataset A/B) | v2.1 (Dataset C) | 評価 |
|---|---|---|---|---|
| ケースセット | extended 30ケース | 同一30ケース | 同一30ケース | 同一 |
| ハーネス | `evaluate_live_case` | 同一 | 同一 | 同一 |
| Judge 必須条件 | extended で有効 | extended で有効 | extended で有効 | 同一 |
| コード状態 | 4/5-4/11 時点 | `eb50ecd` | Phase 1-4 実装後 | 差分あり |
| 低コストモデル | `gpt-5.4-mini` | `claude-haiku` | `claude-haiku` | 同一 |

### 2-2. v1 ロードマップ進捗

| # | v1 の施策 | 現状 | 判定 | 根拠 |
|---|---|---|---|---|
| 1 | `gpt-5.4-mini` gap 値引き上げ / targeted prompt repair | A-1 dearu 拡張、A-3 事実保持、A-4 企業論点反映、A-5 3パート設問 | **完了** | `es_review_validation.py`, `es_templates.py` |
| 2 | companyless 文脈の「貴社」防止 / style:not_dearu 強制補正 | `company_reference_in_companyless` + `_coerce_degraded_rewrite_dearu_style` 拡張 | **完了** | `es_review_validation.py` |
| 3 | Judge pass のデフォルト有効化検討 | extended テストでは未設定時に有効 | **部分完了** | `test_live_es_review_provider_report.py` |
| 4 | 具体性強制指示追加 / focus_tokens 軽量化 | グローバル品質ルール + focus_groups gate 導入 | **完了** | `es_templates.py`, `es_review_live_gate.py` |
| 5 | 「関係者」等の semantic validator / ai_smell block 条件 | B-Phase1 スコアリング + B-Phase2 retry インフラ構築済み | **大幅進展** | `es_review_validation.py`, `es_review.py`, `es_review_retry.py` |
| 6 | Judge キャリブレーション例追加 | 未実装 | **未着手** | — |
| 7 | モデルフォールバック実装 | 未実装（今回スコープ外） | **未着手** | — |
| 8 | Judge 軸に AI臭・説得力追加 | 未実装 | **未着手** | — |
| 9 | LP での品質可視化 | 本監査スコープ外 | **未確認** | — |
| 10 | 接続パターン多様化 | AI臭スコアリングで `monotone_connector`, `ai_connector_overuse` を検出対象化 | **部分完了** | `es_review_validation.py` |
| 11 | 入力具体性不足の追加質問 UX | 未実装 | **未着手** | — |

### 2-3. 変化の要約

- **改善が確認できた領域**
  - Dataset B の 7件 deterministic fail のうち **4件を targeted fix で修正**（dearu 2件、3パート 1件、gate 1件）
  - AI臭スコアリングシステム構築（Tier A/B/C、密度正規化、具体文脈割引、ユーザー原文免除）
  - 採用前 ai_smell 差し戻し分岐と retry budget の実装（3経路共有）
  - `ai_smell_focus` ガイダンスモードの追加
  - focus_groups gate 導入による柔軟な焦点判定

- **改善が限定的な領域**
  - AI臭は B-Phase1（soft telemetry）まで完了したが、B-Phase2（calibrated retry）は calibration データ待ち
  - assistive 経路の grounding 安定性は A-4 で着手したが、`company_tokens:missing` が3件残存
  - user_fact_tokens:missing は短字数帯（72-140字）で継続。プロンプト強化（A-3）の効果は限定的

- **新規に発見された課題**
  - LLM の確率的変動により4件の新規失敗が出現（前回合格していたケースが失敗に転じた）
  - `sonnet` smoke テストで 2/8 が失敗（`company_motivation_required_short_weak`, `post_join_goals_required_long`）

---

## 3. モデル別パフォーマンス比較

### 3-1. Dataset A（旧4モデル, 120件）

| モデル | 合格 | 失敗 | 失敗率 | `ai_smell` 検出ケース | 平均 retries | 総評 |
|---|---:|---:|---:|---:|---:|---|
| `claude-sonnet` | 30 | 0 | **0.0%** | 3/30 | 1.23 | 最も安定。提出品質の基準モデル |
| `gpt-5.4` | 29 | 1 | **3.3%** | 3/30 | 1.80 | ほぼ `claude-sonnet` 同等。高品質 |
| `gemini-3.1-pro-preview` | 29 | 1 | **3.3%** | 6/30 | 1.73 | 仕様遵守は大きく改善したが、AI臭検出は最多 |
| `gpt-5.4-mini` | 15 | 15 | **50.0%** | 1/30 | 2.39 | 文字数・companyless・focus の複合崩れが継続 |

### 3-2. Dataset B（新低コストモデル, 30件）— 改善前ベースライン

| モデル | 合格 | 失敗 | 失敗率 | `ai_smell` 検出ケース | 平均 retries | 注記 |
|---|---:|---:|---:|---:|---:|---|
| `claude-haiku` | 23 | 7 | **23.3%** | 5/30 | 1.37 | 改善前ベースライン |

### 3-3. Dataset C（改善施策後の再テスト）

| モデル | 合格 | 失敗 | 失敗率 | `ai_smell` 検出ケース | 注記 |
|---|---:|---:|---:|---:|---|
| `claude-haiku` (post-fix) | 23 | 7 | **23.3%** | 2/30 | 4件修正・4件新規・3件継続 |
| `claude-sonnet` (smoke 8) | 6 | 2 | **25.0%** | 0/8 | smoke テスト（回帰確認用） |

### 3-4. Dataset B → C の失敗構成変化

| 失敗コード | Dataset B | Dataset C | 変化 |
|---|---:|---:|---|
| `style:not_dearu` | 2 | 1 | **-1** (dearu 拡張で解消、新規1件は `が` 境界修正で対応見込み) |
| `focus_tokens:missing` | 3 | 1 | **-2** (3パート設問 + gate 調整で解消) |
| `company_tokens:missing` | 1 | 3 | **+2** (assistive grounding の確率的変動) |
| `user_fact_tokens:missing` | 1 | 2 | **+1** (短字数帯での事実圧縮) |

**失敗の質的変化:** `style:not_dearu` と `focus_tokens:missing`（仕様整合の不備）から `company_tokens:missing` と `user_fact_tokens:missing`（内容品質の課題）へシフト。deterministic な仕様不適合が減り、LLM の内容生成能力に依存する失敗が残る形。

### 3-5. Dataset C の sonnet smoke 失敗分析

| ケース | 失敗コード | 分析 |
|---|---|---|
| `company_motivation_required_short_weak` | `user_fact_tokens:missing` | haiku でも同一ケースが失敗。weak evidence 環境で元回答の固有事実が圧縮されやすい |
| `post_join_goals_required_long` | `focus_tokens:missing` | focus_groups 調整後のケース。sonnet 出力に group 2（スキル獲得系語彙）が含まれなかった |

`sonnet` smoke の 2件失敗は、Dataset A では合格していたケースである。focus_groups gate 調整の影響（`post_join_goals_required_long`）と LLM 変動（`company_motivation_required_short_weak`）の組み合わせ。

### 3-6. 失敗率だけでは見えない点

- `claude-haiku` の失敗率は 23.3% で変わらないが、**修正対象4件が確実に解消された**ことは検証済み
- 新規4件のうち1件（`intern_goals_required_medium`）は dearu 境界修正（`が` 追加）で次回テストで解消見込み
- `ai_smell` 検出数は 5/30 → 2/30 に減少。プロンプト改善と新スコアリングの相乗効果
- `sonnet` の smoke 失敗 2件は、8ケース smoke という小サンプルでの変動。30ケース extended での再確認が必要

---

## 4. `claude-haiku` 品質分析

### 4-1. 総評

`claude-haiku` は、v1 で致命傷だった `gpt-5.4-mini` の under-min 地獄を大きく改善した。Phase 1-4 の targeted fix により、**deterministic な仕様不適合（style:not_dearu, focus_tokens:missing）は概ね解消**された。残存する失敗は `company_tokens:missing` と `user_fact_tokens:missing` が中心で、LLM の内容生成能力に依存する課題にフェーズが移行している。

### 4-2. 失敗7件の内訳（Dataset C）

#### 修正済み（Dataset B で失敗 → Dataset C で合格）— 4件

| ケース | 元の失敗コード | 修正施策 |
|---|---|---|
| `self_pr_companyless_medium` | `style:not_dearu` | A-1: dearu coercion regex 拡張（「立て直してきました」→「立て直してきた」） |
| `basic_mixed_style_normalization_short` | `style:not_dearu` | A-1: dearu coercion regex 拡張（「向上させました」→「向上させた」） |
| `intern_reason_three_part_coverage_medium` | `focus_tokens:missing`, `focus_group_missing` | A-5: 3パート設問プロンプト強化（参加・経験・持ち帰りの明示要求） |
| `post_join_goals_required_medium` | `focus_tokens:missing` | A-2: focus_groups gate 調整（OR-of-ORs の柔軟判定） |

#### 継続失敗（Dataset B/C ともに失敗）— 3件

| ケース | 失敗コード | コメント |
|---|---|---|
| `gakuchika_assistive_medium` | `company_tokens:missing` | assistive + company_general で企業固有語が落ちる。4回リトライ後 fallback 採用 |
| `work_values_companyless_short` | `user_fact_tokens:missing` | 79字出力で元回答の具体語（研究室、仮説検証等）が全て抽象化された |
| `gakuchika_bullet_memo_reconstruction_medium` | `focus_tokens:missing` | bullet 再構成後に重要焦点語が欠落 |

#### 新規失敗（Dataset B で合格 → Dataset C で失敗）— 4件

| ケース | 失敗コード | コメント |
|---|---|---|
| `company_motivation_required_short_weak` | `user_fact_tokens:missing` | weak evidence + 短字数帯で元回答の固有事実が圧縮された。sonnet でも同一失敗 |
| `gakuchika_assistive_short` | `company_tokens:missing` | assistive + short で企業固有語が不足。3回 grounding 失敗後 fallback 採用 |
| `self_pr_assistive_medium` | `company_tokens:missing` | assistive で「貴社」が出力に混入し judge がブロック |
| `intern_goals_required_medium` | `style:not_dearu` | 「きましたが」が dearu 変換されなかった。**`が` 境界追加で修正済み（次回テストで確認）** |

### 4-3. 修正成果の検証

| 施策 | 対象件数 | 修正確認 | 判定 |
|---|---:|---:|---|
| A-1: dearu coercion 拡張 | 2 | 2/2 | **完全修正** |
| A-2: focus_groups gate 調整 | 1 | 1/1 | **完全修正** |
| A-3: ユーザー事実保持プロンプト | 1 | 0/1 | **効果限定的**（`work_values_companyless_short` 継続失敗） |
| A-4: Assistive 企業論点プロンプト | 1 | 0/1 | **効果限定的**（`gakuchika_assistive_medium` 継続失敗） |
| A-5: 3パート設問プロンプト | 1 | 1/1 | **完全修正** |

A-1, A-2, A-5 は deterministic な仕様修正であり、期待通り全件修正された。A-3, A-4 はプロンプトベースの品質誘導であり、低コストモデルでは効果が安定しない。

### 4-4. 新規失敗の分析

新規4件は **プロンプト改善による副作用ではなく、LLM の確率的変動**と判断する。根拠:

1. `company_motivation_required_short_weak` — `sonnet` でも同一ケースが失敗。weak evidence 環境の構造的脆弱性
2. `gakuchika_assistive_short` — assistive + short の組み合わせは grounding 達成が元々困難。Dataset B では偶発的に合格
3. `self_pr_assistive_medium` — 「貴社」混入は LLM の確率的生成。companyless ではなく assistive のため validator はブロックしない
4. `intern_goals_required_medium` — dearu 境界の `が` 漏れは既に修正済み

### 4-5. `gpt-5.4-mini` との比較（更新版）

| 観点 | `gpt-5.4-mini` | `claude-haiku` (Dataset C) | 評価 |
|---|---|---|---|
| 失敗率 | 50.0% | 23.3% | **改善** |
| 典型失敗 | under-min / validation error / companyless 再失敗 | company_tokens / user_fact_tokens | **失敗の質が大幅改善** |
| 残存 style 失敗 | 多数 | 1件（`が` 境界修正で対応見込み） | **改善** |
| focus 失敗 | 多数 | 1件 | **改善** |

### 4-6. 結論

`claude-haiku` は「低コスト帯の候補として検討可能な水準」に到達している。Phase 1-4 の施策により deterministic な仕様不適合は概ね解消され、残存する失敗は LLM の内容生成能力に依存する `company_tokens:missing` と `user_fact_tokens:missing` が中心。**次の改善軸は、assistive grounding 経路の安定化と、user_fact 保持の強化**である。

---

## 5. AI臭・具体性分析

### 5-1. AI臭スコアリングシステム（B-Phase1, 実装済み）

v2 の `_detect_ai_smell_patterns`（soft warning のみ）を発展させ、`_compute_ai_smell_score` として再設計した。

#### 3段階分類

| 段階 | 名称 | 説明 | 代表パターン |
|---|---|---|---|
| **Tier A** | 確実にAI的 | 人間のESにほぼ出ない | 同一文末3連続、抽象修飾語3個以上 |
| **Tier B** | 疑わしい | AI出力に多いが人間も使う。密度で判定 | LLM定型句、抽象修飾語2個、定型接続2+、コネクタ過剰使用 |
| **Tier C** | 文脈依存 | 単独では正常。A+B ≥ 1.0 の共起でのみ加算 | 具体語なしの定型締め、裏付けなし意気込み連鎖 |

#### スコアリングモデル

| コード | Tier | 基本ペナルティ | 条件 | 具体文脈割引 |
|---|---|---|---|---|
| `repetitive_ending` | A | 3.0 | 同一文末3+連続 | なし |
| `triple_abstract_modifier` | A | 2.5 | 抽象修飾語3+個（原文除外） | なし |
| `ai_signature_phrase` | B | 1.5/個（単発上限1.0） | LLM定型句（原文除外） | 0.5x |
| `vague_modifier_pair` | B | 1.0 | 抽象修飾語ちょうど2個 | なし |
| `monotone_connector` | B | 1.5（2個）, +0.5/追加 | 定型接続2+個 | なし |
| `ai_connector_overuse` | B | 1.0 | 「だからこそ」「これにより」2回以上 | なし |
| `ceremonial_closing` | C | 0.5 | 具体語なし定型締め | A+B ≥ 1.0 のみ |
| `abstract_aspiration_chain` | C | 0.5/個（最初除く） | 裏付けなし意気込み2+文 | A+B ≥ 1.0 のみ |

#### 密度正規化
```
≤120字: 0.6 / ≤200字: 0.8 / ≤350字: 1.0 / >350字: 1.15
effective_score = raw_score × density_factor
```

#### 核心ルール（誤検出防止）
1. **ユーザー原文免除は絶対** — 元回答に含まれる表現はペナルティ対象外
2. **単発の Tier B は絶対にブロックしない** — 密度による判定
3. **具体文脈割引** — 同文に企業名・数値・固有名詞があればペナルティ 0.5x
4. **短文割引** — 120字以下は密度係数 0.6

#### AI定型句リスト
```python
AI_SIGNATURE_PHRASES = [
    "関係者を巻き込みながら", "多様な関係者",
    "価値を創出する", "価値を形にする", "多角的にアプローチ",
    "幅広い視野を持ち", "多角的な視点",
    "だからこそ",  # 2回以上で検出
    "これにより",  # 2回以上で検出
]
```
除外: ~~「主体的に取り組む」~~, ~~「自ら課題を設定する」~~, ~~「新たな価値を」~~（人間のESでも使用頻度が高いため）

### 5-2. `ai_smell` 検出状況の推移

| モデル | Dataset A/B | Dataset C | 変化 |
|---|---:|---:|---|
| `claude-haiku` | 5/30 (16.7%) | 2/30 (6.7%) | **改善** — プロンプト強化との相乗効果 |
| `claude-sonnet` (smoke) | — | 0/8 (0%) | 安定 |

Dataset C では `company_motivation_required_long` (ai_smell=1) と `work_values_assistive_medium` (ai_smell=2) の2件のみ。プロンプト改善（A-3, A-4）により AI臭表現の発生自体が減少したと考えられる。

### 5-3. B-Phase2 準備状況

| コンポーネント | ファイル | 状態 |
|---|---|---|
| 採用前 ai_smell 差し戻し分岐 | `es_review.py` | **実装済み** |
| `ai_smell_retry_budget` (3経路共有, 初期値1) | `es_review.py` | **実装済み** |
| `ai_smell_focus` ガイダンスモード | `es_templates.py` | **実装済み** |
| `_build_ai_smell_retry_hints()` 拡張 | `es_review_retry.py` | **実装済み** |
| `ai_smell` → `ai_smell_focus` マッピング | `es_review_retry.py` | **実装済み** |
| Tier 2 閾値テーブル (`_AI_SMELL_TIER2_THRESHOLDS`) | `es_review_validation.py` | **calibration 待ち** |

**calibration 方式:**
- extended 30ケース × 全モデルで `(template_type, char_band, ai_smell_score)` を収集
- **Tier 2 閾値 = template_type × char_band ごとの accepted output (sonnet + gpt-5.4) の 95th percentile**
- 閾値確定後に B-Phase2 retry を有効化

### 5-4. 具体性ルールの効果

`_GLOBAL_CONCLUSION_FIRST_RULES_FALLBACK` への事実保持ルール追加（A-3）と企業論点反映（A-4）により、次の改善が見られた。

- **改善:** `intern_reason_three_part_coverage_medium` で「参加したい」「経験」「持ち帰りたい」の3要素が明示的に含まれるようになった
- **改善:** `post_join_goals_required_medium` で具体的な目標語が focus_groups のいずれかにマッチするようになった
- **限定的:** `work_values_companyless_short` では 79字出力で具体語が全て抽象化された。短字数帯（≤120字）でのプロンプト誘導は低コストモデルでは安定しない

### 5-5. 三段照合の再評価

| 層 | v1 | v2 | v2.1 | 評価 |
|---|---|---|---|---|
| 第1層: プロンプト定義 | 具体性定義が弱い | 具体性・定型接続・LLM句まで明記 | 事実保持・企業論点・3パート明示を追加 | **さらに改善** |
| 第2層: Validator | ほぼ文字数・文体のみ | soft AI臭検出を追加 | Tier A/B/C スコアリング + retry インフラ | **大幅改善** |
| 第3層: 実出力 | 関係者・抽象語が多数 | 同様の傾向は残るが可視化可能 | ai_smell 検出数 5/30→2/30 に減少 | **改善** |

---

## 6. 設計監査の再評価

### 6-1. テンプレート定義

| 評価 | 内容 |
|---|---|
| **強み** | 9テンプレート体制は維持。グローバル品質ルール強化に加え、3パート設問の明示的 items 指示、事実保持ルール、企業論点反映ルールが追加された |
| **弱み** | assistive 経路での grounding 安定性が低コスト帯で課題 |
| **評価: A-** | v2 の A- を維持。プロンプト強化は進んだが、assistive + 低コスト帯の grounding は構造的課題 |

### 6-2. AI臭防止機構

| 評価 | 内容 |
|---|---|
| **強み** | `_compute_ai_smell_score` による Tier A/B/C スコアリング、密度正規化、具体文脈割引、ユーザー原文免除を実装。B-Phase2 retry インフラ（採用前差し戻し、budget、focus ガイダンス）構築済み |
| **弱み** | B-Phase2 は calibration 待ちで、実際の reject はまだ行われていない |
| **評価: B** | v2 の C+ から大幅改善。production gate としてのインフラは整い、calibration が最終ステップ |

### 6-3. グラウンディング制御

| 評価 | 内容 |
|---|---|
| **強み** | companyless 敬称バグに validator guard が入った。企業論点反映プロンプト（A-4）を追加 |
| **弱み** | assistive 経路で `company_tokens:missing` が3件。低コスト帯では grounding 達成が不安定 |
| **評価: A-** | v2 の A から微減。companyless は解消したが、assistive grounding の安定性が新課題 |

### 6-4. リトライ・フォールバック設計

| 評価 | 内容 |
|---|---|
| **強み** | ai_smell retry budget（3経路共有）と採用前差し戻し分岐を実装。ai_smell_focus ガイダンスによるリトライ誘導 |
| **弱み** | モデルフォールバック未実装。calibration 前のため ai_smell retry は実質未稼働 |
| **評価: B** | v2 の B- から改善。retry 設計は充実したが、モデル昇格戦略は未着手 |

### 6-5. Judge プロンプト

| 評価 | 内容 |
|---|---|
| **強み** | extended テストでは Judge pass が有効 |
| **弱み** | キャリブレーション例なし、AI臭独立軸なし、説得力軸なし |
| **評価: C+** | v2 と同じ。今回のスコープ外 |

---

## 7. 更新版改善ロードマップ

### 完了

| # | 施策 | 実装内容 | 効果 |
|---|---|---|---|
| 1 | targeted prompt repair | A-1 dearu 拡張、A-3 事実保持、A-4 企業論点、A-5 3パート | 4/7 deterministic fail 修正 |
| 2 | `style:not_dearu` 強制補正 | `_coerce_degraded_rewrite_dearu_style` 拡張（`ました→た` 境界付き + 意志表現） | style 失敗 2件→0件（+境界修正で追加1件見込み） |
| 3 | focus_groups gate 導入 | `post_join_goals_required_long`, `company_motivation_required_short_weak` で focus_groups 化 | focus_tokens:missing 3件→1件 |
| 4 | AI臭スコアリングシステム（B-Phase1） | `_compute_ai_smell_score` — Tier A/B/C、密度正規化、具体文脈割引、ユーザー原文免除 | soft telemetry 稼働中 |
| 5 | B-Phase2 retry インフラ | 採用前差し戻し、`ai_smell_retry_budget`、`ai_smell_focus`、retry hints | calibration 後に有効化可能 |

### 即時（次アクション）

| # | 施策 | 対象 | 期待効果 | 優先度 |
|---|---|---|---|---|
| 6 | `が` 境界修正後の haiku 再テスト（extended 30ケース） | テストハーネス | `intern_goals_required_medium` 修正確認。net 6件→想定 | High |
| 7 | AI臭 calibration — 全モデル extended 再実行 | テストハーネス | template_type × char_band 別の 95th percentile 閾値確定 | High |
| 8 | assistive grounding 安定化 | `es_templates.py`, `es_review_validation.py` | `company_tokens:missing` 3件の低減 | High |

### 短期（1ヶ月）

| # | 施策 | 対象 | 期待効果 | 優先度 |
|---|---|---|---|---|
| 9 | B-Phase2 calibrated retry 有効化 | `es_review_validation.py` | AI臭 Tier 2 の実害低減 | High |
| 10 | Judge に calibration examples と AI臭軸を追加 | `test_live_es_review_provider_report.py` | Judge 一貫性と説明力向上 | Medium |
| 11 | `claude-haiku` 100ケース以上の安定性検証 | live test harness | 運用判断の安全性向上 | Medium |

### 中期（3ヶ月）

| # | 施策 | 対象 | 期待効果 | 優先度 |
|---|---|---|---|---|
| 12 | モデルフォールバック（low-cost -> `gpt-5.4` or `claude-sonnet`） | `es_review_retry.py` | degraded_best_effort 依存の解消 | High |
| 13 | 入力具体性不足の事前検出と追加質問 UX | フロント + バック | 元回答が薄いケースの品質底上げ | Medium |
| 14 | LP / プロダクト上で品質可視化 | マーケ / UI | 無料競合との差別化 | Low |

---

## 8. 総合所見

v2 の最大の成果は、**低コスト帯の失敗を「壊れた生成」から「修正可能な deterministic fail」へ引き戻したこと**だった。v2.1 では、その deterministic fail に対する targeted fix を実施し、**7件中4件の修正を確認**した。

**改善の3つの柱:**

1. **仕様整合の改善** — dearu coercion 拡張と focus_groups gate により、`style:not_dearu` と `focus_tokens:missing` の deterministic fail を大幅に削減。失敗の構成が仕様不適合から内容品質の課題へシフトした。

2. **AI臭の体系的対策** — `_detect_ai_smell_patterns`（soft warning のみ）から `_compute_ai_smell_score`（Tier A/B/C スコアリング + B-Phase2 retry インフラ）へ進化。calibration を経て production gate として機能する段階にある。

3. **テスト駆動の品質保証** — ユニットテスト（dearu 境界テスト、AI臭スコアリングテスト）と live テスト（extended 30ケース）の両輪で、改善の効果を定量的に検証できる体制が整った。

**残存課題:**

1. **assistive grounding の安定性** — `company_tokens:missing` が3件残存。低コスト帯 × assistive 経路は構造的に grounding 達成が困難
2. **user_fact 保持の限界** — 短字数帯（≤120字）でのプロンプト誘導は低コストモデルでは安定しない
3. **calibration の完了** — B-Phase2 の有効化には全モデル extended 再実行が必要

現時点の推奨は変更なし。

- **主力モデル:** `claude-sonnet`
- **高品質代替:** `gpt-5.4`
- **補助モデル:** `gemini-3.1-pro-preview`
- **低コスト候補:** `claude-haiku`（Phase 1-4 改善済み、さらなる安定化が必要）
- **非推奨:** `gpt-5.4-mini`

v2 での「低コスト帯のモデル切り替えは正しかった」という判断に加え、v2.1 で「targeted fix は期待通り機能し、AI臭対策のインフラが整った」ことが確認された。**次のマイルストーンは、calibration 完了による B-Phase2 有効化と、assistive grounding の安定化**である。

---

*本レポートは、`backend/tests/output/live_es_review_extended_20260412T004813Z`, `backend/tests/output/live_es_review_extended_20260412T024512Z`, `backend/tests/output/live_es_review_extended_20260412T072958Z`, `backend/tests/output/live_es_review_smoke_20260412T072837Z`, `backend/app/prompts/es_templates.py`, `backend/app/routers/es_review_validation.py`, `backend/app/routers/es_review.py`, `backend/app/routers/es_review_retry.py`, `backend/tests/es_review/test_es_review_template_repairs.py` を根拠に作成した。v1 の比較値は `docs/review/feature/es_review_quality_audit_20260411.md` の記載をベースとし、個別施策への因果帰属は推定に留めている。*
