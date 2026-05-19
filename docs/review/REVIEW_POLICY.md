# レビュー記録ポリシー

## 目的

`docs/review/` は、就活Pass の品質ゲート系スキル・サブエージェントが生成したレビュー記録のアーカイブである。`quality-review` / `maintainability-review` / `security-auditor` / `code-reviewer` / `architect` 等が、監査・レビュー・品質比較の結果をここに残す。

レビュー記録は「ある時点での観測スナップショット」であり、システムの正本ではない。判断経緯を後から振り返る参考資料としては有用だが、**正しい動作の一次情報は常にコード本体であり、レビュー記録は作成時点のスナップショットなので現状と乖離しうる。** 実装判断に使う場合は必ず最新コードで裏取りすること。

## サブディレクトリの用途

| ディレクトリ | 用途 | 主な書き込み元 |
|---|---|---|
| `architecture/` | 設計レビュー（構造・責務分離・境界・インターフェース選択） | `architect`, `improve-architecture`, `quality-review` |
| `maintainability/` | 保守性レビュー（変更容易性・可読性・状態主体・dead code） | `maintainability-review`, `code-reviewer` |
| `security/` | セキュリティ監査（認証・認可・OWASP・secrets・RLS・Stripe） | `security-auditor`, `security-review` |
| `rag-architecture/` | RAG / 検索基盤の設計レビュー（embedding・chunking・retrieval 構成） | `rag-engineer`, `architect` |
| `harness/` | ハーネス検証（hooks・gate・委譲フロー・自動化の妥当性検証） | ハーネス改善タスク |
| `feature/` | 機能別の品質比較・モデル比較（ES 添削などの出力品質評価） | `quality-review`, `prompt-engineer` |
| `company-info-search/` | 企業情報検索の改善実験記録（精度・網羅性の反復改善ログ） | `improve-search`, `search-quality-engineer` |

## 命名規約

- ファイル名は `<topic>-YYYY-MM-DD.md` 形式とする。
  - 例: `es-review-model-comparison-2026-05-07.md`, `auth-boundary-2026-05-19.md`
- `<topic>` は対象を表す英小文字 + ハイフン区切り。日付は作成日（JST 基準）。
- 同日に複数記録する場合は `<topic>-YYYY-MM-DD-2.md` のように連番を付ける。

## retention（保管期間）

- 作成から 3 ヶ月を超えた記録は `docs/review/archived/<YYYY-MM>/` 配下へ移動する（`<YYYY-MM>` は元の作成年月）。
- アーカイブ時は `git mv` を使い、参照元（`docs/INDEX.md` 等）のリンクがあれば更新する。
- 古い記録は削除せずアーカイブで残す。判断経緯の追跡に使う可能性があるため。

## 注記

- レビュー記録は願望ベースの TODO や改善メモを溜める場所ではない。実装タスクの状態管理は `docs/plan/plan-tasks.json`（SSOT）で行う。
- 各空サブディレクトリには `.gitkeep` を置く（git は空ディレクトリを追跡しないため）。スキルが書き込む契約上のディレクトリなので `.gitkeep` は削除しない。
