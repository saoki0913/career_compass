# 個人事業主としての開業と特商法・Stripe 運用

就活Pass を個人開発者が日本で有償提供する前提で、個人事業主として開業し、事業用住所・連絡先を用意し、特定商取引法に基づく表記と Stripe の `Commerce Disclosure` を整えるまでの実務手順をまとめたドキュメントです。

本書は 2026-04-03 時点で、国税庁・消費者庁・Stripe・各サービス公式サイト、および公開中の個人開発・個人事業主サービスの特商法ページを確認して整理しています。法令順守の最終責任は運営者本人にあり、公開前には弁護士または行政書士への確認を推奨します。

---

## 1. 結論

自宅住所や私用連絡先を公開面から切り離しつつ、保守的に運用するなら、次の順で進めるのが無難です。

1. 個人事業主として開業する
2. 事業用住所を用意する→〒1600023 東京都新宿区西新宿3丁目3番13号西新宿水間ビル2F
3. 事業用メールを用意する
4. 必要な場合のみ事業用電話を用意する
5. バーチャルオフィスを契約し、所在地を公開できる状態にする
6. 特商法ページに `Harbor Works`・所在地・`support@shupass.jp` を直接記載する
7. Stripe 本番公開準備へ進む

この順を推奨する理由:

- 消費者庁は、個人事業者の氏名・住所・電話番号について、請求があれば遅滞なく開示できる体制があれば広告上の省略を認めています。
- 消費者庁は、一定条件を満たすならバーチャルオフィス等の住所・電話番号も可としています。
- Stripe も日本向けの `Commerce Disclosure` で、個人事業者は requested 時の開示方式を案内しています。
- 屋号だけの表記、私書箱だけの表記、請求時開示の体制未整備は避けるべきです。

### 1-1. 就活Pass で採用する公開方針

就活Pass では、次の方針を正式採用とします。

- 公開主体は `Harbor Works`
- 公開窓口は `support@shupass.jp`
- 所在地は、契約したバーチャルオフィス住所を公開する
- 個人名はユーザー向け公開面に出さず、請求があった場合に開示する
- 電話番号は公開せず、請求があった場合に開示する
- 特商法ページの文言は環境変数ではなくページ本文に直接記載する
- Stripe 本番申請は、少なくともバーチャルオフィス契約と特商法ページ更新が終わってから進める

補足:

- Stripe への本人確認そのものでは本名・自宅住所の提出が必要になる可能性がありますが、これは Stripe に対する非公開提出であり、ユーザー向け公開とは分けて考えます。
- Stripe の条件が曖昧なため、就活Pass では `所在地は公開するが、個人名は請求時開示` という中間案を採用します。
- 差し戻しが出た場合は、まず `電話番号の公開要否` を見直し、それでも不足する場合に限り `運営責任者の表示方法` を再検討します。

---

## 2. 一次情報で押さえるべきルール

### 2-1. 国税庁

- 個人で事業を始めたときは、`個人事業の開業・廃業等届出書` を税務署へ提出します。
- 青色申告を使うなら、`所得税の青色申告承認申請書` が必要です。
- 適格請求書が必要な取引先がある場合は、`適格請求書発行事業者の登録申請` を検討します。

実務上の方針:

- 開業届は早めに出す。案内の読み方で迷っても、開業後 1 か月以内に出しておけば安全側です。
- 青色申告承認申請書は、原則 `3月15日まで`、その年の 1 月 16 日以後に開業した場合は `開業日から 2 か月以内` を目安に処理します。
- 副業で始める場合でも、帳簿・口座・メール・決済を事業用として切り分けた方が後で楽です。

### 2-2. 消費者庁

- 通信販売では、氏名、住所、電話番号、代金、支払時期、引渡時期、返品条件などが表示事項です。
- 個人事業者は、氏名・住所・電話番号を「請求があれば遅滞なく開示」とすることで省略できる場合があります。
- バーチャルオフィス住所・電話番号も、事業者に確実に連絡がつく体制があるなどの条件を満たせば許容されます。
- 申込みの最終確認画面では、金額、課金周期、自動更新、解約条件などを誤認なく表示する必要があります。

### 2-3. Stripe

- Stripe は `Commerce Disclosure` ページを求めており、日本では特商法ページをその役割に使う運用が自然です。
- 個人事業者については、法令上許される範囲で requested 時の開示方式を案内しています。
- チェックアウト、サポート連絡先、返金・キャンセル方針、事業情報はサイト上の記載と整合している必要があります。

---

## 3. 開業までの実行手順

### 3-1. Step 1: 事前に決めること

先に次を決めます。

- 開業日
- 屋号を使うか
- 収益の主な形態
  - サブスクリプション
  - 単発売り切り
  - B2B 請求書払い
- インボイス登録が必要か
- 住所公開対策としてバーチャルオフィスを使うか
- 会計を `freee` に寄せるか `マネーフォワード` に寄せるか

就活Pass の想定では、`サブスクリプション + Stripe 決済 + 個人開発` なので、少なくとも以下を決めてから進めます。

- 屋号: `Harbor Works`
- 事業内容: `ソフトウェア開発・運営、就活支援 Web サービスの提供`
- 事業用メール: `support@shupass.jp`
- 特商法ページ URL: `https://www.shupass.jp/legal`

### 3-2. Step 2: freee開業で開業届と青色申告承認申請書を作る

主軸サービスは `freee開業` を推奨します。

理由:

- 開業届と青色申告承認申請書をまとめて作りやすい
- 開業後に `freee会計` へつなげやすい
- 初回の導線が個人事業主向けに整理されている

進め方:

1. `freee開業` にサインアップする
2. 開業日、氏名、住所、屋号、事業内容を入力する
3. 青色申告を使う前提で、`所得税の青色申告承認申請書` も同時作成する
4. e-Tax または書面提出で提出する
5. 控えを保存する

入力時の注意:

- 住所欄は税務上の正式住所が必要です。ここで自宅住所を使うこと自体は通常あります。
- 税務上の届出住所と、サイトの公開住所は同一である必要はありません。特商法表示は消費者庁ルールで別に整理します。
- 屋号は任意です。屋号を付けても、法的な主体は個人名です。


### 3-3. Step 3: インボイス登録の要否を判断する

個人開発で B2C サブスク中心なら、開始時点で必須とは限りません。次のいずれかに当てはまるときは優先度が上がります。

- 取引先が法人で、適格請求書を求める
- 業務委託や受託も同じ事業で行う
- 将来的に法人顧客向け請求が増える

逆に、Stripe 決済の B2C サブスク中心なら、まず開業と記帳体制を整えてから判断してもよいケースがあります。

---

## 4. 推奨サービスと費用

料金は 2026-03-21 時点で各社の公式ページに掲載されていた税込または表示価格ベースです。キャンペーン、年払い割引、初月無料、オプション料金で実支払額は変わるため、契約前に必ず公式ページで再確認してください。

### 4-1. 開業・会計

| 用途 | 推奨サービス | 2026-03-21 時点の確認内容 | 向いているケース |
|---|---|---:|---|
| 開業届作成 | `freee開業` | 無料で開始可能 | 開業から会計まで一気通貫にしたい |
| 開業届作成 | `マネーフォワード クラウド開業届` | 無料で開始可能 | MF 系の UI に慣れている |
| 確定申告・会計 | `freee会計` | スターター 年払い `980円/月`、月払い `1,780円/月`。スタンダード 年払い `1,980円/月`、月払い `2,980円/月` | 銀行・カード・請求の連携をまとめたい |
| 確定申告・会計 | `マネーフォワード クラウド確定申告` | パーソナルミニ 年払い `900円/月`、月払い `1,280円/月` | MF クラウドを使い続けたい |

### 4-2. 事業用住所

| サービス | 初期費用 | 月額の目安 | 補足 |
|---|---:|---:|---|
| `GMOオフィスサポート` | 0円 | `660円/月`〜 | `転送なしプラン` は住所利用向け。郵便物受取と法人登記は不可 |
| `DMMバーチャルオフィス` | `5,500円` | `660円/月`〜 | `ミニマムプラン` は税関連書類中心。一般郵便物の受取要件は要確認 |
| `NAWABARI` | `5,500円` | `1,100円/月`〜 | `特定商取引利用` を前面に出している。電話系オプションもある |

選定条件:

- 消費者庁 Q18 の趣旨に沿って、運営会社が利用者本人を把握し、実際に連絡が届くこと
- 郵便転送と本人確認があること
- 問い合わせや法令対応で支障がないこと

### 4-3. 事業用メール

| サービス | 目安費用 | 推奨度 | 補足 |
|---|---:|---|---|
| `Google Workspace Business Starter` | 年契約 `800円/ユーザー/月`、月払い `950円/ユーザー/月` | 高 | 独自ドメイン運用、共有運用、管理性が高い |
| ドメイン事業者のメール機能 | サービス次第 | 中 | 最小コストだが、運用・拡張性は弱め |

就活Pass では、`support@shupass.jp` を事業用メールとして固定し、特商法ページ・問い合わせページ・Stripe のサポート連絡先を同じ値に揃えるのがよいです。

Cloudflare DNS と Google Workspace の実設定手順、`support@shupass.jp` を `admin@shupass.jp` に集約する alias 運用、未着時の切り分けは [DOMAIN_OPERATIONS.md](./DOMAIN_OPERATIONS.md) を参照してください。

### 4-4. 事業用電話

電話番号は常に必須とは限りませんが、次のケースでは用意を検討します。

- 特商法ページで requested 時の開示先として電話番号も遅滞なく提示したい
- Stripe やカード明細サポートの信頼性を上げたい
- 高額商材や法人取引で電話窓口を求められる

候補:

| サービス | 目安費用 | 補足 |
|---|---:|---|
| `DMMバーチャルオフィス 固定電話セット` | `2,200円/月`〜 | 住所契約とあわせやすい。通話料は別 |
| `NAWABARI 電話転送（03番号発着信）` | `2,800円/月` | 03 番号系を付けたい場合の候補。月額相当の初期費用あり |

---

### 4-5. 公開事例の傾向

2026-04-03 時点で、個人開発または個人事業主が運営するデジタルサービスの公開ページを 20 件確認したところ、傾向は次の 3 つに分かれました。

1. `氏名は公開し、住所と電話は請求時開示`
2. `氏名は公開し、住所はバーチャルオフィス等で公開`
3. `屋号のみ公開し、住所・電話は請求時開示`

最頻出は `1` です。`3` は少数派ですが存在し、匿名性を優先する個人開発サービスで見られます。

代表例:

| 事例 | 名前の出し方 | 住所・電話 | 補足 |
|---|---|---|---|
| GNU social JP | 実名公開 | 住所・電話は請求時開示 | `contact@gnusocial.jp` を窓口にしている |
| ainew.jp | 個人事業主名を公開 | 住所・電話は請求時開示 | Stripe + 月額サブスク |
| SmartShi | 屋号寄り / 個人名非公開 | 住所・電話は請求時開示 | 月額 SaaS |
| XPost AI Checker | 個人名非公開 | 住所・電話は請求時開示 | AI ツール系 |
| ガクチカバンクAI | 実名公開 | 住所・電話は請求時開示 | AI サブスク |
| calomee | 実名公開 | 住所・電話は請求時開示 | 有料サブスク |
| ScanQR | 実名公開 | 一部公開 + 詳細は請求時開示 | 月額/年額 SaaS |
| 書類ポスト | 実名公開 | 住所・電話を公開 | バーチャルオフィス利用を明示 |

就活Pass では、この分布に加えて、住所公開対策に関する Zenn の実例も参考にしつつ、`Harbor Works を主体表示し、所在地はバーチャルオフィス住所を公開し、個人名と電話番号は請求時開示にする` 方針を採用します。

この方針は `1` と `2` の中間で、Stripe に対して所在地を明示しつつ、ユーザー向けには本名を出さないための折衷案です。

---

## 5. 特商法ページの作り方

### 5-1. 就活Pass の特商法ページ方針

就活Pass には既に特商法ページがありますが、今後は `Harbor Works` を主体とする固定文面をページ本文に直接記載する方針にします。環境変数で販売事業者名・所在地・運営責任者文言を切り替える前提にはしません。

### 5-2. 直接記載する内容

就活Pass の特商法ページには、少なくとも次を直接記載します。

- 販売事業者
- 運営責任者
- 所在地
- 電話番号
- メールアドレス
- 販売 URL
- サービス内容
- 販売価格
- 販売価格以外に必要な費用
- 支払方法
- 支払時期
- 引渡時期
- 返品・キャンセル
- 問い合わせ窓口
- 動作環境

就活Pass では、表示方針を次で固定します。

- `販売事業者`: `Harbor Works`
- `運営責任者`: `請求があった場合、遅滞なく開示いたします。開示をご希望の方は support@shupass.jp までご連絡ください。`
- `所在地`: 契約したバーチャルオフィス住所を公開する
- `電話番号`: `請求があった場合、遅滞なく開示いたします。開示をご希望の方は support@shupass.jp までご連絡ください。`
- `メールアドレス`: `support@shupass.jp`
- `販売 URL`: `https://www.shupass.jp`
- `特商法ページ URL`: `https://www.shupass.jp/legal`

個人事業者の氏名・電話番号については、消費者庁 Q15-Q17 の条件を満たすなら、次のような案内に差し替える運用が可能です。

`請求があった場合、遅滞なく開示いたします。開示をご希望の方は support@shupass.jp までご連絡ください。`

所在地については、就活Pass では請求時開示にせず、Stripe の不確実性を踏まえてバーチャルオフィス住所を公開します。

### 5-3. やってはいけないこと

- 屋号だけで主体を示した気になる
- 私書箱だけを所在地として出す
- 開示請求の窓口を置かずに「必要なら開示」とだけ書く
- 請求が来てもすぐ返せない
- `/pricing`、`/legal`、Stripe Checkout の説明を食い違わせる
- 返金不可なのに、その条件を明確に書かない
- バーチャルオフィス契約前に所在地文言を仮置きしたまま Stripe 本番申請へ進む
- 特商法ページの本番文言を環境変数前提にして、誰が見ても確定値が読めない状態にする

### 5-4. 開示請求が来たときの運用

次のテンプレートを事前に用意しておきます。

1. 受信先: `support@shupass.jp`
2. SLA: 営業日ベースではなく、可能なら当日中に返信
3. 返信内容:
   - 個人名
   - 電話番号
   - 必要に応じて販売条件の再掲
4. 記録:
   - 問い合わせ日時
   - 返信日時
   - 返信内容

---

## 6. Stripe への反映

### 6-1. 先にそろえるもの

- `https://www.shupass.jp/legal`
- `https://www.shupass.jp/terms`
- `https://www.shupass.jp/privacy`
- `support@shupass.jp`

### 6-2. Stripe Dashboard で設定すること

- Business information
- Customer support contact
- Statement descriptor
- Customer portal の `Terms` と `Privacy`
- `Commerce Disclosure` ページ URL

サイト上の表示と Stripe 上の表示で、少なくとも次は一致させます。

- サービス名
- サポートメール
- 販売 URL
- 解約方法
- 返金方針

### 6-3. 改正特商法 12 条の 6（最終確認画面）対応

2022 年施行の改正特商法により、通信販売の最終確認画面では次の項目を明示する必要があります。

- 支払総額
- 支払時期・方法
- 引渡時期（サービス提供開始時期）
- 自動更新契約である旨
- 解約条件と解約方法
- 返金ポリシーの要約

Stripe Checkout は商品名・金額・課金周期までは自動表示しますが、「自動更新である旨」「解約方法」「返金ポリシー」は**自動では表示されず**、マーチャント側で Dashboard と Checkout API の両方に補足する必要があります。就活Pass では次のとおり対応しています。

#### コード側（実装済み）

[src/app/api/stripe/checkout/route.ts](../../src/app/api/stripe/checkout/route.ts) で `stripe.checkout.sessions.create` に次のパラメータを追加済みです。

- `locale: "ja"` — 最終確認画面を日本語で表示
- `subscription_data.description` — サブスクリプションの説明に「自動更新・いつでも解約可能」を明記
- `custom_text.submit.message` — 支払いボタン直上に「本サービスは自動更新のサブスクリプションです。解約はアプリ内の設定画面または Stripe カスタマーポータルからいつでも可能で、次回更新日までは引き続きご利用いただけます。デジタルサービスの性質上、法令上必要な場合を除き返金はいたしません。詳細は特定商取引法に基づく表記 (https://www.shupass.jp/legal) をご確認ください。」を表示
- `custom_text.terms_of_service_acceptance.message` — 利用規約と特商法ページへのリンクと同意文言を表示
- `consent_collection.terms_of_service: "required"` — 利用規約への同意チェックボックスを必須化

また [src/lib/stripe/managed-config.json](../../src/lib/stripe/managed-config.json) の `product.description` にも自動更新・解約・返金方針の文言を追記済み。`scripts/release/` 配下の Stripe sync スクリプトを再実行することで Stripe Dashboard 側の Product description にも反映されます（未反映の場合は Dashboard から手動で更新）。

#### Dashboard 側（手動作業が必要）

コードに先立って、Stripe Dashboard で次の設定を完了させる必要があります。**特に `Terms of service URL` が未設定のまま本番デプロイすると `consent_collection.terms_of_service: "required"` が 400 エラーで Checkout セッション作成に失敗します。**

1. **Settings → Public details** (事業者情報・公開情報)
   - `Business name`: `Harbor Works`（または実名併記後の表記）
   - `Support email`: `support@shupass.jp`
   - `Support URL`: `https://www.shupass.jp/contact`
   - `Website`: `https://www.shupass.jp`
   - `Statement descriptor`: `SHUPASS`
   - `Support address`: `〒160-0023 東京都新宿区西新宿3丁目3番13号西新宿水間ビル2F`（特商法ページと完全一致）
   - `Terms of service URL`: `https://www.shupass.jp/terms`  ← **consent_collection の必須依存**
   - `Privacy policy URL`: `https://www.shupass.jp/privacy`

2. **Settings → Checkout and Payment Links → Checkout settings**
   - `Refund and return policy` を有効化し、返金方針の要約を入力
   - `Legal policies` の `Display agreement to legal terms` を有効化
   - `Contact information` を有効化してサポート連絡先をセッションに表示

3. **Settings → Compliance**
   - `Commerce Disclosure URL`: `https://www.shupass.jp/legal`
   - `Customer notification email`: `support@shupass.jp`

4. **Products → 就活Pass Subscription**
   - `Description` に [managed-config.json](../../src/lib/stripe/managed-config.json) と同じ自動更新・解約・返金方針文言が反映されているかを確認

5. **Customer Portal → Business Information**
   - `Terms of Service`: `https://www.shupass.jp/terms`
   - `Privacy Policy`: `https://www.shupass.jp/privacy`

#### 動作確認

1. Stripe test mode で Checkout セッションを作成し、最終確認画面に次がすべて表示されることを確認:
   - `locale: "ja"` により日本語表示
   - 支払いボタン直上の `custom_text.submit.message`
   - 利用規約への同意チェックボックス（Dashboard の TOS URL にリンク）
   - `¥1,490/月` のような明確な価格・周期表示
2. テスト決済完了後、Webhook `checkout.session.completed` の `consent.terms_of_service` が `"accepted"` になることを確認

### 6-4. 就活Pass の Stripe 公開準備の順番

現時点の就活Pass では、次の順で進めます。

1. `Harbor Works` と `support@shupass.jp` を前提に公開方針を docs に固定する（完了）
2. バーチャルオフィスを契約し、公開用住所を確定する
3. `/legal` に `Harbor Works`・バーチャルオフィス住所・請求時開示文言を直接記載する（完了）
4. Stripe Dashboard の Public details / Checkout settings / Compliance / Customer Portal を §6-3 に従って設定する（**Terms of service URL は必須**）
5. Stripe test mode で Checkout 動作確認を行い、`consent.terms_of_service` が `"accepted"` になることを確認する
6. Stripe 本番申請を始める

差し戻しが出た場合は、次の順で追加対応します。

1. 電話番号の公開要否を確認し、必要なら事業用番号を契約する
2. `運営責任者` の表示方法について Stripe の要求文言を確認する
3. それでも不十分な場合に限り、個人名の表示方法を再判断する

### 6-5. 就活Pass での実務メモ

- Checkout は [src/app/api/stripe/checkout/route.ts](../../src/app/api/stripe/checkout/route.ts) から作成しています。改正特商法 12 条の 6 対応の `custom_text` と `consent_collection` はここに集約されています。
- Stripe Product の正本設定は [src/lib/stripe/managed-config.json](../../src/lib/stripe/managed-config.json)。Dashboard と食い違いが出たら sync スクリプトで再反映するか、Dashboard 側を手動修正します。
- 法令ページ自体は [src/app/(marketing)/legal/page.tsx](../../src/app/(marketing)/legal/page.tsx) にあります。
- `support@shupass.jp` は既に受信可能であることを前提に運用します。
- `Harbor Works` は公開主体として固定します。
- 所在地はバーチャルオフィス住所を公開します。
- 個人名と電話番号は、ユーザー向けには請求時開示で運用します（Stripe 審査で指摘が入った場合は §6-4 の差し戻し手順で対応）。

---

## 7. 実行チェックリスト

### 7-1. 開業

- [ ] 開業日を決めた
- [ ] 屋号と事業内容を決めた
- [ ] `freee開業` または `マネーフォワード クラウド開業届` で書類を作成した
- [ ] 開業届を提出した
- [ ] 青色申告承認申請書を提出した

### 7-2. 事業基盤

- [ ] バーチャルオフィスを契約した
- [ ] 独自ドメインのメールを用意した
- [ ] 必要なら電話番号を契約した
- [ ] 事業用の銀行口座・カードの切り分け方針を決めた
- [ ] `Harbor Works` を公開主体にする方針を決めた
- [ ] 所在地を公開し、個人名と電話番号は請求時開示にする方針を決めた

### 7-3. サイトと Stripe

- [ ] `/legal` の本番文言を設定した
- [ ] `/pricing` と `/terms` の課金説明を確認した
- [ ] Stripe のサポート連絡先を設定した
- [ ] Stripe に `Commerce Disclosure` URL を登録した
- [ ] テスト決済で、価格・自動更新・解約導線の表示を確認した
- [ ] `/legal` に所在地が直接記載されていることを確認した

---

## 8. 他の個人開発者の実例

以下は実例であり、法的根拠ではありません。どのように開業や運用を考えたかの参考として扱ってください。

就活Pass では、以下のような個人開発・個人事業主の実例も参考にしつつ、`所在地は公開し、個人名は請求時開示` という折衷方針を採用します。これらは主に、開業判断、屋号運用、住所公開対策、個人開発 SaaS の収益化文脈を補助的に理解するために参照します。

| 例 | 参考 URL | 何の参考になるか |
|---|---|---|
| 1 | https://zenn.dev/tamatech/articles/acae2ad1d860c4 | 兼業個人開発で開業届を出すべきか整理した例 |
| 2 | https://zenn.dev/hidenori3/articles/c285a13197a03d | 会社員兼個人事業主としてアプリ運用する文脈 |
| 3 | https://zenn.dev/tasshi/scraps/4b4243c4e8ba06 | 開業届、青色申告、屋号口座の整理例 |
| 4 | https://zenn.dev/ohno/articles/c5d1acc67245e5 | 学生エンジニアが開業して確定申告まで進めた例 |
| 5 | https://zenn.dev/kamo_tomoki/articles/8c46e054f713e3 | 個人開発を軸に個人事業主化した動機の整理 |
| 6 | https://zenn.dev/techstart/articles/7dbcf0b00864f2 | 個人開発 Web サービスを収益化する文脈 |
| 7 | https://zenn.dev/nnnwa/articles/15ebad6c931a2c | 個人開発者が住所公開対策を検討した例 |
| 8 | https://zenn.dev/clevique/articles/e7619305acf298 | 個人事業主としてプロダクト開発する例 |
| 9 | https://zenn.dev/zh_ru/articles/claude-code-4saas | 個人事業で SaaS を立ち上げる視点 |
| 10 | https://zenn.dev/ttskch/articles/5b7bbb7b83e31d | 独立・個人開発サービス運営の経験談 |

---

## 9. 出典

### 9-1. 公式情報

- Stripe Support, `How to create and display a Commerce Disclosure page`
  - https://support.stripe.com/questions/how-to-create-and-display-a-commerce-disclosure-page
- 消費者庁 特定商取引法ガイド, `通信販売広告Q&A`
  - https://www.no-trouble.caa.go.jp/qa/advertising.html
- 消費者庁, `通信販売`
  - https://www.no-trouble.caa.go.jp/what/mailorder/rule.html
- 消費者庁, `通信販売の申込み段階における表示についてのガイドライン`
  - https://www.caa.go.jp/policies/policy/consumer_transaction/amendment/2021/notice02/index.html
- 国税庁, `個人で事業を始めたとき/法人を設立したとき`
  - https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2090.htm
- 国税庁, `青色申告制度`
  - https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2070.htm
- 国税庁, `青色申告特別控除`
  - https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2072.htm
- 国税庁, `給与所得者で確定申告が必要な人`
  - https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1900.htm
- 国税庁, `適格請求書発行事業者の登録申請手続`
  - https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/shohi/annai/06.htm

### 9-2. サービス公式ページ

- freee開業
  - https://www.freee.co.jp/launch/
- freee会計 料金
  - https://www.freee.co.jp/accounting/
- マネーフォワード クラウド開業届
  - https://biz.moneyforward.com/starting-business/
- マネーフォワード クラウド確定申告 料金
  - https://biz.moneyforward.com/tax_return/individual/pricing/
- GMOオフィスサポート 料金
  - https://www.gmo-office.com/price/
- DMMバーチャルオフィス 料金
  - https://virtualoffice.dmm.com/price
- NAWABARI 料金
  - https://nawabari.net/price/
- Google Workspace 料金
  - https://workspace.google.com/intl/ja/pricing.html

### 9-3. 実例

- 本文「8. 他の個人開発者の実例」に記載の各 URL
