# ES Review 修復戦略ドキュメント

ES添削の品質チェック失敗時に適用される修復（retry/focus mode）戦略の設計仕様。
評価・A/Bテスト用の参照ドキュメントとして使用する。

---

## 修復パイプライン概要

```
Rewrite Loop (max 3 attempts)
  ├── attempt 1: normal mode
  ├── attempt 2: atomic focus mode OR composite mode
  └── attempt 3: safe_rewrite mode (compound-aware)
         │
         ▼
Recovery Pipeline
  ├── Length-fix (1 attempt, final_soft validation)
  │     └── compound-aware: structural + length focus を同時指示
  └── Best-effort adoption (degraded_best_effort)
```

---

## Focus Mode 一覧

### 単体 Focus Modes

| Mode | トリガーコード | プロンプト概要 | 期待効果 |
|------|---|---|---|
| `length_focus_min` | under_min | delta-band 別の具体的拡張戦略 | 文字数不足を解消 |
| `length_focus_max` | over_max | 重複・冗長から削る | 文字数超過を解消 |
| `style_focus` | style | だ・である調に統一 | です/ます混入を解消 |
| `grounding_focus` | grounding | 企業接点を1点組み込む | 企業根拠不足を解消 |
| `answer_focus` | answer_focus | 結論ファーストで伝わる構成 | 冒頭の答え不在を解消 |
| `opening_focus` | verbose_opening | 結論から書き出す | 設問オウム返しを排除 |
| `structure_focus` | fragment, bulletish | つながった散文に書き切る | 断片・箇条書きを解消 |
| `quantify_focus` | quantify | 行動動詞で具体化 | 抽象表現を具体化 |
| `fact_preservation_focus` | hallucination | 事実を一切改変しない | 数値/役職の捏造を防止 |
| `positive_reframe_focus` | negative_self_eval | 前向きな行動特性に言い換え | 自己否定語を排除 |

### Composite Focus Modes（複合修正 — Step 方式）

| Mode | トリガー組み合わせ | 段階指示 |
|------|---|---|
| `length_answer_focus` | under_min + answer_focus/verbose_opening | Step 1: 結論ファースト → Step 2: 文字数到達 |
| `length_style_structure` | under_min + style/fragment/bulletish | Step 1: 構造修復 → Step 2: 文字数到達 |
| `length_grounding` | under_min + grounding | Step 1: 企業接点組み込み → Step 2: 文字数到達 |
| `length_quantify` | under_min + quantify | Step 1: 数値保持 → Step 2: 文字数到達 |
| `fact_safety_length` | hallucination + under_min/over_max | 事実保全優先で文字数を調整 |
| `fact_safety_structure` | hallucination + 構造コード | 事実保全優先で構造を修復 |
| `company_reference_length` | company_reference + under_min | Step 1: 敬称誤用排除 → Step 2: 文字数到達 |

---

## Delta-band 別戦略（length_focus_min 動的プロンプト）

`FocusModeContext` が提供された場合、shortfall 量に応じた具体的修復指示を生成する。

| Delta Band | 条件 | 修復戦略 |
|---|---|---|
| **large** | shortfall >= 70字 | 既存事実の範囲で2〜3文追加。結論を動かさず、根拠経験→学び→企業/役割接点を順に展開。1文あたり30〜50字目安 |
| **medium** | 35-69字 | 既存の経験・行動・学び・企業接点から1文追加して目標へ近づける。既存文脈の具体化か因果の補足 |
| **small** | 15-34字 | 既存文脈に補足句または短文を1つ追加。語尾の具体化、接続表現の追加、修飾の密度向上 |
| **tiny** | < 15字 | 語尾変更・短い補足句・接続表現だけで微調整。意味を変えず密度を上げる |

共通制約:
- 一般論の水増し禁止
- 新しい経験・数値・役職・企業施策の捏造禁止
- SSOT: `compute_shortfall_delta_band()` in `backend/app/prompts/es_templates/_length_control.py`

---

## 内部目標文字数（under_min_recovery オーバーシュート方式）

LLM は consistently にアンダーシュートするため、`under_min_recovery` stage では内部目標を **char_max を超えて** 設定する。

### オーバーシュート値

| Provider | short | medium | long |
|---|---|---|---|
| GPT-5 Mini | +20 | +15 | +10 |
| Claude / GPT-5 / Gemini / generic | +15 | +12 | +8 |

### 計算ロジック

```python
overshoot = abs(gap)  # gap is negative for recovery stage
target_upper = char_max + overshoot
target_lower = char_max + max(1, overshoot - 5)
```

### 効果例

| 設問 | char_min | char_max | band | 内部目標 | LLM 15字不足時 | 判定 |
|---|---|---|---|---|---|---|
| 短文 | 140 | 150 | short | 160-165字 | 150字 | pass (>= 140) |
| 中文 | 190 | 200 | short | 210-215字 | 200字 | pass (>= 190) |
| 長文 | 390 | 400 | long | 405-408字 | 393字 | pass (>= 390) |

LLM prompt には strict受理帯（例: 140字〜150字）と内部目標帯（例: 160字〜165字）の両方が表示される。over_max した場合はセマンティック圧縮で対応。

---

## Temperature / Token 上限

| Stage | Focus Mode | Temperature | Token 上限 | 根拠 |
|---|---|---|---|---|
| Rewrite | normal | 0.20 | char_max * 1.4 | 創造的なリライト |
| Rewrite | length_focus_min (large) | 0.15 | char_max * 1.3 | 大幅追加には創造性が必要 |
| Rewrite | length_focus_min (medium) | 0.13 | char_max * 1.3 | バランス |
| Rewrite | length_focus_min (small/tiny) | 0.11 | char_max * 1.3 | 微調整は保守的に |
| Rewrite | 他の focus mode | 0.14 | char_max * 1.4 | 構造変更には適度な自由度 |
| Length-fix | - | 0.12 | char_max * 1.2 | 既存テキストの拡張 |
| GPT-5 mini | normal | 0.12 | char_max * 1.4 * 1.12 | mini のアンダーシュート補正 |

---

## Retry Hint テンプレート

validation 失敗時にプロンプトに追加される修復ヒント。

| 失敗コード | Retry Hint |
|---|---|
| under_min (large) | 前回{N}字、目標{M}字まで{S}字不足。2~3文の追加が必要。経験→役割→企業接点を順に展開する |
| under_min (medium) | 前回{N}字、目標{M}字まで{S}字不足。1文追加で足りる。行動・学び・企業接点いずれかを1文で補う |
| under_min (small) | 前回{N}字、目標{M}字まで{S}字不足。短い補足句で到達可能。語尾や接続表現を活用する |
| under_min (tiny) | 前回{N}字、目標{M}字まで{S}字不足。微調整のみ。語尾変更や1句追加で到達する |
| fragment | 本文を断片で終わらせず、最後まで言い切る |
| answer_focus | 冒頭で結論ファーストに書き、読み手に伝えたいことが明確に伝わる構成にする |
| style | です・ます調を使わず、だ・である調に統一する |
| hallucination | 元回答の数値・役割・具体経験を変更せず保持する |
| grounding | 企業根拠カードから方向性を1句拾い、自分の経験との接点で組み込む |

---

## 評価方法

### Live テストでの計測

`make test-e2e-functional-local AI_LIVE_LOCAL_FEATURES=es-review` の出力マニフェストから:

| メトリクス | 計算方法 | 目標値 |
|---|---|---|
| under_min 最終失敗率 | final validation code が under_min の件数 / 全実行件数 | < 15% |
| compound 修復成功率 | composite mode 使用後に pass した件数 / composite mode 使用件数 | > 60% |
| degraded 発生率 | degraded_best_effort 件数 / 全実行件数 | < 20% |
| 平均 retry 回数 | 全ケースの rewrite attempt 数の平均 | < 2.5 |

### A/B テスト手法

`_focus_modes.py` の `_STATIC_GUIDANCE_MAP` または `_dynamic_length_focus_min` 内のプロンプト文面を差し替えて Live テストを再実行する。

---

## degraded 出力の扱い

| 状態 | HTTP | billing | ユーザー表示 |
|---|---|---|---|
| strict_ok / soft_ok | 200 | 成功消費 | 改善案を表示 |
| degraded_best_effort | 200 | 成功消費 | 改善案 + 注意表示（文字数不足等） |
| validation 全失敗 | 422 | 消費しない | エラーメッセージ |
