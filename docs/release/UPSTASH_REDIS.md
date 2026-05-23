# Upstash Redis の本番設定

[← インデックス](./README.md)

---

Vercel のサーバーレス環境では分散 rate limit と日次 LLM token 上限のために Upstash Redis を使用します。
local/dev では未設定時に in-memory fallback で継続できますが、production / staging では日次 token 上限をインスタンス間で共有するため Redis 設定が必要です。
Upstash Free で 1 DB しか使えない場合は、同じ DB を使っても `UPSTASH_REDIS_NAMESPACE` で production / staging / local の key を必ず分離します。

## アカウント作成 & データベース作成

1. https://console.upstash.com/ にアクセス（GitHub 連携でサインアップ可能）
2. **Create Database** をクリック

| 設定項目 | 推奨値 | 説明 |
|---|---|---|
| Name | `career-compass-ratelimit` | 識別名（任意） |
| Type | **Regional** | 単一リージョン（グローバル不要） |
| Region | `ap-northeast-1` (Tokyo) | レイテンシ最小化 |
| TLS | Enabled | デフォルトのまま |
| Eviction | **Enabled** | メモリ上限時に古いキーを自動削除 |

## REST API 認証情報の取得

データベース作成後、**REST API** セクションに表示される:

| キー | 環境変数名 | 設定先 |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | `UPSTASH_REDIS_REST_URL` | Vercel |
| `UPSTASH_REDIS_REST_TOKEN` | `UPSTASH_REDIS_REST_TOKEN` | Vercel |
| `UPSTASH_REDIS_NAMESPACE` | `UPSTASH_REDIS_NAMESPACE` | Vercel (`production` / `staging` / `local`) |

## 料金

| プラン | 制限 | 備考 |
|---|---|---|
| **Free** | 10,000 コマンド/日, 256MB | 就活アプリの規模では十分 |
| **Pay As You Go** | $0.2/100K コマンド | 超過時の自動課金 |
