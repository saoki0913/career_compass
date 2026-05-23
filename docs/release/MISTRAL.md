# Mistral OCR の設定

[← インデックス](./README.md)

---

## 1. 概要

`MISTRAL_API_KEY` は、FastAPI バックエンドの高精度 PDF/画像 OCR で使う Mistral の API キーです。Mistral Document AI（OCR）を呼び出し、PDF や画像から構造を保ったテキスト（Markdown）を抽出します。

| 項目 | 内容 |
|---|---|
| 用途 | 高精度 OCR。`high_accuracy` 経路で `https://api.mistral.ai/v1/ocr`（モデル `mistral-ocr-latest`）を呼ぶ |
| 使用箇所 | FastAPI バックエンド（`backend/app/utils/pdf_ocr.py`） |
| 重要度 | **任意** |
| 環境区分 | **共通可**（local / staging / production で同じキーを流用してよい） |
| 設定先 | `fastapi.env`（Railway）。ローカルは `.env.local` |

> **未設定時の挙動（fallback）**: `MISTRAL_API_KEY` が空のとき、高精度経路は `[pdf_ocr] Mistral OCR is not configured` を warning ログに出し、空テキストを返します。OCR は **ページ単位の経路選択**になっており、デフォルト経路は Google Document AI、ボリュームの大きい PDF などで `high_accuracy`（Mistral）に振り分けられます（`backend/app/routers/company_info_pdf.py`）。Mistral が空を返したページは、Google Document AI の結果またはローカル抽出テキスト（pypdf）にフォールバックします。**任意キーのため、未設定でも OCR フロー自体は止まりません。**

OCR の経路は実装側のヒューリスティック（ページ数・1 ページあたりの文字数など。`PDF_OCR_HIGH_ACCURACY_MIN_PAGES` などで調整）で決まります。`MISTRAL_API_KEY` を設定すると、高精度経路に振り分けられたページで Mistral OCR が有効になります。

OCR 経路に関わる Google 側の設定（`GOOGLE_DOCUMENT_AI_*`）は [GOOGLE_CLOUD.md](./GOOGLE_CLOUD.md) を参照してください。

---

## 2. 前提 CLI

Mistral には **API キーを発行する公式 CLI はありません**。キー作成は La Plateforme（Mistral Studio）の Web コンソールでのみ行います（後述）。

> 公式: API キー作成手順は Studio コンソール（Dashboard）ベースのみで案内されています。参考: https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key

env への反映は、各プラットフォームの CLI で行います。

```bash
# Railway CLI（fastapi.env への反映に使用）
npm i -g @railway/cli   # または: brew install railway
railway login
railway whoami
```

ローカルの `.env.local` への反映は手元のエディタで追記します（実 secret は git にコミットしない）。

---

## 3. キー取得（La Plateforme / Mistral Studio）

Mistral の API キー発行は CLI が無いため、Web コンソール（fallback ではなく唯一の手段）で行います。

### 3-1. アカウント作成と無料プラン（Experiment）の有効化

無料の **Experiment プラン**はクレジットカード不要で、電話番号の認証だけで API を使い始められます。

1. https://admin.mistral.ai/subscriptions を開く
2. **Experiment for free**（無料で試す）を選択する
3. 利用規約・プライバシーポリシーに同意する
4. 電話番号を認証する

> 公式: Experiment プランは「free API access with no credit card required」。参考: https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key

### 3-2. ワークスペースの作成

API キーは**ワークスペース単位**で発行・スコープされます。

1. https://console.mistral.ai を開く
2. 左サイドバーの **Workspaces** を開く
3. **Create workspace** → ワークスペース名を入力 → **Create**

> 環境ごとに別キーにしたい場合は、ワークスペースを分けるのが公式の推奨です。就活Pass の `MISTRAL_API_KEY` は `[共通可]` のため、単一ワークスペースの 1 キーを local / staging / production で流用して構いません（後述 7 章）。
> 公式: API キーはワークスペースにスコープされる。参考: https://docs.mistral.ai/admin/security-access/api-keys

### 3-3. API キーの発行

1. https://console.mistral.ai を開き、対象ワークスペースの設定で **API Keys** タブを開く
2. **Create new key** をクリック
3. 名前（例: `career-compass`）と **有効期限（expiration date）** を設定する
4. **Create new key** で確定する
5. 表示されたキーを**その場でコピーして安全に保管する**

> **重要**: フルキーは作成直後に一度だけ表示されます。ダイアログを閉じると再取得できないため、必ずその場で控えてください。実 secret は本書に書きません（placeholder のみ）。
> 公式: 直接の管理 URL は https://admin.mistral.ai/organization/api-keys （要ログイン）。

### 3-4. 取得したキーの確認（任意）

発行直後に疎通だけ確認したい場合は、公式 REST を curl で叩けます（実キーは履歴に残さないこと）。

```bash
# OCR の疎通確認は 6 章を参照。ここではモデル一覧で API キーの有効性を確認する例
curl -s https://api.mistral.ai/v1/models \
  -H "Authorization: Bearer $MISTRAL_API_KEY" | head -c 400
```

---

## 4. env への反映

実キーは [共通可] なので、ローカルで取得した 1 キーをそのまま staging / production に反映します。

### ローカル（.env.local）

`.env.local` に追記します（git 管理外。実 secret はコミットしない）。

```env
MISTRAL_API_KEY=<La Plateforme で発行したキー>
```

### staging / production（Railway / fastapi.env）

Mistral はバックエンド（Railway）で使うため、`fastapi.env` 相当の Railway Variables に設定します。

```bash
# 対象 service / environment を選んでから設定
# 個別反映の正本は RAILWAY.md。秘匿値は stdin で渡し履歴に残さない
printf '%s' "<.env.local と同じキー>" | railway variable set MISTRAL_API_KEY --stdin

# 設定を確認
railway variables
```

> secret bundle の正本は repo local `.secrets/`（解決順は [operations/production/SECRETS_MANAGEMENT.md](../operations/production/SECRETS_MANAGEMENT.md)）。bundle で集中管理する運用では、`.secrets/<env>/fastapi.env` に `MISTRAL_API_KEY` を追記し、`zsh scripts/release/sync-career-compass-secrets.sh --check` でインベントリを確認してから sync します。

---

## 5. キーの制限・セキュリティ

| 項目 | 推奨 |
|---|---|
| 利用場所 | **サーバー専用**（FastAPI バックエンドのみ）。ブラウザ・クライアントに露出させない |
| 有効期限 | 作成時に **expiration date を設定**。未設定だと手動失効まで永続のため、期限付きを推奨 |
| スコープ | キーはワークスペース単位。プランで使える全エンドポイントにアクセスできる |
| ローテーション | 新キーを発行 → 反映 → 旧キーを削除、の順で定期的に入れ替える |
| 漏洩時 | チャット・ログ・issue・共有メモに貼ったキーは漏洩済みとして即削除し、新しく作り直す |
| バージョン管理 | git にコミットしない。env / secrets manager で管理する |

> 公式: サーバー側から呼び出し、有効期限・ローテーションで管理する。参考: https://docs.mistral.ai/admin/security-access/api-keys

---

## 6. 環境変数マッピング

| 変数名 | 設定先 | 重要度 | 環境区分 |
|---|---|---|---|
| `MISTRAL_API_KEY` | `.env.local`（local）／ `fastapi.env`（Railway: staging / production） | **任意** | **共通可** |

変数の意味の SSOT は [operations/platform/ENVIRONMENT_VARIABLES.md](../operations/platform/ENVIRONMENT_VARIABLES.md) です。本書には取得手順を置き、SSOT 側には複製しません。

config 上の対応は `settings.mistral_api_key`（`backend/app/config.py`、`validation_alias=MISTRAL_API_KEY`）です。

---

## 7. ローカル値の流用可否

`MISTRAL_API_KEY` は **[共通可]** の外部 API キーです。

- **`.env.local` の値をそのまま staging / production に貼ってよい**。環境別に取得し直す必要はありません。
- Stripe や Google OAuth のように環境ごとの分離（webhook endpoint / OAuth client）が要件にならないため、単一キーの流用で問題ありません。
- 環境を厳密に分けたい場合のみ、Mistral 側でワークスペースを分けて環境別キーにできます（必須ではありません）。

> 流用ルールの正本は [operations/platform/ENVIRONMENT_VARIABLES.md](../operations/platform/ENVIRONMENT_VARIABLES.md) を参照。

---

## 8. コスト目安・動作確認

### コスト目安

任意機能のため、未設定なら課金は発生しません。設定して高精度経路が走った場合の目安は以下です（**目安**であり、最新の正値は公式ページで確認してください）。

| 項目 | 目安 |
|---|---|
| Mistral OCR（latest / OCR 3） | 約 **$2 / 1,000 ページ**（= 約 $0.002 / ページ） |
| Batch API 利用時 | 約 **$1 / 1,000 ページ**（50% 割引） |
| アノテーション付きページ | 約 **$3 / 1,000 ページ** |
| 無料枠（Experiment プラン） | クレジットカード不要・電話番号認証で利用開始可 |

実装側の見積もり係数は `MISTRAL_OCR_PRICE_PER_PAGE_USD = 0.002`（`backend/app/utils/pdf_ocr.py`）で、上記 OCR 3 の単価と一致します。

> 公式: Mistral OCR の価格。参考: https://mistral.ai/news/mistral-ocr-3 ／ https://mistral.ai/pricing
> 公式: モデル `mistral-ocr-latest` は PDF・画像の OCR に対応。参考: https://docs.mistral.ai/capabilities/document_ai/document_ai_overview/

### 動作確認

API キー設定後、OCR エンドポイントの疎通を確認できます（実キーはシェル履歴に残さない）。

```bash
# 公開 PDF を OCR にかけて pages が返るか確認する例
curl -s https://api.mistral.ai/v1/ocr \
  -H "Authorization: Bearer $MISTRAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mistral-ocr-latest",
    "document": { "type": "document_url", "document_url": "<公開 PDF の URL>" },
    "include_image_base64": false
  }' | head -c 400
```

アプリ側では、企業情報の PDF アップロード／取得フローで高精度経路に振り分けられたページに対し、`provider` が `mistral_ocr`、`extraction_method` が `ocr_high_accuracy` になります（`backend/app/routers/company_info_pdf.py`）。
