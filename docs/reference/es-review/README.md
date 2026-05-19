# 参考ES 設問タイプ別 作成ヒント集（offline キュレーション入力）

このディレクトリは ES 添削の参考ESヒントを手動キュレーションするための **offline 入力**です。
**runtime からは読みません**（ランタイム唯一の参照元は生成物ではなく手書き SSOT
`backend/app/prompts/es_reference_guidance.py`）。ビルド時生成スクリプトはありません。

## ファイル構成

| 種別 | パス | 役割 |
|---|---|---|
| 設問タイプ別エディトリアル | `{type}.md` ×8 | キュレーションの一次ソース（評価ポイント / 基本論理構成 / 文字数帯別の設計 / 増減順 / NG / 最終チェック） |
| 参考ES 出典・本文（pruned） | `private/reference_es/references_reclassified_by_original_label_types_pruned.md` | audit 用の元データ。gitignored / runtime 非参照 |
| 実使用ヒント一覧 | `USED_LOGIC_HINTS.md` | SSOT から再生成したレビュー用一覧（人間が確認する成果物） |

`{type}.md` の `{type}` は次の8種: `company_motivation` / `intern_reason` / `intern_goals` /
`role_course_reason` / `post_join_goals` / `gakuchika` / `self_pr` / `work_values`。
各ファイルは `〜100字` / `100〜200字` / `200〜300字` / `300〜400字` / `400〜500字` /
`500字以上` の6つの文字数帯に対応します。

`basic`（型に当てはまらない汎用ES）は専用 md を持たず、8型共通の普遍構造
（結論先行・具体根拠・今後接続）から `es_reference_guidance.py` 側で合成します。

## キュレーション運用

1. `{type}.md` を編集（実際に添削で使う現行エディトリアルが正）
2. `backend/app/prompts/es_reference_guidance.py` の該当型 `QUESTION_TYPE_GUIDANCE[type]`
   を手で更新（quality_hints / sentence_flow / bands(6帯 skeleton) / logic_patterns。
   統計値・件数は持たない）
3. `python -m pytest backend/tests/es_review/test_es_reference_guidance_contract.py`
   で型安全・全9型網羅・copy-safety を検証
4. `docs/reference/es-review/USED_LOGIC_HINTS.md` を SSOT から再生成しレビュー

複合設問（複数設問タイプ混在）はこのディレクトリで個別キュレーションせず、
runtime で型ごと単一データを primary 主導マージします
（`reference_es._merge_reference_guidance`、`template_context.merge_template_specs` と同戦略）。

## copy-safety

参考ES本文・特徴的表現・個別エピソード・既知の企業名は
`es_reference_guidance.py` に載せません（型文・抽象指針のみ）。
`docs/prompts/es-review/logic-patterns/*.json`（古い・統計付き）は廃止し
`USED_LOGIC_HINTS.md` が置換しました。
