# ドメイン運用正本（Web / メール / 解約判断）

[← 本番リリース手順に戻る](./PRODUCTION.md)

---

## この文書の目的

`shupass.jp` のドメイン運用を 1 本で完結させるための正本文書です。対象は Web ドメイン接続、Google Workspace メール運用、お名前.com レンタルサーバーの解約判断です。

この文書は初期セットアップ手順ではなく、現在の `shupass.jp` を安全に完成状態へ持っていくための運用正本です。

---

## 前提と現在の構成

- レジストラは お名前.com
- authoritative DNS は Cloudflare
- Web は Vercel
- メールは Google Workspace
- 本体アプリは Vercel / Railway / Supabase で動作し、お名前.com レンタルサーバーには依存しない

現在の運用上の主な役割は次のとおりです。

| 項目 | 現在の正 |
|---|---|
| レジストラ | お名前.com |
| DNS の編集先 | Cloudflare |
| 本番 Web | `www.shupass.jp` |
| apex | `shupass.jp` → `www.shupass.jp` へリダイレクト |
| staging frontend | `stg.shupass.jp` |
| staging backend | `stg-api.shupass.jp` |
| 実受信箱 | `admin@shupass.jp` |
| 公開窓口 | `support@shupass.jp` |

実際に見る順番は次で固定します。

1. 現在構成の確認
2. Web ドメイン設定
3. メール設定
4. 動作確認
5. お名前.com レンタルサーバー解約判断
6. 最終チェックリスト

---

## 1. 現在構成の確認

まず、現在の前提が崩れていないことを確認します。

- Vercel で `www.shupass.jp` が本番ドメインになっている
- `shupass.jp` は `www.shupass.jp` へリダイレクトする
- `stg.shupass.jp` は staging frontend 用
- `stg-api.shupass.jp` は staging backend 用
- Google Workspace で `admin@shupass.jp` が受信できる
- `support@shupass.jp` は `admin@shupass.jp` の alias として運用する
- Cloudflare が authoritative DNS であり、お名前.com DNS 画面は正本ではない

確認コマンド:

```bash
dig shupass.jp ns +short
dig shupass.jp a +short
dig www.shupass.jp cname +short
dig stg.shupass.jp +short
dig stg-api.shupass.jp +short
```

期待値:

- NS は Cloudflare の nameserver
- `shupass.jp` は `76.76.21.21`
- `www.shupass.jp` は `cname.vercel-dns.com.` 系
- `stg.shupass.jp` と `stg-api.shupass.jp` は現行 staging の向き先を返す

---

## 2. Web ドメイン設定

### 2-1. Cloudflare DNS の推奨状態

Web 用の基本レコードは次です。

| Type | Name | Content | 備考 |
|---|---|---|---|
| `A` | `@` | `76.76.21.21` | apex を Vercel へ向ける |
| `CNAME` | `www` | `cname.vercel-dns.com` | `www` を Vercel へ向ける |

staging は現行前提を維持します。

- `stg.shupass.jp`: staging frontend 用の DNS レコードを維持する
- `stg-api.shupass.jp`: staging backend 用の DNS レコードを維持する

用途不明の古い Web 用レコードは即削除せず、現行サービスと照合してから整理します。

### 2-2. Vercel 側で確認すること

Vercel Dashboard → 対象プロジェクト → `Settings` → `Domains`

確認ポイント:

- `www.shupass.jp` が `Valid Configuration`
- `shupass.jp` が `Redirects to www.shupass.jp`
- SSL Certificate が有効
- 本番ブランチに production domain が紐づいている

必要なら `stg.shupass.jp` が staging 用 project で有効になっていることも確認します。

### 2-3. Web 動作確認

```bash
dig shupass.jp a +short
# => 76.76.21.21

dig www.shupass.jp cname +short
# => cname.vercel-dns.com.

curl -I https://www.shupass.jp
# => HTTP/2 200

curl -I https://shupass.jp
# => HTTP/2 307 または 308 で www にリダイレクト
```

---

## 3. メール設定

### 3-1. Google Workspace の運用方針

- `admin@shupass.jp` を実受信箱にする
- `support@shupass.jp` は `admin@shupass.jp` の alias にする
- 公開窓口は `support@shupass.jp` に統一する
- Gmail の `Send mail as` で `support@shupass.jp` を送信元として使う

### 3-2. Cloudflare DNS の推奨状態

メール用の基本レコードは次です。

| Type | Name | Content | 備考 |
|---|---|---|---|
| `MX` | `@` | `smtp.google.com` | Priority `1` |
| `TXT` | `@` | `v=spf1 include:_spf.google.com ~all` | Google Workspace 用 SPF |
| `TXT` | `google._domainkey` | Google が発行した DKIM 公開鍵 | Admin Console で生成 |
| `TXT` | `_dmarc` | `v=DMARC1; p=none; rua=mailto:support@shupass.jp` | 監視モード |

この編集先は Cloudflare です。お名前.com DNS 画面は正本ではありません。

### 3-3. 削除候補

次は Google Workspace 運用と競合しやすいため、利用中でないことを確認したうえで削除候補にします。

- `mail` サブドメインの `A` レコード
- `include:_spf.onamae.ne.jp` を含む SPF
- 旧メールサービスの `MX`
- 旧メールサービス由来の `TXT`

### 3-4. Google Workspace 側の設定

Google Admin Console で次を確認します。

1. `shupass.jp` が確認済みドメインになっている
2. `admin@shupass.jp` がアクティブで Gmail にログインできる
3. `admin@shupass.jp` の追加メールアドレスとして `support@shupass.jp` が登録されている

Gmail 側では次を実施します。

1. `設定` → `アカウントとインポート`
2. `他のメール アドレスを追加`
3. 送信名 `就活Pass`
4. 送信元 `support@shupass.jp`
5. 確認メールを受信して承認

### 3-5. `support@shupass.jp` に届かないときの確認順

1. Gmail 検索で確認する

```text
in:anywhere to:support@shupass.jp newer_than:7d
```

2. Google Admin Console → `レポート` → `メールログ検索` で配送ログを確認する
3. alias 追加直後なら反映待ちを疑う
4. alias を削除して同じ値で再作成する
5. `support@shupass.jp` が別ユーザー、Google グループ、別 alias と競合していないか確認する

---

## 4. 動作確認

### 4-1. DNS 確認コマンド

```bash
dig shupass.jp mx +short
# => 1 smtp.google.com.

dig shupass.jp txt +short
# => "v=spf1 include:_spf.google.com ~all"

dig google._domainkey.shupass.jp txt +short
# => "v=DKIM1; ..."

dig _dmarc.shupass.jp txt +short
# => "v=DMARC1; p=none; rua=mailto:support@shupass.jp"
```

### 4-2. 実送信確認

外部アドレスから次の 2 通を送ります。

1. `admin@shupass.jp`
2. `support@shupass.jp`

期待状態:

- どちらも `admin@shupass.jp` の Gmail で確認できる
- `support@shupass.jp` 宛は alias 経由で配送される
- `support@shupass.jp` 名義で返信できる

### 4-3. Web 確認

- `https://www.shupass.jp` が表示される
- `https://shupass.jp` が `www` にリダイレクトされる
- Vercel の Domains 画面で SSL が有効

---

## 5. お名前.com レンタルサーバー解約判断

### 5-1. まず確認する画面

お名前.com Navi / レンタルサーバー管理画面で、次だけを重点確認します。

- 公開領域
- DB
- メール
- cron / 定期実行
- SSL
- バックアップ
- 請求明細

### 5-2. 解約してよい条件

- [ ] 現行サイトのファイルが公開領域に残っていない
- [ ] WordPress や旧 PHP アプリが残っていない
- [ ] 利用中の DB がない
- [ ] 利用中のメールボックス、転送、自動返信がない
- [ ] 利用中の cron / 定期実行がない
- [ ] サーバー側 SSL に依存していない
- [ ] バックアップ保管先として使っていない
- [ ] 請求明細で解約条件を確認済み
- [ ] Cloudflare / Vercel / Google Workspace 側だけで現行運用が成立している

現在の `shupass.jp` では、メールと旧資産が残っていなければレンタルサーバー請求停止に進める前提です。

### 5-3. 保留すべきサイン

- [ ] 用途不明の公開ファイルがある
- [ ] 実運用メールが残っている
- [ ] DB が残っている
- [ ] cron やバックアップの用途を説明できない
- [ ] DNS に残る古いレコードの用途が不明
- [ ] 関係者確認が取れていない

1 つでも当てはまるなら解約は保留します。

### 5-4. 解約前バックアップ

解約前に最低限バックアップするもの:

- 公開領域のファイル
- DB ダンプ
- メール設定のメモ
- cron / SSL / 転送設定のスクリーンショットまたは記録
- 請求情報と契約情報

### 5-5. 解約フロー

順番は次で固定します。

1. 棚卸し
2. バックアップ
3. DNS 整理
4. 最終確認
5. 契約解約

この順を崩すと、旧資産やメールを落としたまま復旧根拠を失いやすくなります。

---

## 6. 最終チェックリスト

### 6-1. Web

- [ ] `@ -> 76.76.21.21`
- [ ] `www -> cname.vercel-dns.com`
- [ ] Vercel Domains で `www.shupass.jp` が `Valid Configuration`
- [ ] `shupass.jp` が `www.shupass.jp` にリダイレクト
- [ ] SSL が有効

### 6-2. メール

- [ ] `MX @ -> smtp.google.com priority 1`
- [ ] SPF が `include:_spf.google.com`
- [ ] `google._domainkey` に DKIM がある
- [ ] `_dmarc` が `p=none` で設定されている
- [ ] `admin@shupass.jp` が受信できる
- [ ] `support@shupass.jp` が alias として受信できる
- [ ] Gmail `Send mail as` で `support@shupass.jp` から送信できる
- [ ] `mail` A と `include:_spf.onamae.ne.jp` などの旧レコード方針が整理済み

### 6-3. 解約判断

- [ ] お名前.com レンタルサーバーの残存用途を棚卸しした
- [ ] 必要バックアップを取得した
- [ ] 保留サインがない
- [ ] 請求停止条件を確認した
- [ ] 解約手順を `棚卸し -> バックアップ -> DNS 整理 -> 最終確認 -> 契約解約` で進める
