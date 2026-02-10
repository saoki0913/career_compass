# Step 0: ドメイン設定（お名前.com → Vercel）

[← 目次に戻る](./PRODUCTION.md)

---

## 0-1. お名前.com でのドメイン取得確認

ドメイン `shupass.jp` はお名前.com で取得済み。

お名前.com Navi → **ドメイン一覧** → `shupass.jp` が「利用中」であることを確認。

## 0-2. Vercel にカスタムドメインを追加

1. Vercel Dashboard → 対象プロジェクト → Settings → **Domains**
2. `shupass.jp` を入力して **Add**
3. Vercel が推奨する DNS 設定が表示される

Vercel は以下の 2 パターンを提示します:

**パターン A: Apex ドメイン（shupass.jp）に A レコード**

| レコード種別 | ホスト名 | 値 |
|---|---|---|
| A | `@` (空欄) | `76.76.21.21` |

**パターン B: www サブドメインに CNAME**

| レコード種別 | ホスト名 | 値 |
|---|---|---|
| CNAME | `www` | `cname.vercel-dns.com` |

> **推奨**: 両方設定する。`shupass.jp` (A レコード) + `www.shupass.jp` (CNAME)。
> Vercel 側で **どちらをメインにするか** を選べます（片方をもう片方へリダイレクト可能）。
>
> - 推奨（本書の前提）: `shupass.jp` → `www.shupass.jp` にリダイレクト（メイン: `www.shupass.jp`）
> - 逆パターン: `www.shupass.jp` → `shupass.jp` にリダイレクト（メイン: `shupass.jp`）

## 0-3. お名前.com で DNS レコードを設定

お名前.com Navi → **ドメイン設定** → **DNS設定/転送設定** → `shupass.jp` → **DNSレコード設定を利用する**

以下のレコードを追加:

| ホスト名 | TYPE | TTL | VALUE | 優先 |
|---|---|---|---|---|
| (空欄) | A | 3600 | `76.76.21.21` | — |
| www | CNAME | 3600 | `cname.vercel-dns.com` | — |

> **注意**: お名前.com のデフォルト DNS サーバー（お名前.com のネームサーバー）を使用している前提です。
> 既にネームサーバーを変更している場合はそちらの管理画面で設定してください。

## 0-4. DNS 反映確認

DNS レコードの反映には数分〜最大 48 時間かかります（通常は 10 分〜1 時間）。

```bash
# A レコード確認
dig shupass.jp A +short
# => 76.76.21.21

# CNAME 確認
dig www.shupass.jp CNAME +short
# => cname.vercel-dns.com.

# HTTPS でアクセス確認
curl -I https://www.shupass.jp
# => HTTP/2 200 (Vercel が応答)

curl -I https://shupass.jp
# => HTTP/2 307 (www にリダイレクト)
```

## 0-5. SSL 証明書の確認

Vercel が DNS 設定を検証し、自動的に SSL 証明書（Let's Encrypt）を発行します。

Vercel Dashboard → Settings → **Domains** で以下を確認:
- 推奨（本書の前提: メイン = `www.shupass.jp`）
  - `www.shupass.jp` → **Valid Configuration** (緑チェック)
  - `shupass.jp` → **Redirects to www.shupass.jp** (緑チェック)

- 逆パターン（メイン = `shupass.jp`）
  - `shupass.jp` → **Valid Configuration** (緑チェック)
  - `www.shupass.jp` → **Redirects to shupass.jp** (緑チェック)

> SSL 証明書の発行には DNS 反映後、数分かかります。
