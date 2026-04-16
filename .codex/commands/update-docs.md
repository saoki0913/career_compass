---
description: ドキュメントを最新の実装状態へ同期する。Codex では対象確認と差分要約を先に行う。
---

<instructions>
対象ドキュメントを関連実装と照合し、必要な更新を行う。

1. 引数がある場合は、ファイルパスまたはカテゴリとして解釈する。
   - `progress`
   - `features`
   - `architecture`
   - `setup`
   - `all`
2. 引数がない場合は AskUserQuestionTool 相当で対象を確認する。利用不可なら短い日本語の質問で確認する。
3. 対象 docs を読み、対応するコードや設定を読んで不一致を列挙する。
4. 編集前に、更新予定の要点を 3-6 行で共有する。
5. 編集後は変更点を要約し、必要なら関連 docs の追随更新も提案する。

確認項目:
- API エンドポイントやレスポンス形の変更
- feature の実装状態と docs の不一致
- `docs/PROGRESS.md` の進捗や日付
- 相対リンク切れ
- Codex / Claude / Cursor の運用 docs の整合

カテゴリ対応:
- `progress` -> `docs/PROGRESS.md`
- `features` -> `docs/features/*.md`
- `architecture` -> `docs/architecture/*.md`
- `setup` -> `docs/setup/*.md`
- `all` -> `docs/` 全体

文体ルール:
- repo の docs ルールに合わせて日本語中心で書く。
- コマンド、パス、型名、識別子は英語のまま保つ。
</instructions>
