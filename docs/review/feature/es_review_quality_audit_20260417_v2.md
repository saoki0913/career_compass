# ES 添削機能 品質監査レポート v2 (2026-04-17)

## 実行環境

| 項目 | 値 |
|------|------|
| git SHA | `d161b8bd77d093d03e3a80da963a3a32b4c75545` (Phase 10 完了状態) |
| 実行日 | 2026-04-17 |
| 監査手法 | コード・プロンプト・既存 test・既存 live smoke log 静的解析 (新規 LLM 実出力は非検証) |
| 採点軸 | 面接機能 audit (20260412) と同じ 6 軸 × 100 点満点 |
| 前回 audit | `es_review_quality_audit_20260417.md` (Phase 10 Live 検証、30/32 pass = 93.75%) |

---

## 1. エグゼクティブサマリー

### 6 軸評価マトリクス

| 軸 | 配点 | 得点 | 評価 | 判定根拠 |
|---|---:|---:|:---:|---|
| **コード品質・設計** | 15 | 10 | **C+** | `es_review.py` 2,132 行 (CLAUDE.md 500 行ルール 4 倍超、面接の 2,694 行に次ぐ)。ただし `es_review_grounding.py` (902), `es_review_validation.py` (940), `es_review_retry.py` (867), `es_review_pipeline.py` (233), `es_review_request.py` (184), `es_review_issue.py` (307), `es_review_models.py` (207), `es_review_stream.py` (129) に既に責務分離済み。循環依存回避のため lazy 遅延 export 機構あり。主機能 `_generate_review_progress` / `review_section_with_template` が同一ファイルに混在 |
| **AI / プロンプト品質** | 20 | 17 | **A-** | `es_templates.py` 2,200 行 + `reference_es.py` 475 行 + `reference_es_importer.py` 817 行。8-A 結論ファースト + model 別 length gap (openai_gpt5_mini=12, claude=9) + AI 臭検出 (`_build_ai_smell_retry_hints`) + Phase 10 成果 (冒頭 20-45 字 / 企業名 ≤1 / 固有名詞汎用語化) が実装。grounding_mode 3 種 (required/assistive/none) 対応 |
| **機能専門性 (ES 添削プロ品質)** | 30 | 19 | **B-** | template type 7 種 (basic / company_motivation / gakuchika / self_pr / work_values / intern_reason / intern_goals) + retry_guidance (quantify / structure) + 参考 ES 統計プロファイル (`build_reference_quality_profile`) + conditional_hints_applied。Phase 10 smoke 30/32 (93.75%) 達成 |
| **UX・ユーザー体験** | 15 | 11 | **B** | `handle-review-stream.ts` 613 行で credit 成功時消費、SSE progress event、ownership check。差分可視化 UI 無し、モデル選択 UI 無し、版管理 endpoint 別 |
| **テスト・信頼性** | 10 | 6 | **C** | `backend/tests/es_review/` 合計 5,553 行 / 221 test ケース、Phase 10 smoke (4 モデル × 8 ケース = 32 runs)、`test_reference_es_quality.py` 7 件 fail (structural_patterns_v2 系、別件管理) 残存。e2e テスト ゼロ |
| **セキュリティ基礎** | 10 | 9 | **A-** | `require_career_principal("ai-stream")` + `getOwnedDocument` ownership + `sanitize_prompt_input` + `detect_es_injection_risk` (high/medium) + `sanitize_review_request`。SSE error は `str(e)` 直接 yield の漏洩可能性あり |

### 総合スコア: **72/100 (グレード B-)**

Phase 1-10 までの長い改善履歴を経て、グレード C から **B-** 圏へ到達。Phase 10 smoke で 93.75% の高 pass rate を達成する一方、以下 3 点がスコアを押し下げている:

### 最重要改善 5 点

1. **`es_review.py` 2,132 行の God Object 化 [C-01]** — `_generate_review_progress`, `review_section_with_template` 等の主要関数が同一ファイルに集約。面接の façade pattern を適用すれば解消可能
2. **SSE error での内部例外漏洩リスク [S-01]** — `es_review.py:2052-2056` 付近で `logger.error(str(e))` → `_sse_event("error", {"message": str(e)})` の恐れ。面接 Phase 1 で実装した `_sse_error_event()` 固定文言方式を流用すべき
3. **`test_reference_es_quality.py` 7 件 fail [T-01]** — `structural_patterns_v2` 系が未解消、別件管理継続中。Phase 10 対象外だが放置リスク
4. **差分可視化 UI なし [U-01]** — 添削 before/after の sentence-level diff が提示されない。返却は rewrite テキストのみ
5. **モデル選択 UI なし [U-02]** — `FREE_PLAN_ES_REVIEW_MODEL` 固定、無料/有料プランで切り替わるが、ユーザーが 4 モデル (claude-sonnet / claude-haiku / gpt-5.4 / gemini-3.1-pro) を選択できない

---

## 2. ES 添削のプロ品質監査 (配点 30、得点 19)

### 2-1. 評価フレームワーク (ES 品質 6 軸)

| 品質軸 | 評価 | 概要 |
|---|:---:|---|
| **構成力** | **B+** | 8-A 結論ファースト、Phase 10 で冒頭 20-45 字徹底。gakuchika の「(1)(2)」順序化規則 (es_templates.py:67-70) あり |
| **具体性** | **B** | self_pr / work_values で数値含有と行動動詞を必須化 (_STYLE_RULES 13-A/B/C/D)、retry_guidance に `quantify`。grounding が量ベース、質的 filter 弱め |
| **企業固有性** | **B** | grounding_mode 3 種対応、`company_mention_rule` (none / assistive≤2 / required≤1) の 3-way policy、固有名詞汎用語化 (12-A/B) |
| **AI 臭対策** | **A-** | `_build_ai_smell_retry_hints` で 3 件まで警告抽出 → rewrite hint へ、Tier 2 reject 機構。ただし fallback 拒否可能性あり |
| **文字数遵守** | **A** | Phase 10 smoke で 25/32 (78.1%) が 20-45 字内、全体 over_max / under_min gap 制御が model 別に緻密 |
| **多モデル対応** | **B-** | 4 モデル対応だが、cross-model テストは 44 件 / template 程度。Phase 10 smoke は 4 モデル × 8 ケースのみ |

### 2-2. Phase 1-10 の進化

| Phase | 完了日 | 成果 |
|-------|--------|------|
| Phase 1-5 | 2026-04-11 以前 | template type 分岐、model 別 length profile、reference_es 統計 |
| Phase 6 | 2026-04-12 | Judge プロンプトキャリブレーション例追加 (S/A/B/C/D 各 1 例) |
| Phase 7-9 | 2026-04-14 | AI 臭検出 Tier 化、retry_guidance 拡張、8-A ルール |
| Phase 10 | 2026-04-17 | 冒頭 20-45 字 / 企業名 ≤1 / 固有名詞汎用語化、gakuchika playbook 拡張 |
| Phase 10 検証 | 2026-04-17 | Live smoke 4 モデル × 8 ケース = 32 runs、30/32 pass (93.75%) |

### 2-3. Phase 10 smoke 実績 (`es_review_quality_audit_20260417.md` より)

| 指標 | 値 |
|------|----|
| 1st attempt 成功 | 20/32 (62.5%) |
| retry 後成功 | 30/32 (93.75%) |
| Fallback rewrite 発火 | 0/32 (0%) |
| AI smell Tier 2 reject | 0/32 (0%) |
| 20-45 字に収まった割合 | 25/32 (78.1%) |

retry 機構が機能しているため、1st attempt 成功率 62.5% でも最終的に 93.75% まで到達。AI smell Tier 2 reject がゼロなのは検出漏れの可能性もあり、継続観察必要。

### 2-4. 残課題 (Phase 11+ 候補)

- **sentence-level diff UI** (業界競合 Rezi / Jobscan の標準機能)
- **複数 LLM 横並び比較** (業界空白地帯、LP 訴求可)
- **AI 臭検出 UI** (Tier 1-3 の可視化、rewrite 履歴表示)
- **厚労省 NG 項目ガード** (面接機能で Phase 1 実装済、ES にも転用)
- **company-grounding 量 → 質転換** (固有論点ベースの grounding scoring)

---

## 3. コード品質・設計 (配点 15、得点 10)

### 3-1. 実装規模 (合計 8,101 行)

```
backend/app/routers/es_review.py               2,132  (主機能集約、500 行ルール 4 倍超)
backend/app/routers/es_review_grounding.py      902   (企業情報 grounding)
backend/app/routers/es_review_validation.py     940   (検証ロジック)
backend/app/routers/es_review_retry.py          867   (リトライ戦略)
backend/app/routers/es_review_pipeline.py       233   (メタ構築)
backend/app/routers/es_review_issue.py          307   (issue 抽出)
backend/app/routers/es_review_models.py         207   (Pydantic models)
backend/app/routers/es_review_request.py        184   (request 正規化)
backend/app/routers/es_review_stream.py         129   (SSE helpers)
```

### 3-2. 強み

- **責務分離が 8 サブモジュールで進んでいる** (grounding / validation / retry / pipeline / issue / models / request / stream)
- **循環依存回避の lazy 遅延 export** (`es_review_pipeline.py` の `_router` 関数)
- **SSE keepalive 15 秒間隔 + error サニタイズ機構あり**

### 3-3. 弱み

- **`es_review.py` 2,132 行で単一責務違反:** `_generate_review_progress`, `review_section_with_template`, その他 route handler が混在
- **Promise.all 相当の並行処理なし:** grounding 取得と reference_es 取得が順序実行 (es_review.py 1,100-1,200 行付近)
- **二重サニタイズ:** `sanitize_prompt_input` + `sanitize_review_request` の 2 段 (es_review.py:1763, es_review_request.py:77)

### 3-4. 推定スコア: 10/15 (C+)

面接機能の façade pattern (Phase 2 Stage 2) を `es_review.py` に適用すれば B+ まで到達可能。

---

## 4. AI / プロンプト品質 (配点 20、得点 17)

### 4-1. プロンプト構造

```
backend/app/prompts/es_templates.py            2,200  (全 template の builder + style rules)
backend/app/prompts/reference_es.py              475  (QUESTION_TYPE_QUALITY_HINTS + ヒント)
backend/app/prompts/reference_es_importer.py     817  (v2 フォーマット STAR + 番号付け)
```

### 4-2. 強み

- **AI 臭検出機構:** `_build_ai_smell_retry_hints` で LLM 特有フレーズ (「関係者を巻き込みながら」「新たな価値を」等) を検出・rewrite hint に変換
- **Phase 10 成果:** 冒頭 20-45 字結論ファースト + 企業名 ≤1 回制限 + 固有名詞汎用語化 (`reference_es.py:24-51`)
- **template type 分岐 7 種:** basic / company_motivation / gakuchika / self_pr / work_values / intern_reason / intern_goals
- **grounding policy 3-way:** required / assistive / none
- **model 別 length gap 設定:** openai_gpt5_mini=12@medium, claude=9@medium, length_fix_delta_limit=25

### 4-3. 弱み

- **reference_es.py の「NG」ヒント (25-68 行) が生成時に逆転する可能性:** 禁止表現を例示として書くと LLM が引きずられる古典的リスク
- **参考 ES の骨子抽出が統計的サマリ頼み:** sentence-level の構成パターン学習なし (`test_reference_es_quality.py:334-380` の STAR 抽出は簡易)
- **grounding_mode = "company_general" 時の融合が量ベース:** 質的 filter (企業固有論点だけを残す) が甘い

### 4-4. 推定スコア: 17/20 (A-)

面接の `INTERVIEW_GROUNDING_RULES` 2 層化 (core + legal) と同じ最適化余地あり。

---

## 5. 機能専門性・ES 添削プロ品質 (配点 30、得点 19)

前述 §2 参照。**19/30 (B-)**。Phase 10 の 93.75% pass rate は評価できるが、差分 UI / 多モデル比較 / AI 臭 UI / 厚労省 NG ガードが未実装のため B- 止まり。

---

## 6. UX・ユーザー体験 (配点 15、得点 11)

### 6-1. 強み

- **credit 成功時のみ消費:** `handle-review-stream.ts` の `esReviewStreamPolicy` で完全成功を待つ
- **SSE progress event (step, progress %):** リアルタイム配信
- **error event の telemetry 分離:** ユーザー向け "message" と監査ログ "internal_telemetry" を分離
- **`getOwnedDocument`:** document owner == 認証 user を 40 行で検証

### 6-2. 弱み

- **モデル選択 UI なし** (`FREE_PLAN_ES_REVIEW_MODEL` 固定、プラン差別化のみ)
- **差分表示なし** (rewrite text のみ返却、before/after 比較なし)
- **版管理 endpoint 別** (`/documents/[id]/versions/route.ts` 151 行、添削履歴との統合不明確)

### 6-3. 推定スコア: 11/15 (B)

差分可視化とモデル選択 UI が業界標準 (Rezi / Jobscan)。追加すれば B+ に到達。

---

## 7. テスト・信頼性 (配点 10、得点 6)

### 7-1. 強み

- **221 test ケース / 5,553 行:**
  - `test_es_review_template_repairs.py` 2,548 行 (修復戦略)
  - `test_es_review_prompt_structure.py` 951 行 (プロンプト形式)
  - `test_reference_es_quality.py` 516 行 (16 ケース)
- **Live smoke test:** `live_es_review_aggregate_20260417T012852Z.md` で Phase 10 指標を 4 モデル × 8 ケースで集計

### 7-2. 弱み

- **`test_reference_es_quality.py` 7 件 fail 残置:** `structural_patterns_v2` 系、別件管理
- **e2e テストゼロ** (`e2e/` 配下に es*review ヒット無し)
- **SSE error サニタイズ耐性テストが内部実装のみ**
- **4 モデル cross-model テストが 44 件 / template と薄い**

### 7-3. 推定スコア: 6/10 (C)

面接機能の harness pattern (24 ケース × 4 層評価) を ES にも適用する余地大。

---

## 8. セキュリティ基礎 (配点 10、得点 9)

### 8-1. 強み

- **認証ガード:** `require_career_principal("ai-stream")` で FastAPI 強制 (es_review.py:2078)
- **ownership check:** `getOwnedDocument(documentId, identity)` で document.owner 検証 (handle-review-stream.ts:233)
- **guest / user 両対応:** `guest_device_token` cookie ベース
- **入力サニタイズ:** `sanitize_prompt_input` + `sanitize_review_request` + `detect_es_injection_risk` (high/medium) で HTTPException 発火

### 8-2. 弱み

- **SSE error 例外漏洩可能性:** es_review.py:2052-2056 付近で `str(e)` 直接 yield 経路あり (面接 S-01 と同等)
- **二重サニタイズの矛盾を防ぐ単体テストなし**

### 8-3. 推定スコア: 9/10 (A-)

面接 Phase 1 の `_sse_error_event()` 固定文言化を流用すれば A に到達。

---

## 9. 市場水準との gap (2026-04-17 Web 調査)

### 9-1. 業界標準に到達している機能

- **多軸スコアリング:** 類似。就活Pass は ai smell tier + length fix + grounding score の複合判定
- **企業マッチ評価:** grounding_mode 3-way policy で到達
- **企業別 ES 管理:** `/documents` で実装
- **SSE 逐次レビュー:** 実装済 (業界ではリアルタイム添削と呼称)
- **文字数制約自動調整:** model 別 gap + retry で業界標準並

### 9-2. 業界標準だが就活Pass が未到達

- **sentence-level diff 可視化** (Rezi / Jobscan 標準)
- **複数 LLM 横並び比較** (業界空白地帯、就活Pass が 4 モデル対応済なので UI 追加のみで差別化可)
- **AI 臭検出 UI** (Tier 可視化、rewrite 履歴)
- **通過 ES 大規模学習 (6-15 万件) 訴求** (ES Maker 6 万, SmartES 10 万, ESの達人 15 万)

### 9-3. 業界空白地帯 (就活Pass が取りにいける)

- **厚労省 NG 項目ガード** (面接機能で Phase 1 実装済)
- **AI 臭独立スコア UI** (業界で明示実装確認できず)
- **ガクチカ連動** (ガクチカ深掘り → ES 下書き → ES 添削の一気通貫、競合未実装)

---

## 10. 次フェーズへの推奨事項

### 10-1. 優先度高 (ROI 大)

- **S-01 SSE error サニタイズ** (面接 Phase 1 の helper 流用、1 日で完了)
- **C-01 `es_review.py` 2,132 行の façade 化** (面接 Phase 2 Stage 2 の pattern)
- **T-01 `test_reference_es_quality.py` 7 件 fail 解消**

### 10-2. 差別化スコープ

- **sentence-level diff UI** (Rezi/Jobscan 並)
- **複数 LLM 横並び比較** (業界空白)
- **AI 臭 Tier 可視化 UI**
- **厚労省 NG 項目ガード** (面接転用)

### 10-3. Phase 10 延長案

- **AI smell Tier 2 reject がゼロの原因調査** (検出漏れか真にゼロか)
- **structural_patterns_v2 系 7 fail の解消**
- **cross-model テストを 4 モデル × 24 ケースに拡張**

**現状 72/100 B-。S-01 / C-01 / T-01 解消 + 差分 UI で 80+ Grade A-、差別化スコープ完走で 88+ Grade A 到達可能。**

---

## 付録: ファイル規模

| ファイル | 行数 | 備考 |
|---------|----:|------|
| `backend/app/routers/es_review.py` | 2,132 | God Object (CLAUDE.md 500 行 × 4 倍超) |
| `backend/app/routers/es_review_grounding.py` | 902 | |
| `backend/app/routers/es_review_validation.py` | 940 | |
| `backend/app/routers/es_review_retry.py` | 867 | |
| `backend/app/routers/es_review_pipeline.py` | 233 | |
| その他 4 サブモジュール | 827 | issue / models / request / stream |
| `backend/app/prompts/es_templates.py` | 2,200 | 全 template builder |
| `backend/app/prompts/reference_es.py` | 475 | QUALITY_HINTS |
| `backend/app/prompts/reference_es_importer.py` | 817 | v2 フォーマット |
| `src/app/api/documents/[id]/review/stream/route.ts` | 17 | proxy 最小化 |
| `src/app/api/documents/[id]/review/handle-review-stream.ts` | 613 | credit + ownership + SSE |
| `backend/tests/es_review/` 合計 | 5,553 | 221 test cases |
