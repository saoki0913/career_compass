# エラーハンドリング方針

このアプリでは、`ユーザー向けメッセージ` と `開発者向け詳細` を分けて扱います。

## 基本方針

- 画面には `短い説明 + 次にやる行動` だけを出す
- 例外文、スタック、SQL、外部 API の詳細は画面に出さない
- 開発者向け詳細は `バックエンドログ` と `フロントの devtools` で確認する

## API レスポンス

主要な Next API は、失敗時に次の形を返します。

```json
{
  "error": {
    "code": "TASKS_FETCH_FAILED",
    "userMessage": "タスクを読み込めませんでした。",
    "action": "ページを再読み込みして、もう一度お試しください。",
    "retryable": true
  },
  "requestId": "..."
}
```

開発環境では `debug` が追加され、devtools からだけ見えます。

## requestId

- Next API と FastAPI の両方で `X-Request-Id` を付与する
- サーバーログにも同じ ID を残す
- 本番で調査が必要なときは `requestId` からログを引く

## フロントエンド

- `src/lib/api-errors.ts` で API エラーを `AppUiError` に正規化する
- hook や画面は raw な `data.error` を直接 UI に出さない
- 開発環境だけ `logError()` で debug 情報を console に残す

## ユーザー向け表示ルール

表示してよいもの:

- 何ができなかったか
- どうすればよいか
- 再試行できるか

表示しないもの:

- `原因:`
- `解決策:`
- `サーバーログを確認してください`
- backend の例外文
- 外部 API の詳細エラー

## 適用済みの主要導線

- ダッシュボードの未完了タスク
- 企業一覧・企業詳細・企業情報取得
- ドキュメント一覧・詳細・復元・完全削除
- ES 添削
- カレンダー・締切・タスク
- 応募枠・提出物・検索

## 実装時のルール

- Next API では `createApiErrorResponse()` を使う
- フロントの fetch 失敗は `parseApiErrorResponse()` を通す
- 例外を UI にそのまま出さない
