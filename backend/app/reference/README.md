# Reference Corpus

Git 管理する production-safe な参考材料を置く。

- `es_review/<template_type>/references.jsonl`: ES添削で使うテンプレート別参考ES。runtime では本文を LLM prompt に渡さず、統計・粗い構成特徴だけを使う。
- `interview/<company>/references.jsonl`: 面接対策向けの参考 Q&A データ。企業別サブディレクトリに格納。runtime では本文を LLM prompt に渡さず、統計・粗い構成特徴だけを使う。
- `gakuchika/references.jsonl`: ガクチカ作成向けの将来用置き場。v1 runtime では未使用。
- `motivation/references.jsonl`: 志望動機作成向けの将来用置き場。v1 runtime では未使用。

各 JSONL record は `capture_kind: "full_text"`, `usage_consent: true`, `anonymized: true`, `source_provenance` を持つこと。summary / excerpt / 複数設問が連結された本文 / 文字数条件などの設問文が混ざった本文は入れない。参考本文・特徴的表現・個別エピソードを prompt / API response / debug log に出してはいけない。
