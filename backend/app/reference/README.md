# Reference Corpus

Git 管理する production-safe な参考材料を置く。

- ES添削向け参考ES本文は `docs/reference/es-review/` の offline 入力に移動済み。runtime は `backend/app/prompts/es_reference_guidance.py` の抽象ヒントだけを使う。
  - `es_reference_guidance.py` は **手動キュレーション SSOT**（ビルド時生成スクリプトは無い）。`docs/reference/es-review/{type}.md`（実際に添削で使う現行エディトリアル）を見て型ごとに直接執筆し、`backend/tests/es_review/test_es_reference_guidance_contract.py` が型安全・全9型網羅・copy-safety を恒久検証する。`basic` は専用 md が無く汎用既定を合成。
  - 実使用ヒントのレビュー用一覧は `docs/reference/es-review/USED_LOGIC_HINTS.md`（SSOT から再生成。旧 `docs/prompts/es-review/logic-patterns/*.json` は古いため廃止・置換済み）。
  - 複合設問（複数設問タイプ混在）は型ごと単一データを runtime で primary 主導マージ（`reference_es._merge_reference_guidance`、`template_context.merge_template_specs` と同戦略）。統計値・件数表示は廃止し定性ヒントのみ。
- `interview/<company>/references.jsonl`: 面接対策向けの参考 Q&A データ。企業別サブディレクトリに格納。runtime では本文を LLM prompt に渡さず、統計・粗い構成特徴だけを使う。
- `gakuchika/references.jsonl`: ガクチカ作成向けの将来用置き場。v1 runtime では未使用。
- `motivation/references.jsonl`: 志望動機作成向けの将来用置き場。v1 runtime では未使用。

各 JSONL record は `capture_kind: "full_text"`, `usage_consent: true`, `anonymized: true`, `source_provenance` を持つこと。summary / excerpt / 複数設問が連結された本文 / 文字数条件などの設問文が混ざった本文は入れない。参考本文・特徴的表現・個別エピソードを prompt / API response / debug log に出してはいけない。
