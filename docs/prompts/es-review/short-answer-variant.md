# Short-Answer Prompt Variant — 設計ドキュメント

## ステータス: quality-first 実装後の補足設計

本ドキュメントは、quality-first rewrite prompt における短答設問の補足方針を記録する。通常生成プロンプトの正本は `QualityBlueprint`、`FactBoundary`、`length_style` であり、短答向けにもこの構造を崩さない。

実行時の正本は `backend/app/prompts/es_templates/_prompt_builder.py`、`backend/app/services/es_review/retry.py`、`backend/app/prompts/es_templates/_length_control.py` である。この文書は監査用であり、runtime から読み込まれない。

## 背景

`char_max <= 220` の短答設問では、長文向けの説明量を残すと、本文に必要な結論・根拠・再現性よりも補助説明が目立ちやすい。現在は通常プロンプト自体を quality-first に整理しているため、短答では追加の長文ブロックを足さず、既存の `QualityBlueprint` と `length_style` を短く保つ。

## トリガー条件

```python
is_short_answer = char_max is not None and char_max <= 220
```

## 変更内容

### 1. company context 軽量化

- assistive かつ evidence coverage が `none` の場合、企業カードは渡さない
- assistive かつ `weak` の場合、compact mode では企業カードを渡さず、通常 attempt でも1枚までに抑える
- required / deep 系でも短答ではカード数を抑え、企業固有情報の羅列より自己接続を優先する
- 企業言及は grounding mode と effective company grounding policy に従う

### 2. user_fact 制限

- 短答では `_select_rewrite_prompt_context()` が prompt user facts を最大5件に制限する
- compact mode でも最低4件を残す
- `current_answer`、設問、職種、インターン名、会社名との関連が高い fact を優先する

### 3. QualityBlueprint 圧縮

- 初回は `flow` 最大5件、`must_improve` 最大3件、`avoid` 最大3件
- retry phase では `flow` 最大3件、`must_improve` 最大2件、`avoid` 最大2件に短縮される
- 参考ES由来の品質ヒントは傾向だけに使い、通常生成プロンプトへ reference quality block の長文を戻さない
- `enumeration_phrasing` は文字数帯に合う場合だけ `must_improve` の先頭に入る

### 4. length_style 短縮

- strict受理帯と生成目標帯を明示
- 不足時は新事実ではなく、元回答にある目的・対象・行動・結果・学び・接続を具体化
- 超過時は重複説明、一般論、補助論点を削る

## トークン予算

| ブロック | 現行 | 短答 variant |
|---|---|---|
| output_contract | ~100 | ~100 |
| constraints | ~200 | ~150 |
| quality_blueprint | ~700 | ~350 |
| fact_boundary | ~250 | ~250 |
| length_style | ~350 | ~200 |
| company_guidance | ~500 | ~150 |
| user_fact | ~400 | ~200 |
| その他 | ~700 | ~500 |
| **合計** | **~3,900** | **~2,000** |

## 実装方針

`_format_short_answer_guidance()` は補足ガイダンスとして維持する。短答 variant では、通常生成プロンプトに旧 `<template>` や `<evaluation_rubric>` を戻さず、`QualityBlueprint` の構成と `length_style` の補足だけで制御する。

### 影響を受ける関数

1. `_format_short_answer_guidance()` — 短答向けの構成、文数、密度を補助
2. `_format_length_style_section()` — 短答向けの不足・超過ガイドを追加
3. `_select_rewrite_prompt_context()` — 短答時のユーザー事実・企業根拠カードを制限
4. `build_quality_blueprint()` — 短答でも品質ヒント・必須要素・避ける点を圧縮
5. `build_template_rewrite_prompt()` — 通常生成プロンプトで長文 reference quality block を出さない

### 関連条件

- `dense_short_answer`: 150〜220字で 3〜4 文を促す
- `three_sentence_close_on_short_band`: 160〜220字で 3 文締めを促す
- 中字数ガイド: `char_min` / `char_max` があり、`280 <= char_max <= 520` かつ playbook がある場合

### 新規パラメータ

既存の `char_max` から自動判定するため、新しいパラメータは不要。

## リスク評価

| リスク | 深刻度 | 対策 |
|---|---|---|
| 企業接地が不足して required 設問で品質低下 | 中 | required / deep では evidence coverage と compact mode に応じてカードを残す |
| 品質設計が薄くなりすぎる | 中 | `QualityBlueprint` の `primary_goal` と `must_improve` は維持 |
| 参考ES情報が不足して文体が不安定 | 低 | 参考ES本文ではなく品質ヒントだけを維持 |

## 現行ステータス

短答補助は `char_max <= 220` を基準に適用済み。段階導入ではなく、通常 rewrite / retry の実行時条件として扱う。

## 効果測定

- リトライ率: 短答設問での rewrite loop 回数
- degraded 率: 短答設問での劣化版出力率
- トークン使用量: system prompt のトークン数
