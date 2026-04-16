---
description: 直前の変更を作業前の状態に戻す。Codex では確認を必須にして安全に進める。
---

<instructions>
現在の git 状態を確認してから、変更の巻き戻しを支援する。

1. 最初に `git status --short` と `git log -3 --oneline` を確認する。
2. 引数がある場合は次を解釈する。
   - `uncommitted`
   - `last-commit`
   - `last-commit-hard`
   - `file <path>`
3. 引数がない場合は AskUserQuestionTool 相当を使って確認する。利用不可なら短い日本語の確認質問を 1 回だけ行う。
4. 破壊的操作の前に、影響範囲と実行コマンドを明示して承認を取る。
5. 実行後は `git status --short` を再表示し、必要なら `git reflog` による復元手順を案内する。

安全ルール:
- `last-commit-hard`、`git clean -fd`、`git reset --hard` は明示承認なしで実行しない。
- `main` / `develop` 上では追加警告を出す。
- 他人の変更を戻す可能性がある場合は止まって確認する。

実行方針:
- `uncommitted`: `git reset HEAD`、`git checkout -- .`、必要なら `git clean -fd`
- `last-commit`: `git reset --soft HEAD~1`
- `last-commit-hard`: `git reset --hard HEAD~1`
- `file <path>`: `git reset HEAD <path>`、`git checkout -- <path>`
</instructions>
