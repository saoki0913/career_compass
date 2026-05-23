# Brandfetch の設定

[← インデックス](./README.md)

Brandfetch は、企業ロゴの **fallback プロバイダ**です。主プロバイダは Logo.dev で、Logo.dev でロゴが取得できなかったときに Brandfetch を補助的に使います。Vercel (フロントエンド) 側のみで使用し、バックエンド (Railway) には設定不要です。

ロゴ機能全体の設計・主プロバイダの設定は [`LOGO_DEV.md`](./LOGO_DEV.md) を参照してください。本書は Brandfetch の `BRANDFETCH_CLIENT_ID` 取得と反映だけを扱います。

---

## 1. 概要

| 項目 | 内容 |
|---|---|
| 用途 | 企業ロゴの fallback 取得（主プロバイダ Logo.dev の代替） |
| 使用面 | Next.js (Vercel)。サーバー側の `/api/company-logos` ルート経由 |
| 重要度 | **任意**（設定しなくてもアプリは動作する） |
| 環境区分 | **共通可**（local / staging / production で同じ値を使ってよい） |

設定するキーは 1 つだけです。

| 環境変数 | 役割 |
|---|---|
| `BRANDFETCH_CLIENT_ID` | Brandfetch の Logo Link / Brand Search API を呼ぶときのクライアント識別子 |

### 未設定時の挙動（fallback 動作）

`BRANDFETCH_CLIENT_ID` が未設定の場合、`/api/company-logos` の Brandfetch 経路（`provider=brandfetch` / `provider=brandfetch-name`）は **何も返さず**、ロゴ解決は Logo.dev や公式アセット、最終的には頭文字 avatar にフォールバックします。アプリのビルドや起動はブロックされません。

実装では `serverEnv.BRANDFETCH_CLIENT_ID` を読み、空なら Brandfetch の upstream URL を組み立てずに空配列を返します（`src/app/api/company-logos/route.ts` の `getBrandfetchClientId()`）。

> **注意**: 旧 `NEXT_PUBLIC_BRANDFETCH_CLIENT_ID` は退役済みで、コードからも読み取りません。新規設定は server-only の `BRANDFETCH_CLIENT_ID` に統一します。

---

## 2. 前提 CLI

Brandfetch には公式 CLI がありません。アカウント作成と Client ID の取得は **Developer Portal（Web ダッシュボード）でのみ**行います（後述）。Brandfetch 公式ドキュメントでも、Client ID は Developer Portal で発行・確認する手順のみが案内されています。

env への反映に使う CLI は Vercel CLI です。

```bash
# Vercel CLI（未インストールの場合）
npm i -g vercel

# ログインとプロジェクト紐付け
vercel login
vercel link
```

> 公式: Brandfetch の認証は Client ID をリクエストに付与する方式。CLI ではなく Developer Portal で発行する。参考: https://docs.brandfetch.com/docs/apis

---

## 3. Client ID の取得（Developer Portal）

Brandfetch は API キー方式ではなく **Client ID** 方式です。各リクエストにクエリパラメータ `c=<BRANDFETCH_CLIENT_ID>` を付けて送ります。Client ID は無料で取得できます。

### 手順（Web ダッシュボードのみ）

1. https://developers.brandfetch.com/register にアクセスし、無料アカウントを作成する。
2. 登録後、ダッシュボード https://developers.brandfetch.com/dashboard を開く。
3. ダッシュボードに表示される **Client ID** を控える。これが `BRANDFETCH_CLIENT_ID` の値になる。

> 公式: 無料アカウントを Developer Portal で作成すると、ダッシュボードで Client ID を確認できる。参考: https://developers.brandfetch.com/register
> 公式: ダッシュボードで credentials（Client ID）を管理する。参考: https://developers.brandfetch.com/dashboard

CLI からの発行コマンドは提供されていないため、この手順は Dashboard 操作のみです。Client ID は秘密鍵ではなく公開識別子ですが、本書には実値を記載しません（placeholder のみ）。

### 利用する API（参考）

就活Pass が Brandfetch に投げるリクエストは 2 種類で、いずれも Client ID をクエリ `c=` で付与します。

| 経路 | エンドポイント | 用途 |
|---|---|---|
| Logo Link (CDN) | `https://cdn.brandfetch.io/domain/<domain>/.../fallback/404?c=<id>` | ドメインからロゴ画像を取得 |
| Brand Search API | `https://api.brandfetch.io/v2/search/<name>?c=<id>` | 企業名からドメインを解決し、その後ロゴを取得 |

> 公式: Brand Search API は `GET /v2/search/{name}?c={clientId}`、ベース URL は `https://api.brandfetch.io`。参考: https://docs.brandfetch.com/reference/brand-search-api

---

## 4. キーの制限・セキュリティ

| 項目 | 方針 |
|---|---|
| 配置 | **server-only**。`src/env/server.ts` の `BRANDFETCH_CLIENT_ID`（optional）で型安全に読む。`NEXT_PUBLIC_` を付けない |
| 露出 | リクエストはサーバー側の `/api/company-logos` から発行し、クライアントへ Client ID を渡さない |
| 種別 | Client ID は公開識別子（秘密鍵ではない）。それでも repo には placeholder のみを置き、実値は `.env.local` と `.secrets/` のみに保持する |

### 利用規約上の注意（ロゴ利用条件）

Brandfetch の Logo API には利用ガイドラインがあります。設定・運用時に把握しておく主な点は次のとおりです。

- ロゴは**無料**で利用でき、Brandfetch への帰属表示（attribution）は不要。
- 想定される使い方は、ロゴ Link を `<img>` に直接埋め込む形。Referrer ヘッダーが必要で、`Referrer-Policy` は `origin` / `origin-when-cross-origin` / `strict-origin` / `strict-origin-when-cross-origin` / `unsafe-url` のいずれかにする。
- ロゴ画像への**プログラム的アクセスやスクレイピングは禁止**で、レート制限やブロックの対象になりうる。**キャッシュも原則不可**で、必要なら Brandfetch へ問い合わせる。
- Logo API を唯一の価値提供とするアプリは不可。既存機能の補助として使う。

> 就活Pass では Brandfetch を「Logo.dev の fallback」という補助用途で使い、ロゴ表示の補完に限定します。利用規約は変更されることがあるため、運用前に最新のガイドラインを確認してください。
> 公式: Logo API Usage Guidelines。参考: https://docs.brandfetch.com/logo-api/guidelines

---

## 5. 環境変数マッピング

| 変数名 | 設定先 | 重要度 | 環境区分 |
|---|---|---|---|
| `BRANDFETCH_CLIENT_ID` | `.env.local`（ローカル） / `nextjs.env`（Vercel: local / staging / production） | `[任意]` | `[共通可]` |

変数の意味の SSOT は [`operations/platform/ENVIRONMENT_VARIABLES.md`](../operations/platform/ENVIRONMENT_VARIABLES.md) です。本書では取得・反映手順のみを扱い、変数カタログは複製しません。

### ローカル (.env.local)

```env
BRANDFETCH_CLIENT_ID=<Developer Portal で取得した Client ID>
```

### Vercel への反映（CLI）

staging と production は別の Vercel project（`career-compass-staging` / `career-compass`）で、どちらも **Production env scope** を使う（`preview` scope は使わない。詳細は [`VERCEL.md`](./VERCEL.md) と [`operations/platform/ENVIRONMENT_VARIABLES.md`](../operations/platform/ENVIRONMENT_VARIABLES.md) §3）。直接 `vercel env add` で入れる場合は、対象 project に `vercel link` した状態で Production scope に追加します（プロンプトで値を入力）。

```bash
vercel env add BRANDFETCH_CLIENT_ID production
```

> いまの標準運用では、Vercel の env は `scripts/release/sync-career-compass-secrets.sh` で同期し、値の正本は repo local の `.secrets/` です（[`VERCEL.md`](./VERCEL.md) 参照）。チームで運用する場合は、`.secrets/<env>/nextjs.env` の `BRANDFETCH_CLIENT_ID` を埋めてから次を実行します。

```bash
# production（career-compass project）
zsh scripts/release/sync-career-compass-secrets.sh --check  --target vercel-production --vercel-env production
zsh scripts/release/sync-career-compass-secrets.sh --apply  --target vercel-production --vercel-env production

# staging（career-compass-staging project）
zsh scripts/release/sync-career-compass-secrets.sh --check  --target vercel-staging --vercel-env production
zsh scripts/release/sync-career-compass-secrets.sh --apply  --target vercel-staging --vercel-env production
```

---

## 6. ローカル値の流用可否

`BRANDFETCH_CLIENT_ID` は `[共通可]` の外部 API 識別子です。**`.env.local` の値をそのまま staging / production に貼ってよい**。Client ID は環境分離の境界ではなく、環境ごとに別個の発行は不要です（[`operations/platform/ENVIRONMENT_VARIABLES.md`](../operations/platform/ENVIRONMENT_VARIABLES.md) の「同値でもよい」区分）。

> 必要に応じて環境別に上書きしてもかまいませんが、必須ではありません。Logo.dev の `LOGO_DEV_TOKEN` / `LOGO_DEV_SECRET_KEY` と同じ扱いです。

---

## 7. コスト目安

Brandfetch の Logo API と Brand Search API は**無料**で利用できます（目安: 月 500,000 リクエストまでを「fair use」として無料・帰属表示不要）。上限は固定値というより公正利用ベースのため、明確な閾値ではありません。

| プラン | 目安料金 | 備考 |
|---|---|---|
| Logo API / Brand Search API | **無料** | 目安: 月 50 万リクエストまでの fair use。帰属表示不要 |
| Brand API（リッチな brand data） | 目安 $99/月 | 就活Pass の fallback 用途では不要。超過は従量課金になりうる |

> 料金は変動するため、運用前に公式の最新情報を確認してください（金額はあくまで目安）。就活Pass の fallback 用途では無料の Logo API / Brand Search API の範囲で足ります。
> 公式: Pricing。参考: https://brandfetch.com/developers/pricing

---

## 8. 動作確認

設定後、企業ロゴが Brandfetch 経由で解決されるかを確認します。

```bash
# ローカル開発サーバー起動後、Brandfetch 経路を直接叩く（domain 指定）
curl -i "http://localhost:3000/api/company-logos?provider=brandfetch&domain=mitsui.com"

# 企業名からの解決（Brand Search → ロゴ取得）
curl -i "http://localhost:3000/api/company-logos?provider=brandfetch-name&name=日本生命"
```

- ロゴ画像（200）が返れば成功。
- `BRANDFETCH_CLIENT_ID` 未設定時や upstream miss 時は、ロゴが返らずフォールバックされます（頭文字 avatar など）。これは想定どおりの挙動です。
- Brandfetch が落ちないことより先に、まず Logo.dev (`LOGO_DEV_TOKEN`) が設定されているかを確認してください。Brandfetch はあくまで補助です（[`LOGO_DEV.md`](./LOGO_DEV.md)）。
