---
description: 直前の変更を作業前の状態に戻す。未コミット変更の破棄やコミットの取り消しが可能。
user-invocable: true
---

# Reset Changes

直前の変更を作業前の状態に戻すスキル。未コミットの変更を破棄したり、直前のコミットを取り消したりできます。

## 引数: $ARGUMENTS

- **`uncommitted`**: `/reset-changes uncommitted` - 未コミットの変更をすべて破棄
- **`last-commit`**: `/reset-changes last-commit` - 直前のコミットを取り消し（変更は保持）
- **`last-commit-hard`**: `/reset-changes last-commit-hard` - 直前のコミットと変更を完全に破棄
- **`file <path>`**: `/reset-changes file src/app/page.tsx` - 特定ファイルの変更を破棄
- **引数なし**: 対話的にリセット方法を選択

## 処理フロー

### 1. 現在の状態確認

```bash
git status
git log -3 --oneline
```

- 現在のブランチ名を表示
- 未コミットの変更があるか確認
- 直近3コミットを表示

### 2. リセット方法の決定

**引数ありの場合**: `$ARGUMENTS`に基づいて処理

**引数なしの場合**: AskUserQuestionツールで以下から選択を求める
- 未コミットの変更を破棄
- 直前のコミットを取り消し（変更は保持）
- 直前のコミットを完全に破棄
- 特定ファイルのみ元に戻す

### 3. 安全確認

**重要**: 破壊的な操作の前に必ず確認する

- 影響を受けるファイル一覧を表示
- `last-commit-hard`の場合は特に警告を強調
- ユーザーの明示的な承認を得る

### 4. リセットの実行

**未コミットの変更を破棄** (`uncommitted`):
```bash
# ステージングを解除
git reset HEAD

# 変更を破棄
git checkout -- .

# 新規ファイルを削除（確認後）
git clean -fd
```

**直前のコミットを取り消し - 変更保持** (`last-commit`):
```bash
# HEADを1つ前に戻す（変更はワーキングディレクトリに残る）
git reset --soft HEAD~1
```

**直前のコミットを完全に破棄** (`last-commit-hard`):
```bash
# HEADを1つ前に戻し、変更も破棄
git reset --hard HEAD~1
```

**特定ファイルの変更を破棄** (`file <path>`):
```bash
# ステージングを解除
git reset HEAD <path>

# 変更を破棄
git checkout -- <path>
```

### 5. 結果の報告

- リセット完了を通知
- 現在の`git status`を表示
- 復元方法のヒントを提供（reflogなど）

## 注意事項

- **main/masterブランチでの`last-commit-hard`は追加警告を表示**
- リモートにプッシュ済みのコミットを取り消す場合は警告
- `git reflog`で復元可能なことを案内
- `.gitignore`されていない新規ファイルは`git clean`で削除される可能性があることを警告

## 復元のヒント

誤ってリセットした場合の復元方法:
```bash
# reflogで履歴を確認
git reflog

# 特定のコミットに戻る
git reset --hard <commit-hash>
```
