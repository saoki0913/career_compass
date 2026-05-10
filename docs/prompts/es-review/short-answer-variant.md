# Short-Answer Prompt Variant — 設計ドキュメント

## ステータス: レビュー待ち

本ドキュメントはレビュー用の設計書であり、実装はユーザー承認後に行う。

## 背景

`char_max <= 220` の短答設問では、現行の rewrite prompt が長文向けに設計されているため:
- system prompt のトークン数が過剰（~4,000 tokens → 目標 2,000 tokens 以下）
- 企業接地ガイダンスが長すぎて本文の質に悪影響
- 参考 ES 品質ヒントが長文前提の指示を含む
- 評価軸が多すぎて焦点がぼける

## トリガー条件

```python
is_short_answer = char_max is not None and char_max <= 220
```

## 変更内容

### 1. company_guidance 軽量化

- RAG カード: 上位 2 枚のみ使用（通常は 5 枚）
- 使い方ガイド: 3 行以内に圧縮
- assistive mode: 企業言及を完全にオプション化

### 2. user_fact 制限

- 最大 2 件のみ使用（通常は制限なし）
- `current_answer` と最も関連性の高い fact を優先

### 3. reference_quality 圧縮

- 品質ヒント: 3 行以内（通常は 10 行前後）
- 統計プロファイル: 文字数・文数のみ（ばらつき等は省略）
- 骨子: 省略

### 4. evaluation_axes 制限

- 上位 3 軸のみ使用（通常は 5 軸）
- 短答で重要な軸を優先: 結論ファースト、事実保持、文字数

## トークン予算

| ブロック | 現行 | 短答 variant |
|---|---|---|
| output_contract | ~100 | ~100 |
| constraints | ~300 | ~200 |
| core_style | ~400 | ~200 |
| company_guidance | ~500 | ~150 |
| reference_quality | ~800 | ~200 |
| user_fact | ~400 | ~200 |
| evaluation_axes | ~300 | ~150 |
| playbook | ~400 | ~300 |
| その他 | ~700 | ~500 |
| **合計** | **~3,900** | **~2,000** |

## 実装方針

`_format_short_answer_guidance()` は既に存在するが、現在は補足ガイダンスのみ。
短答 variant では各ブロックの出力関数内で `is_short_answer` フラグを参照して出力量を制御する。

### 影響を受ける関数

1. `_format_company_guidance()` — カード数・使い方を制限
2. `_format_user_fact_guidance()` — fact 数を制限
3. `_format_reference_quality_guidance()` — ヒント・統計を圧縮
4. `_format_template_evaluation_rubric_from_spec()` — 軸数を制限
5. `build_template_rewrite_prompt()` — `is_short_answer` を各関数に伝播

### 新規パラメータ

既存の `char_max` から自動判定するため、新しいパラメータは不要。

## リスク評価

| リスク | 深刻度 | 対策 |
|---|---|---|
| 企業接地が不足して required 設問で品質低下 | 中 | required mode では company_guidance を通常の 3 枚に |
| 評価軸が少なすぎて重要な観点を見逃す | 低 | 結論・事実・文字数の 3 軸は常に含める |
| 参考 ES 情報が不足して文体が不安定 | 低 | 統計プロファイルの基本値は維持 |

## 段階的導入案

1. **Phase A**: `char_max <= 150` の超短答のみ適用（影響が最も大きい層）
2. **Phase B**: `char_max <= 220` まで拡大
3. **Phase C**: 効果測定後、閾値を調整

## 効果測定

- リトライ率: 短答設問での rewrite loop 回数
- degraded 率: 短答設問での劣化版出力率
- トークン使用量: system prompt のトークン数
