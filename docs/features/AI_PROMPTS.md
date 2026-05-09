# AI プロンプト構成インデックス

LLM に渡す system / user プロンプトの構成は **コードが正本**。本ファイルはポインタのみを管理する。

---

## Runtime 正本（SSOT）

| 機能 | プロンプト構築の起点 | 主要ビルダー |
|------|---------------------|-------------|
| ES 添削 | `backend/app/prompts/es_templates/` | `_prompt_builder.py::build_template_rewrite_prompt` |
| 志望動機 | `backend/app/prompts/motivation_prompts.py` | `build_motivation_question_prompt` 等 |
| ガクチカ | `backend/app/prompts/gakuchika_prompts.py` | `build_gakuchika_question_prompt` 等 |
| 面接対策 | `backend/app/prompts/interview_prompts.py` | `build_interview_question_prompt` 等 |
| 企業情報 | `backend/app/prompts/company_info_prompts.py` | LLM 抽出用プロンプト |
| RAG 補助 | `backend/app/prompts/hybrid_search_prompts.py` | クエリ拡張・HyDE |
| 参考 ES | `backend/app/prompts/reference_es.py` | 品質プロファイル・ヒント生成 |

## レビュー用 Snapshot

`docs/prompts/` にフォルダ別の snapshot を保持する（レビュー・比較用。runtime 正本ではない）。

## 運用ルール

- プロンプト本文をこのファイルに書かない。コードが唯一の正本
- Notion 管理プロンプトは `get_managed_prompt_content` 経由で取得し、未同期時はコード内フォールバックを使用
- 各機能の詳細は `docs/features/` の各機能ドキュメントを参照
