# 環境変数リファレンス（移動済み）

このファイルは既存リンク互換のための入口です。**内容はありません**。

環境変数の唯一の正本（SSOT）は次に移動しました:

→ [`docs/ops/ENVIRONMENT_VARIABLES.md`](../../ops/ENVIRONMENT_VARIABLES.md)

- 全変数リファレンス・環境別比較・設定場所・生成/取得方法・新規追加の判断フロー: 上記 SSOT を参照。
- 確認コマンド（`sync-career-compass-secrets.sh --check` 等）: SSOT の **§6.7 Verification** を参照。

secret の実値は直接読まず、`zsh scripts/release/sync-career-compass-secrets.sh --check` で key set のみ確認してください。
