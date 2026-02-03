---
name: update-docs
description: ドキュメントを最新の状態に更新する。コードとの同期、統計更新、リンク検証を実行。targetはファイルパス（docs/PROGRESS.md）またはカテゴリ（progress, features, architecture, setup, all）を指定可能。
language: ja
---

# Update Docs

ドキュメントを最新の実装状態に同期するスキル。

## 引数: $ARGUMENTS

- **ファイルパス**: `/update-docs docs/PROGRESS.md` - 特定ファイルを更新
- **カテゴリ**: `/update-docs features` - カテゴリ内の全ファイルを更新
- **引数なし**: 対話的に対象を選択

### カテゴリ一覧

| カテゴリ | 対象 |
|---------|------|
| `progress` | `docs/PROGRESS.md` |
| `features` | `docs/features/*.md` |
| `architecture` | `docs/architecture/*.md` |
| `setup` | `docs/setup/*.md` |
| `all` | `docs/` 全体 |

## 処理フロー

### 1. 対象ファイルの特定

引数 `$ARGUMENTS` からファイルパスまたはカテゴリを解析する。

- 引数がファイルパス（`.md`で終わる）の場合、そのファイルを対象とする
- 引数がカテゴリ名の場合、対応するファイル群を対象とする
- 引数がない場合、AskUserQuestionで対象を確認する

### 2. 関連コードの読み取り

対象ドキュメントに関連する実装コードを特定し読み取る:

| ドキュメント | 関連コード |
|-------------|-----------|
| `docs/features/ES_REVIEW.md` | `backend/app/routers/es_review.py`, `backend/app/prompts/es_templates.py` |
| `docs/features/MOTIVATION.md` | `backend/app/routers/motivation.py` |
| `docs/features/GAKUCHIKA_DEEP_DIVE.md` | `backend/app/routers/gakuchika.py` |
| `docs/features/COMPANY_RAG.md` | `backend/app/utils/hybrid_search.py`, `backend/app/utils/vector_store.py` |
| `docs/features/COMPANY_INFO_FETCH.md` | `backend/app/routers/company_info.py` |
| `docs/PROGRESS.md` | `docs/SPEC.md`（仕様との照合） |

### 3. 更新内容の確認

以下をチェックし、不一致を報告:

**コード同期**:
- APIエンドポイントの変更
- パラメータ・レスポンス形式の変更
- 新機能の追加・削除

**統計更新**（PROGRESS.mdの場合）:
- 完了/部分実装/未実装のカウント再計算
- 実装完了率の更新
- 最終更新日を現在日付（JST）に更新

**リンク検証**:
- ドキュメント間の相対リンクが有効か確認
- 存在しないファイルへのリンクを検出・報告

### 4. 更新の実行

1. ユーザーに変更内容を提示
2. 承認後にEditツールで更新を実行
3. PROGRESS.mdの「最近の更新履歴」セクションに更新内容を追記

## 注意事項

- 大きな変更がある場合は、変更前に確認を取る
- ドキュメントのフォーマット・スタイルは既存に合わせる
- 日本語で記述する
