# ES 添削プロンプトスナップショット

このディレクトリは、ES 添削で使うプロンプトを人間がレビューするための資料です。アプリ内プロンプトの正本ではありません。

> runtime_linkage: forbidden

## 構成

- `templates/`: `TEMPLATE_DEFS` の設問タイプ別 prompt / rubric snapshot です。
- `support/`: rewrite、fallback rewrite、draft generation、length fix、改善説明、参考 ES 品質 profile などの共通 prompt surface です。

## 読む順序

通常の確認では、対象設問に対応する `templates/*.md` を読み、共通の生成・retry・字数調整は `support/*.md` で確認します。

## 共通ハルシネーション防止ルール

ES 添削の rewrite / fallback rewrite / length fix では、全設問タイプに共通して次を守ります。

- 元回答・使えるユーザー事実・企業根拠カードにない数値、役職、経験、成果、企業施策を追加しない
- 文字数不足でも新事実で埋めず、既存事実の説明密度、接続、語尾、構成だけで調整する
- 前回不合格案に含まれる事実でも、正本入力にないものは削除する
- 企業根拠カードは方向性の補助に使い、未確認の固有施策・社内体制・数値として断定しない

runtime では `hallucination` を hard block として扱う。数値改変、役職名改変、元回答にない実績・経験の追加は `degraded` 採用せず、事実保全 retry または複合 retry（例: `fact_safety_length`, `fact_safety_structure`）へ回す。
