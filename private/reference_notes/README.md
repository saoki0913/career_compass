# Private Reference Notes

このディレクトリには、Notion の `ノート` から抽出したローカル専用の共通 reference corpus を保存します。

保存ファイル:
- `reference_inventory.json`
- `reference_corpus.json`
- `raw_notion_dump.json`

方針:
- `質問文 + 回答文` を優先して保持する
- 明示的な質問がない場合は、直近の見出しを `question_text` として保持する
- `reference_es`, `reference_interview`, `reference_gakuchika`, `reference_motivation` はここから派生生成する
- 長いページで全文保持できない場合だけ `capture_kind=summary` を付ける
