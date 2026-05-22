# ES 添削プロンプトスナップショット

このディレクトリは、ES 添削で使うプロンプトを人間がレビューするための資料です。アプリ内プロンプトの正本ではありません。

> runtime_linkage: forbidden

実行時の正本は `backend/app/prompts/es_templates/`、`backend/app/prompts/es_reference_guidance.py`、`backend/app/prompts/reference_es.py`、`backend/app/services/es_review/` にある。ここにある文書は手動監査用の説明・スナップショットであり、runtime から読み込まれない。

## 構成

- `templates/`: `TEMPLATE_DEFS` の設問タイプ別 prompt / rubric snapshot です。
- `support/`: rewrite、fallback rewrite、draft generation、改善説明、参考 ES 品質 profile などの共通 prompt surface です。

`templates/*.md` は設問タイプ別のレビュー用スナップショットである。実装変更に完全追従していない可能性があるため、最終判断は `backend/app/prompts/es_templates/` を確認する。

## 読む順序

通常の確認では、対象設問に対応する `templates/*.md` を読み、共通の生成・retry・字数調整は `support/*.md` で確認します。

## 共通ハルシネーション防止ルール

ES 添削の rewrite / fallback rewrite では、全設問タイプに共通して次を守ります。

- 元回答・使えるユーザー事実・企業根拠カードにない数値、役職、経験、成果、企業施策を追加しない
- 文字数不足でも新事実で埋めず、既存事実の説明密度、接続、語尾、構成だけで調整する
- 前回不合格案に含まれる事実でも、正本入力にないものは削除する
- 企業根拠カードは方向性の補助に使い、未確認の固有施策・社内体制・数値として断定しない

runtime では `hallucination` を hard block として扱う。数値改変、役職名改変、元回答にない実績・経験の追加は `degraded` 採用せず、事実保全 retry または複合 retry（例: `fact_safety_length`, `fact_safety_structure`）へ回す。

## 更新時の確認

プロンプト仕様や AI 出力品質に関わる説明を変えた場合は、文書の主張を正本コードと照合したうえで、少なくとも以下を確認対象にする。

```bash
pytest backend/tests/es_review/test_es_review_prompt_structure.py \
  backend/tests/es_review/test_es_reference_guidance_contract.py \
  backend/tests/es_review/test_reference_es_quality.py \
  backend/tests/es_review/test_reference_es_compound.py \
  backend/tests/prompts/test_logic_patterns_enumeration.py \
  backend/tests/es_review/test_llm_validation.py \
  backend/tests/es_review/test_validation_profile.py \
  backend/tests/es_review/test_es_review_template_repairs.py \
  backend/tests/es_review/test_es_review_explanation_prompt.py \
  backend/tests/prompts/test_es_draft_generation_prompt.py
```
