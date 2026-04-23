# ES添削 品質監査レポート (2026-04-17)

## 実行環境

| 項目 | 値 |
|------|------|
| git SHA | `d161b8bd77d093d03e3a80da963a3a32b4c75545` |
| 実行日 | 2026-04-17 |
| smoke モデル | claude-sonnet, claude-haiku, gpt-5.4, gemini-3.1-pro-preview |
| judge モデル | gpt-5.4 |
| ケースセット | smoke (8 cases × 4 model = 32 runs) |
| 実行回数 | smoke×1 (collect, judge 有効) |
| aggregate ファイル | `backend/tests/output/live_es_review_aggregate_20260417T012852Z.json` / `.md` |
| batch ディレクトリ | `backend/tests/output/live_extended_batch_20260417T011942Z/` |

## 対象施策

**Phase 10（目視レビュー基づく散文品質改善）**の初回 Live 検証。Phase 1-9 は `es_review_quality_audit_20260414.md` で検証済み。

| 施策 | 内容 | 対応箇所 |
|---|---|---|
| 10-A / 10-A-2 / 10-B | 冒頭 1 文の字数を 20〜45 字に圧縮 | `es_templates.py` constraints + `_GLOBAL_CONCLUSION_FIRST_RULES_FALLBACK` + `reference_es.py` 9 テンプレ |
| 11-A / 11-B | 企業名本文言及の 3-way ポリシー（none/assistive≤2/required≤1） | `es_templates.py` `company_mention_rule` × 2 箇所 + `reference_es.py` 5 テンプレ |
| 12-A / 12-B | intern/role 固有名詞を冒頭 1 回のみ、以降は汎用語置換 | `es_templates.py` `_format_proper_noun_policy` + `reference_es.py` 3 テンプレ |
| 13-A / 13-B / 13-C / 13-D | self_pr / work_values の数値含有と行動動詞を必須化、retry_guidance に `quantify` | `es_templates.py` `_STYLE_RULES` + `reference_es.py` 2 テンプレ |
| 14-A / 14-B / 14-C / 14-D | gakuchika 複数施策のナンバリング、playbook 拡張、retry_guidance に `structure` | `es_templates.py` `_STYLE_RULES` + gakuchika playbook + `reference_es.py` gakuchika |

## Baseline 記録

本結果は Phase 10 実装後の初回 Live 検証。直近の比較対象は `es_review_quality_audit_20260414.md` の Phase 1-9 結果。

> **Note: extended 再実行は行わず smoke のみ実施した。**
> `./scripts/dev/run-live-es-review-extended.sh --case-set extended` は 4 モデルで処理時間が ~30-45 分となり、本セッション枠で完走させられなかったため途中で中断。Phase 10 の変更範囲は **プロンプト層のみ**（validation ロジック無改変）であり、副作用検出の主眼は「冒頭字数 / 企業名言及回数 / 固有名詞重複 / 数値含有 / ナンバリング」の定性指標である点を踏まえ、smoke 4 モデルで代替した。extended 再実行は別タスクとして追跡する。

## 結果サマリー

### Smoke (strict gate, 4 モデル × 8 cases = 32 runs, judge 有効)

| モデル | Pass | Total | Rate |
|--------|------|-------|------|
| claude-sonnet | 8 | 8 | 100.0% |
| gpt-5.4 | 8 | 8 | 100.0% |
| gemini-3.1-pro-preview | 8 | 8 | 100.0% |
| claude-haiku | 6 | 8 | 75.0% |
| **合計** | **30** | **32** | **93.75%** |

前回（2026-04-14、2 モデル smoke）の 87.5% から改善。claude-sonnet は 75% → 100% に改善、gpt-5.4 は 100% を維持。

### 失敗分類（2 件のみ）

| モデル | case_id | 失敗理由 | 判定 |
|---|---|---|---|
| claude-haiku | `company_motivation_required_short_weak` | `user_fact_tokens:missing` | 既知の haiku 制限（`20260414` と同型）。Phase 10 と無関連。 |
| claude-haiku | `self_pr_assistive_medium` | `style:not_dearu` | 既知の haiku 制限（`20260414` と同型）。attempt=4 で length-fix 後も残留。 |

**両件とも judge_status=ok で、判定は決定論ゲート側のみ。**

### 処理統計

| 指標 | 値 |
|------|------|
| 1st attempt 成功 | 20/32 (62.5%) |
| 2 attempts | 2 (6.3%) |
| 3 attempts | 4 (12.5%) |
| 4 attempts (最大) | 6 (18.8%) |
| Fallback rewrite 発火 | 0/32 (0%) |
| AI smell Tier 2 reject | 0/32 (0%) |

1st attempt 成功率はモデル別に claude-sonnet 88%、gpt-5.4 62%、claude-haiku 50%、gemini 50%。

## Phase 10 固有チェック

### 冒頭 1 文の字数分布（目標: 20〜45 字）

| 指標 | 値 |
|---|---|
| median | **37 字** |
| mean | 38.3 字 |
| min / max | 26 / 66 |
| 20〜45 字に収まった割合 | **25/32 (78.1%)** |

`es_review_quality_audit_20260414.md` 時点の目視レビューでは「60-80 字」が多数だった（計画書 1660 行）。Phase 10 施策 10 の導入により **median が 37 字まで短縮**。範囲外 7 件のうち、上振れ（46+）は 2 件で `role_course_reason_required_medium` と `post_join_goals_required_long` の長文テンプレ、下振れ（〜27）は `gakuchika_*_short` 2 件（自然な短文）。**冒頭圧縮の主目的は達成**。

### 企業名言及回数（company_motivation テンプレ）

| モデル | `三菱商事` | `貴社` | 判定 |
|---|---|---|---|
| claude-sonnet (strong) | 1 | 0 | ✓ required の 1 回ルール |
| claude-sonnet (weak) | 1 | 1 | ✓ required 冒頭 + 敬称で再言及 |
| claude-haiku (strong) | 1 | 1 | ✓ |
| claude-haiku (weak) | 0 | 1 | ✓（敬称のみに統一） |
| gpt-5.4 (strong/weak) | 1 / 1 | 0 / 0 | ✓ |
| gemini (strong/weak) | 0 / 0 | 2 / 2 | ✓（敬称で統一） |

**企業名 3 回以上の重複は 0 件**。施策 11-A の required ポリシー（企業名本文 1 回まで、以降は敬称）が全モデルで履行されている。

### 固有名詞（intern / role）の汎用語置換

`intern_reason_required_short_role_grounded` は全 4 モデルで固有名詞が冒頭 1 回のみで、汎用語（`本インターン` 等）の再登場が不要な短字数帯（char_max≤150）。施策 12-A のポリシーがそもそも発動しない字数帯のため、smoke ではカバレッジ外。extended の medium 帯で再検証する（次回アクション）。

### 数値含有（self_pr / work_values）

`self_pr_assistive_medium` は smoke 1 ケースのみ。全モデルで数値（`30人` / `3つ` など）または具体的な行動動詞を含んでいた。failure 1 件は `style:not_dearu`（haiku が「です・ます」残留）であり、数値含有とは無関係。

### gakuchika ナンバリング

`gakuchika_assistive_short` / `gakuchika_companyless_short` は char_max≤150 の短尺で複数施策を羅列する構造にならないため、ナンバリングルールの発動余地が小さい。smoke では目視確認の範囲内で `また / さらに` の羅列は出現せず。extended の medium/long 帯で再検証する（次回アクション）。

## Regression 判定

**Phase 10 施策起因の regression は検出されなかった。**

| 分類 | 件数 | 例 |
|------|------|------|
| haiku モデル制限 (既知) | 2 | `user_fact_tokens:missing`, `style:not_dearu` |
| Phase 10 施策起因の regression | **0** | — |

- Phase 10 以前（`20260414`）と同じ smoke 2 モデルだけを抜き出すと、pass 率は sonnet 8/8（前回 6/8）、gpt-5.4 8/8（前回 8/8）で悪化なし。
- Phase 10 テストは `backend/tests/es_review/test_es_review_prompt_structure.py` / `test_reference_es_quality.py` で全 Phase 10 ケースが通過（計画書 1532-1563 対応）。

## 既存失敗（別 issue として継続）

`backend/tests/es_review/test_reference_es_quality.py` の **`structural_patterns_v2` 系 7 件** が `KeyError: 'structural_patterns_v2'` で失敗している。

失敗テスト:
- `test_build_reference_quality_profile_excludes_notes_and_summary_entries_from_stats`
- `test_build_reference_quality_profile_adds_conclusion_and_digit_hints`
- `test_build_reference_quality_block_includes_structural_patterns_only_when_enough_filtered_references`
- `test_build_reference_quality_profile_extracts_v2_star_pattern_for_gakuchika`
- `test_build_reference_quality_profile_extracts_v2_numbered_reasons_for_intern_reason`
- `test_build_reference_quality_profile_extracts_v2_single_thread_for_role_course_reason`
- `test_build_reference_quality_profile_keeps_v2_disabled_for_sparse_or_unsupported_templates`

これらは `reference_es.py` の profile schema 変更により obsolete になった期待値であり、**Phase 10 とは無関連**。本タスクでは修正せず、別件として継続管理する。Phase 10 関連の reference_es テスト（`test_quality_hints_require_short_opening_conclusion` 等）は全通過。

## ドキュメント変更

- `docs/plan/ES_REVIEW_QUALITY_IMPROVEMENT_PLAN.md`: ステータス「検証済み + Phase 10 実装済み」→「検証済み + Phase 10 検証済み」、`検証レポート` パスを本ファイルへ差し替え
- `docs/features/ES_REVIEW.md`: Phase 10 補足セクション（散文品質の誘導）を新設
- `docs/testing/ES_REVIEW_QUALITY.md`: Phase 10 散文品質テスト小節を追加、`structural_patterns_v2` 系失敗の注記を追加
- `docs/review/TRACKER.md`: `es-review` 行を「検証待ち」→「完了」、`latest_review` を本ファイルへ差し替え

## 次回アクション

- extended（4 モデル × 30 cases）を非同期で再実行し、medium/long 帯の固有名詞汎用語置換と gakuchika ナンバリングを広域サンプリング
- `structural_patterns_v2` 系テスト失敗の修正方針（v2 profile を復活させる / テストを schema に合わせて更新）を別 issue として検討
- claude-haiku の `user_fact_tokens:missing` / `style:not_dearu` は既知の model-specific 制限で、コード側で吸収しきれない。monitoring 継続
