# ドメイン運用正本（Web / メール / 解約判断）

[← インデックス](./README.md)

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

1. 前提 CLI / 認証
2. 現在構成の確認
3. Web ドメイン設定
4. メール設定
5. 動作確認
6. お名前.com レンタルサーバー解約判断
7. 最終チェックリスト

DNS レコードの追加・確認は **Cloudflare 公式 API（curl）を第一の手段** とします。Dashboard 操作は fallback として各節末尾に残します。レジストラは お名前.com のままですが、レコード編集の正本は Cloudflare です。

---

## 0. 前提 CLI / 認証

DNS 操作には次のどちらかを使います。**curl + 公式 API を推奨**します。CLI が手元にない環境でも curl は使えるためです。

| 手段 | 用途 | 状態 |
|---|---|---|
| `curl` + Cloudflare API v4 | DNS レコードの作成・一覧・確認（推奨） | 公式・常用 |
| `flarectl` | 同上を short option で実行する CLI | 公式だが maintenance モード |
| Dashboard | GUI 操作（fallback） | 常時利用可 |

> `wrangler` は Workers / Pages 向けの CLI で、汎用的な zone の DNS レコード CRUD は対象外です。DNS は API（curl）または `flarectl` を使います。
> 公式: Cloudflare API でダッシュボードの操作はほぼ自動化できる。参考: https://developers.cloudflare.com/fundamentals/api/

### 0-1. 認証情報

bootstrap 用に `scripts/release/secrets-examples/infra/cloudflare.env.example` で定義済みです。Cloudflare は bootstrap 専用で、`sync-career-compass-secrets.sh` の sync 対象には含めません。

| 変数 | 用途 | 重要度 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | DNS API 認証（Bearer token） | `[必須]` `[共通可]` |
| `CLOUDFLARE_ACCOUNT_ID` | account 単位での zone 絞り込み | `[必須]` `[共通可]` |

実値は `.secrets/infra/cloudflare.env`（project-internal, gitignored）にあります。**実 secret ファイルは Read しません**。下のコマンドはシェルに値を読み込んでから実行します（実トークンは貼らず placeholder のまま管理します）。

```bash
# 実 secret ファイルから環境変数を読み込む（値はターミナルに出さない）
set -a; source .secrets/infra/cloudflare.env; set +a

# 以降のコマンドは $CLOUDFLARE_API_TOKEN / $CLOUDFLARE_ACCOUNT_ID を参照する
```

### 0-2. API トークンの権限

DNS レコードを作成・編集するトークンは、最小権限で次のスコープに絞ります。

| Permission | 値 |
|---|---|
| Zone - DNS | `Edit`（create / read / update / delete / list を含む） |
| Zone - Zone | `Read`（zone 一覧から zone_id を引くため） |
| Zone Resources | `shupass.jp` のみに限定 |

> 公式: DNS 編集には `Zone - DNS - Edit` テンプレートを使い、対象 zone を限定する。参考: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
> 公式: 権限カテゴリ一覧。参考: https://developers.cloudflare.com/fundamentals/api/reference/permissions/

### 0-3. トークン検証

```bash
curl https://api.cloudflare.com/client/v4/user/tokens/verify \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
# => "status": "active" を確認する
```

> 公式: トークン検証は `/user/tokens/verify`。参考: https://developers.cloudflare.com/api/resources/user/subresources/tokens/methods/verify/

### 0-4. zone_id の取得

DNS レコード操作はすべて `zone_id` を要求します。`shupass.jp` の zone_id をまず引き、以降のコマンドで使い回します。

```bash
# shupass.jp の zone_id を取得（jq があれば .result[0].id を抽出）
curl -s "https://api.cloudflare.com/client/v4/zones?name=shupass.jp&account.id=$CLOUDFLARE_ACCOUNT_ID" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq -r '.result[0].id'

# 取得した値をシェル変数に入れて以降で使う
export ZONE_ID="<取得した zone_id>"
```

> 公式: zone 一覧は `GET /zones`、`name` で絞り込める。参考: https://developers.cloudflare.com/api/resources/zones/methods/list/

### 0-5. flarectl を使う場合（CLI fallback）

`flarectl` は `--zone="shupass.jp"` のように zone 名を直接指定できます（内部で zone_id を解決）。認証は同じトークンを `CF_API_TOKEN` で渡します。

```bash
# インストール（Go 環境がある場合）
go install github.com/cloudflare/cloudflare-go/cmd/flarectl@latest

# 認証（API トークンを渡す）
export CF_API_TOKEN="$CLOUDFLARE_API_TOKEN"

# 例: レコード一覧
flarectl dns list --zone="shupass.jp"
```

> 公式（pkg）: `flarectl dns` のサブコマンドと option。参考: https://pkg.go.dev/github.com/cloudflare/cloudflare-go/cmd/flarectl
> flarectl は maintenance モードのため、新規自動化は curl + API を優先します。

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

#### CLI / API でレコードを追加する（推奨）

事前に Section 0 で `$ZONE_ID` を設定しておきます。apex の `A` レコードと `www` の `CNAME` を作成します。`proxied` は Vercel 接続の都合に合わせます（Vercel の指示で proxy なしにする場合は `false`）。`ttl: 1` は「automatic」を意味します。

```bash
# apex (@) を Vercel へ向ける A レコード
curl "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  --request POST \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
        "type": "A",
        "name": "shupass.jp",
        "content": "76.76.21.21",
        "ttl": 1,
        "proxied": false,
        "comment": "apex -> Vercel"
      }'

# www を Vercel へ向ける CNAME レコード
curl "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  --request POST \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
        "type": "CNAME",
        "name": "www.shupass.jp",
        "content": "cname.vercel-dns.com",
        "ttl": 1,
        "proxied": false,
        "comment": "www -> Vercel"
      }'
```

`flarectl` を使う場合（zone 名を直接指定）:

```bash
flarectl dns create --zone="shupass.jp" --name="@" --type="A" --content="76.76.21.21"
flarectl dns create --zone="shupass.jp" --name="www" --type="CNAME" --content="cname.vercel-dns.com"
```

> 公式: DNS レコード作成は `POST /zones/{zone_id}/dns_records`、`ttl: 1` は automatic。参考: https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/create/
> 公式: API での作成手順全体。参考: https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/

#### 追加後の確認

`type` で種別を絞り、対象名は `jq` で照合します（一覧 API は `name` フィルタも持ちますが、確実に効く `type` 絞り込み + クライアント側照合を採用します）。

```bash
# A レコードを一覧して apex を照合する
curl -s "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=A" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  | jq '.result[] | select(.name=="shupass.jp") | {type,name,content,proxied}'

# CNAME レコードを一覧して www を照合する
curl -s "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=CNAME" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  | jq '.result[] | select(.name=="www.shupass.jp") | {type,name,content,proxied}'
```

> 公式: レコード一覧は `GET /zones/{zone_id}/dns_records`、`type` で絞り込める。`name` フィルタは `contains`/`endswith`/`exact`/`startswith` をサポート。参考: https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/list/

#### Dashboard で追加する（fallback）

API が使えない場合のみ、Cloudflare Dashboard → 対象 zone (`shupass.jp`) → `DNS` → `Records` → `Add record` で上表のとおり登録します。編集の正本は Cloudflare であり、お名前.com DNS 画面は使いません。

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

#### CLI / API でレコードを追加する（推奨）

事前に Section 0 で `$ZONE_ID` を設定しておきます。MX は `priority` を別フィールドで指定します（`content` には priority を含めません）。SPF / DKIM / DMARC は `TXT` レコードとして作成します。DKIM の `content` は Google Admin Console で生成した公開鍵に置き換えます。

```bash
# MX レコード（priority は専用フィールド）
curl "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  --request POST \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
        "type": "MX",
        "name": "shupass.jp",
        "content": "smtp.google.com",
        "priority": 1,
        "ttl": 1,
        "comment": "Google Workspace MX"
      }'

# SPF（TXT @）
curl "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  --request POST \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
        "type": "TXT",
        "name": "shupass.jp",
        "content": "v=spf1 include:_spf.google.com ~all",
        "ttl": 1,
        "comment": "Google Workspace SPF"
      }'

# DKIM（TXT google._domainkey）。content は Admin Console で生成した公開鍵に置換する
curl "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  --request POST \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
        "type": "TXT",
        "name": "google._domainkey.shupass.jp",
        "content": "<Google が発行した DKIM 公開鍵>",
        "ttl": 1,
        "comment": "Google Workspace DKIM"
      }'

# DMARC（TXT _dmarc）監視モード
curl "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  --request POST \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
        "type": "TXT",
        "name": "_dmarc.shupass.jp",
        "content": "v=DMARC1; p=none; rua=mailto:support@shupass.jp",
        "ttl": 1,
        "comment": "DMARC monitoring mode"
      }'
```

`flarectl` を使う場合（MX は `--priority`、TXT の `--content` は引用符でそのまま渡す）:

```bash
flarectl dns create --zone="shupass.jp" --name="@" --type="MX" --content="smtp.google.com" --priority=1
flarectl dns create --zone="shupass.jp" --name="@" --type="TXT" --content="v=spf1 include:_spf.google.com ~all"
```

> 公式: MX は `priority` フィールドが必須。参考: https://developers.cloudflare.com/dns/manage-dns-records/how-to/email-records/
> 公式: 作成エンドポイントと TXT/MX の body 定義。参考: https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/create/

#### 追加後の確認

```bash
# MX
curl -s "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=MX" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq '.result[] | {name,content,priority}'

# SPF / DKIM / DMARC（TXT を一覧して内容を照合）
curl -s "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=TXT" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq '.result[] | {name,content}'
```

#### Dashboard で追加する（fallback）

API が使えない場合のみ、Cloudflare Dashboard → 対象 zone (`shupass.jp`) → `DNS` → `Records` から上表のとおり登録します。MX は `Mail server` と `Priority`、TXT は `Content` をそのまま入力します。編集の正本は Cloudflare です。

### 3-3. 削除候補

次は Google Workspace 運用と競合しやすいため、利用中でないことを確認したうえで削除候補にします。

- `mail` サブドメインの `A` レコード
- `include:_spf.onamae.ne.jp` を含む SPF
- 旧メールサービスの `MX`
- 旧メールサービス由来の `TXT`

#### CLI / API で削除する（推奨）

削除は record_id を指定する `DELETE` です。まず一覧で対象の `id` を特定してから削除します。**消す前に内容を必ず確認**します（破壊操作のため）。

```bash
# 削除候補を一覧して id と内容を確認する（例: mail サブドメインの A）
curl -s "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=A" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  | jq '.result[] | select(.name=="mail.shupass.jp") | {id,name,content}'

# 内容を確認したうえで record_id を指定して削除する
curl "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$DNS_RECORD_ID" \
  -X DELETE \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

> 公式: 削除は `DELETE /zones/{zone_id}/dns_records/{dns_record_id}`。参考: https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/delete/

Dashboard で行う場合 (fallback): 対象 zone → `DNS` → `Records` → 該当行の `Edit` → `Delete`。いずれの手段でも、用途不明レコードは即削除せず現行サービスと照合してから整理します。

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

`dig` は実際に解決される値（伝播後の状態）を確認します。

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

設定の正本（Cloudflare 上のレコード）は API でも確認できます。`dig` が期待値を返さないときに、Cloudflare 側の登録内容と突き合わせます（事前に Section 0 で `$ZONE_ID` を設定）。

```bash
# Cloudflare 上の MX / TXT を一覧して登録内容を照合する
curl -s "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=MX" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq '.result[] | {name,content,priority}'

curl -s "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=TXT" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq '.result[] | {name,content}'
```

> 公式: レコード一覧は `GET /zones/{zone_id}/dns_records`。参考: https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/list/

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
