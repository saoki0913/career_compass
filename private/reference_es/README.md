# Private Reference ES

このディレクトリには、Git に上げたくない参考ESをローカル専用で保存します。

保存ファイル:
- `es_references.json`
- `raw_notion_dump.json`

補足:
- `private/reference_notes/reference_corpus.json` から派生した note-based reference も `es_references.json` にマージされます
- 既存の ES 参考データは保持しつつ、`notes_` プレフィックスの ID で追加されます

形式:

```json
{
  "version": 1,
  "references": [
    {
      "id": "ref_company_motivation_001",
      "question_type": "company_motivation",
      "company_name": "任意",
      "char_max": 400,
      "title": "志望理由 400字",
      "text": "参考ES本文"
    }
  ]
}
```

`question_type` は ES 添削のテンプレートIDに合わせます。
`text` には設問に対応する回答本文だけを入れます。補足文は付けません。

Notion Database から一括取り込みする場合:

```bash
python scripts/import_notion_reference_es.py /path/to/notion_reference_dump.json --save-raw
```

- 入力は Notion MCP / Notion API の Database query 結果 JSON を想定しています
- 1ページに複数設問が入っている ES でも、本文を分割して取り込みます
- 現在対応する `question_type` は `company_motivation`, `intern_reason`, `intern_goals`, `gakuchika`, `post_join_goals`, `role_course_reason`, `work_values` です
- 未対応の設問や抽出に失敗した設問は `raw_notion_dump.json` に除外理由つきで残ります
- 出力は `private/reference_es/es_references.json` に保存されます
