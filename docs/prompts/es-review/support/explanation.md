# ES Review Improvement Explanation Prompt

> runtime_linkage: forbidden

## Runtime Source

- Builder: `backend/app/services/es_review/explanation.py` `_build_explanation_prompt`
- Generator: `backend/app/services/es_review/explanation.py` `generate_improvement_explanation`
- Caller: `backend/app/routers/es_review.py`
- Public stream conversion: `src/bff/es-review/public-review-stream.ts`

この文書は手動監査用であり、runtime から読み込まれない。

## Runtime Behavior

改善解説は rewrite 本文とは独立して生成する。元回答と改善案を比較し、評価軸に対応する改善ポイントと主な変更点を就活生向けに説明する。

| 項目 | 値 |
|---|---|
| model | `gpt-5.4-mini` |
| timeout | 8秒 |
| output | JSON v2 文字列 |
| stream path | `improvement_explanation` |

## System Prompt Contract

出力は JSON オブジェクトのみ。Markdown、見出し、コードフェンス、前置きは禁止。

```json
{
  "version": 2,
  "improvement_points": [
    {"axis": "評価軸名", "point": "改善ポイントを短く", "detail": "読み手に伝わる変化を1文で"}
  ],
  "main_changes": [
    {"before_summary": "変更前の要約", "after_summary": "変更後の要約", "change": "何をどう直したかを1文で"}
  ]
}
```

## Runtime Rules

- 就活生向けの平易な言葉を使う
- 重要度が高い改善から順に記載する
- `improvement_points` は最大3件、`main_changes` は最大2件
- 引用は要約し15字以内にする
- 元の回答を批判せず、改善案の良さを説明する
- 「〜べき」「〜しなければならない」ではなく「〜するとよい」「〜が効果的」のトーンにする
- 評価軸にない一般論だけで説明しない
- 空配列を避け、比較できる範囲で `improvement_points` を1件以上出す
- `reason`、`points`、`changes` など指定外のキーは出力しない

## Failure Handling

タイムアウトや例外時も ES添削自体は失敗させない。

- FastAPI 内部 SSE: 空文字の `field_complete` を `path="improvement_explanation"` で送る
- BFF 公開 SSE: `field_complete` は `explanation_complete` に変換される
- 最終 `complete.result`: 空の `improvement_explanation` は省略される

UI は `explanation_complete` と最終 `complete.result.improvement_explanation` のどちらからも説明文を受け取れる。
