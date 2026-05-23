# OpenAI の本番設定

[← インデックス](./README.md)

---

## 1. 概要

OpenAI API は FastAPI バックエンド (`backend/app`) の LLM 処理で使う。具体的な用途は次の 3 つ。

| 用途 | 使う場所 | 補足 |
|---|---|---|
| RAG（検索拡張生成） | クエリ拡張・HyDE・コンテンツ分類などの軽量 LLM | モデルは `MODEL_RAG_*` で切り替え |
| 企業情報検索 | 企業情報取得・要約・選考スケジュール抽出 | モデルは `MODEL_COMPANY_INFO` 等で切り替え |
| embeddings（埋め込み） | RAG 用ベクトル生成（ChromaDB へ格納） | 既定モデル `text-embedding-3-small`（1536 次元） |

> ES 添削・面接・下書きは Anthropic 側（`ANTHROPIC_API_KEY`）が主担当。OpenAI は上記の検索・RAG・embeddings が中心。

### 必須 / 任意と未設定時の挙動

| 変数 | 重要度 | 環境 | 未設定時の挙動 |
|---|---|---|---|
| `OPENAI_API_KEY` | **必須** | 共通可 | デプロイ環境では fail-fast。バリデーション（`backend/app/config.py`）が `OPENAI_API_KEY はデプロイ環境では必須です。` を返してサーバー起動をブロックする。embeddings backend も無効化され、RAG ソース生成が「No embedding backend available」で失敗する。 |
| `OPENAI_EMBEDDING_MODEL` | 任意 | 共通可 | 未設定時は既定の `text-embedding-3-small` を使う（`backend/app/utils/embeddings.py`）。通常は変更不要。 |

> 変数の意味の正本は [`operations/platform/ENVIRONMENT_VARIABLES.md`](../operations/platform/ENVIRONMENT_VARIABLES.md)。本文では取得手順だけを扱い、変数カタログは複製しない。

---

## 2. 前提 CLI

OpenAI には公式 CLI があり、Homebrew で導入できる。本番（FastAPI）は Railway なので、env 反映には Railway CLI も使う。

```bash
# OpenAI 公式 CLI（API キーの mint / 使用量確認に使う）
brew install openai/tools/openai

# Railway CLI（FastAPI の env 反映に使う）
npm install -g @railway/cli
railway login
railway whoami
```

> 公式: OpenAI CLI のインストールと認証。参考: https://developers.openai.com/api/docs/libraries/openai-cli

### 認証用の環境変数

OpenAI CLI は環境変数で認証する。標準操作は `OPENAI_API_KEY`、組織管理（プロジェクト作成・キー発行など）は `OPENAI_ADMIN_KEY` を使う。

| 環境変数 | 用途 |
|---|---|
| `OPENAI_API_KEY` | 通常の API 操作（推論・embeddings・使用量参照の一部） |
| `OPENAI_ADMIN_KEY` | 組織管理エンドポイント（projects / service-accounts / API キー管理） |
| `OPENAI_ORG_ID` | 組織 ID（任意・複数組織に属する場合に明示） |
| `OPENAI_PROJECT_ID` | プロジェクト ID（任意） |

> 公式: CLI の認証環境変数。参考: https://github.com/openai/openai-cli

---

## 3. キー取得・リソース作成

### CLI ファーストの原則と例外

OpenAI の API キー発行には 2 経路がある。

1. **Admin API キー（`sk-admin-...`）の作成は Dashboard のみ**。組織オーナーだけが発行でき、CLI/API では mint できない（Admin キー自体が組織管理の入口のため）。
2. Admin キーを `OPENAI_ADMIN_KEY` に入れれば、**通常の Project API キー（service account 経由）は CLI で発行できる**。

つまり最初の 1 回だけ Dashboard で Admin キーを作り、以降はサービス用キーを CLI で発行する流れが、CLI ファーストに最も沿う。Admin キーを使わない運用なら、`OPENAI_API_KEY` 用のキーを Dashboard で直接作る (3-3) だけでもよい。

### 3-1. （初回のみ）Admin キーを Dashboard で作成

組織オーナーで https://platform.openai.com/settings/organization/admin-keys を開き、左メニュー **Admin keys** → 左上 **Create new admin key** で作成する。`sk-admin-...` は作成直後にしか表示されないので安全に保管する。

| 項目 | 値 |
|---|---|
| 作成場所 | https://platform.openai.com/settings/organization/admin-keys |
| 権限 | 組織オーナーのみ作成・利用可。管理エンドポイント専用（推論には使えない） |
| 用途 | CLI の `OPENAI_ADMIN_KEY` に設定し、プロジェクト/サービスキーを発行する |

> 公式: Admin API キーは組織オーナーが Dashboard で作成する。参考: https://developers.openai.com/api/docs/guides/admin-apis

### 3-2. CLI でプロジェクトとサービスキーを発行（推奨）

Admin キーを環境に渡し、プロジェクト作成 → service account 作成の順で実行する。service account 作成のレスポンスに、そのまま使える **API キー（`sk-...`）** が含まれる。これを `OPENAI_API_KEY` として使う。

```bash
# Admin キーを一時的にプロセス env へ（シェル履歴に残さない・umask 推奨）
export OPENAI_ADMIN_KEY=<sk-admin-...>

# 1) プロジェクト作成（例: production 用）
openai admin:organization:projects create \
  --name "career-compass-production" \
  --format json
# → 出力 JSON の id を控える（例: proj_xxx）

# 2) service account 作成 → レスポンスに API キーが含まれる
openai admin:organization:projects:service-accounts create \
  --project-id "<proj_xxx>" \
  --name "career-compass-fastapi-production"
```

staging と production はプロジェクト/キーを分けるのが安全だが、`OPENAI_API_KEY` は **[共通可]**（後述 6-7）なので、コスト都合で同一キーを使う運用も可能。分ける場合は `--name` を `career-compass-staging` 等に変えてもう一度実行する。

> **重要**: service account のキーはレスポンスに一度だけ表示される。`project.json` / `service-account.json` / `.env` は `.gitignore` 済みであることを確認し、実キーをコミットしない。
> 公式: CLI でのプロジェクト/サービスキー発行手順。参考: https://developers.openai.com/api/docs/libraries/openai-cli

### 3-3. （fallback）Dashboard で API キーを直接作成

CLI を使わない場合や、service account を介さず単発キーが欲しい場合は Dashboard で作る。

1. https://platform.openai.com/settings/organization/api-keys を開く
2. **Create new secret key** をクリック
3. 名前（任意・例: `career-compass-fastapi-production`）と、対象プロジェクト、権限（**All / Restricted / Read Only**）を選ぶ
4. 表示された `sk-...` を控える（再表示不可）

> OpenAI は組織（Organization）の下にプロジェクト（Project）を持つ。キーはプロジェクトに紐づけて作るのが推奨。
> 公式: プロジェクトと API キーの管理。参考: https://help.openai.com/en/articles/9186755-managing-your-work-in-the-api-platform-with-projects

### 3-4. 使用量上限・予算アラートの設定

想定外の課金を防ぐため、プロジェクト単位で月次予算と通知しきい値を設定する。**予算アラートは通知のみで、ハードな支払い上限ではない**点に注意する。

1. 組織設定 → 対象プロジェクト → **Limits**
   - **Monthly budget**（月次予算）
   - **Notification threshold**（通知しきい値。既定で 100% にアラートが付き、**Add Alert** で追加可能）
   - **Model usage**（プロジェクトで使えるモデルとモデル別レート制限）
2. 組織全体の上限は 組織設定 → **Limits** → Usage limits

> 予算アラートとモデル制限を設定・管理できるのは組織オーナーとプロジェクトオーナーのみ。
> 公式: 使用量上限と予算アラート。参考: https://platform.openai.com/settings/organization/limits

---

## 4. env への反映

値の正本は repo local の `.secrets/`、人間向け一覧は [`ENVIRONMENT_VARIABLES.md`](../operations/platform/ENVIRONMENT_VARIABLES.md)。標準運用は `sync-career-compass-secrets.sh` での同期だが、CLI で直接入れる場合は次のとおり。

### FastAPI（Railway）

```bash
# Railway の対象 service に直接設定する場合（個別反映の正本は RAILWAY.md。秘匿値は stdin で渡し履歴に残さない）
printf '%s' "<sk-...>" | railway variable set OPENAI_API_KEY --stdin

# 既定モデルから変える場合のみ（通常は不要・機密でない値）
railway variable set OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

`.secrets/` 経由で同期する場合は、`scripts/release/secrets-examples/{staging,production}/fastapi.env.example` に倣って repo local の `.secrets/<env>/fastapi.env` の `OPENAI_API_KEY` を埋め、次を実行する。

```bash
# production（career-compass project）
zsh scripts/release/sync-career-compass-secrets.sh --check --target railway-production
zsh scripts/release/sync-career-compass-secrets.sh --apply --target railway-production

# staging（career-compass-staging project）
zsh scripts/release/sync-career-compass-secrets.sh --check --target railway-staging
zsh scripts/release/sync-career-compass-secrets.sh --apply --target railway-staging
```

### ローカル開発

ローカルは `.env.local` に追記する。

```env
OPENAI_API_KEY=<sk-...>
# 既定から変える場合のみ
#OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

---

## 5. キーの制限・セキュリティ

- **サーバー専用**: `OPENAI_API_KEY` は FastAPI バックエンドからのみ使う。フロントエンド（ブラウザ）に露出させない。`NEXT_PUBLIC_` を付けない。
- **最小権限**: Dashboard でキーを作るときは可能なら **Restricted** にし、必要なエンドポイント/プロジェクトに絞る。Admin キーは管理操作専用で推論には使えないので、アプリの `OPENAI_API_KEY` には使わない。
- **漏洩時の rotate**: チャット・ログ・issue・共有メモにキーが露出したら、漏洩済みとして即無効化し、新しいキーを発行して差し替える。
  1. Dashboard https://platform.openai.com/settings/organization/api-keys で該当キーを **Revoke / Delete**（または CLI で該当 service account のキーを失効）
  2. 3-2 または 3-3 の手順で新しいキーを発行
  3. 4 の手順で Railway / `.env.local` の `OPENAI_API_KEY` を差し替え、`sync ... --check` で反映を確認
- **使用量監視**: 3-4 の予算アラートに加え、`openai admin:organization:usage completions ...` で使用量を CLI から確認できる。

> 公式: API キーは制限し、サーバー側でのみ使う。参考: https://platform.openai.com/docs/api-reference/admin-api-keys/list

---

## 6. 環境変数マッピング

| 変数名 | 設定先 | 重要度 | 環境 |
|---|---|---|---|
| `OPENAI_API_KEY` | FastAPI=Railway `fastapi.env` / ローカルは `.env.local` | **必須** | 共通可 |
| `OPENAI_EMBEDDING_MODEL` | FastAPI=Railway `fastapi.env` / ローカルは `.env.local` | 任意（既定 `text-embedding-3-small`） | 共通可 |

> Vercel（Next.js）側には OpenAI 関連の設定は不要。OpenAI を呼ぶのは FastAPI のみ。

---

## 7. ローカル値の流用可否

`OPENAI_API_KEY` と `OPENAI_EMBEDDING_MODEL` はいずれも **[共通可]**。したがって `.env.local` に置いた値を、そのまま staging / production（Railway の `fastapi.env`）に貼ってよい。外部 API キーで環境ごとの prefix 検査（`sk_test_` / `sk_live_` のような区別）や namespace 検査がないため、環境別に取り直す必要はない。

> ただし、漏洩時の影響範囲・quota・課金を環境ごとに切り分けたい場合は、3-2 の `--name` を変えて環境別キーを発行してもよい（任意）。production だけ分ける運用も可能。

---

## 8. コスト目安

OpenAI は従量課金。下記は目安であり、最新の正確な価格は必ず公式の料金ページで確認する。

| モデル | 価格（目安・1M トークンあたり） | 用途 |
|---|---|---|
| `text-embedding-3-small` | $0.02 | embeddings（既定） |
| `gpt-5.4`（就活Pass が既定で使用） | 入力 $2.50 / 出力 $15.00 | 検索・要約・分類 |

> Batch API を使うと入出力とも 50% 割引になる。RAG の軽量処理は `gpt-mini` / `gpt-nano` 系（`MODEL_RAG_*`）で安価に回す設計。
> 公式: 料金は OpenAI 料金ページが正本。参考: https://openai.com/api/pricing/ ／ https://developers.openai.com/api/docs/pricing
