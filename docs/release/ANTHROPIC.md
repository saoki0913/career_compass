# Anthropic (Claude API) の本番設定

[← インデックス](./README.md)

Anthropic の Claude API は、就活Pass の LLM 処理（ES 添削・面接対策・各種下書き生成）に使う。これらは FastAPI バックエンド（Railway）から呼び出すため、`ANTHROPIC_API_KEY` は Railway 側（`fastapi.env`）とローカル（`.env.local`）に設定する。Vercel（フロントエンド）には設定しない。

---

## 1. 概要

| 項目 | 内容 |
|---|---|
| 用途 | LLM（ES 添削・面接対策・各種下書き生成）。FastAPI バックエンドで使用 |
| 変数 | `ANTHROPIC_API_KEY` |
| 重要度 | **必須** |
| 環境 | **共通可**（`.env.local` の値を staging / production に流用してよい。詳細は §7） |
| 設定先 | FastAPI = Railway の `fastapi.env`、ローカルは `.env.local` |
| 未設定時の挙動 | `APP_ENV=staging` / `production` では fail-fast バリデーション（`validate_deployed_requirements`）が起動を止める。ローカルでは Claude を使う機能の呼び出し時にエラーになる |

> Claude で実際に呼び出すモデル ID（Opus / Sonnet / Haiku のどれを使うか）はバックエンドの model routing が管理する。この文書は `ANTHROPIC_API_KEY` の取得・設定だけを扱い、モデル選択は扱わない。

---

## 2. 前提 CLI

### キー発行用の CLI は存在しない

Anthropic は **API キーの新規作成を Claude Console（GUI）でのみ提供**しており、キーを発行（mint）する CLI コマンドは公式に存在しない。Admin API も「既存キーの管理（一覧・更新・無効化）」のみで、新規キー作成はできない。

> 公式: 「No, new API keys can only be created through the Claude Console for security reasons. The Admin API can only manage existing API keys.」 <https://platform.claude.com/docs/en/api/administration-api>

したがって本書では、**キー発行は §4 の Console 手順で行い、発行済みキーの env 反映だけを CLI で示す**（Railway CLI / `.env.local`）。

### env 反映に使う CLI

| CLI | 用途 | インストール / ログイン |
|---|---|---|
| **Railway CLI** | Railway の `fastapi.env` にキーを反映 | `brew install railway`（または `npm i -g @railway/cli`）→ `railway login` |

> 補足: API を「呼び出す」だけなら Anthropic 公式 CLI（`ant`）もある（`brew install anthropics/tap/ant` → `ant auth login`）。ただし `ant` はキーを発行せず、`ANTHROPIC_API_KEY` が環境にあればそれを優先して使う。就活Pass のキー発行・反映には不要。
> 公式: <https://platform.claude.com/docs/en/docs/quickstart>

---

## 3. Anthropic アカウントと請求の準備

Claude Console (<https://platform.claude.com/>) にログインする。

1. アカウントを作成し、組織（Organization）を用意する
2. **Settings → Billing** で支払い方法（クレジットカード）を登録する。従量課金（pay-as-you-go）のため、未登録だと API 呼び出しが失敗する
3. 初回はテスト用の無料クレジットが付与される場合があるが、本番運用には支払い方法の登録が必要

> 公式: 課金・使用状況は Claude Console で管理する。<https://platform.claude.com/docs/en/about-claude/pricing>

---

## 4. API キーの取得（Console のみ）

API キーの発行は Console でのみ可能。**Workspace 単位**で発行すると、使用量上限（spend limit）とレート制限を環境ごとに分けて管理できるため、就活Pass では staging / production を別 Workspace・別キーにすることを推奨する（流用は可能だが、コスト・quota・監査を分けたい場合に有効）。

### 4-1. Workspace を作成（推奨）

1. <https://platform.claude.com/settings/workspaces> を開く
2. **Add Workspace** をクリック
3. Workspace 名（例: `career-compass-production` / `career-compass-staging`）と色を設定して **Create**

> Workspace の新規作成は Organization Admin のみ可能。1 組織あたり最大 100 Workspace。
> 公式: <https://support.claude.com/en/articles/9796807-creating-and-managing-workspaces>

### 4-2. 使用量上限（spend limit）とレート制限を設定

1. 対象 Workspace の詳細ページ → **Limits** タブ
2. **Spend limit**: **Change Limit** で月次の上限を設定する。組織全体の上限より低い値のみ設定できる
3. **Rate limit**: 各モデル tier の鉛筆アイコンから調整する（組織全体の上限の範囲内）
4. 必要なら **Add notification** でしきい値メール通知を追加する

> 公式: 「You can only set a spend limit that is lower than your organization's limit.」<https://support.claude.com/en/articles/9796807-creating-and-managing-workspaces>

### 4-3. Workspace スコープの API キーを発行

1. 対象 Workspace を開く → **API Keys** タブ
2. **Create Key** をクリック
3. キー名（例: `career-compass-production-fastapi`）を入力して **Create Key**
4. 表示された `sk-ant-...` を控える（**この画面でしか全文は表示されない**）

> API キーは作成した Workspace に紐づき、別 Workspace へは移動できない。
> 公式: <https://support.claude.com/en/articles/9796807-creating-and-managing-workspaces>

### 4-4. （fallback）組織のデフォルトキー

Workspace を分けない場合は <https://platform.claude.com/settings/keys> から直接 API キーを作成してもよい。発行後 `sk-ant-...` を控える。

> 公式: 「Get your API key from the Claude Console (`/settings/keys`)」<https://platform.claude.com/docs/en/docs/quickstart>

### 4-5. 動作確認（任意）

発行直後に curl で疎通確認できる（モデル ID は一例。本番のモデル選択はバックエンドの routing が行う）。

```bash
curl https://api.anthropic.com/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-opus-4-7",
    "max_tokens": 16,
    "messages": [{"role": "user", "content": "ping"}]
  }'
```

> 公式: <https://platform.claude.com/docs/en/docs/quickstart>

---

## 5. キーの制限・セキュリティ

- **サーバー専用**: `ANTHROPIC_API_KEY` はバックエンド（Railway / ローカルの FastAPI）からのみ使う。フロントエンド（ブラウザ）やクライアントコード、`NEXT_PUBLIC_*` には絶対に置かない
- **平文で残さない**: チャット・ログ・issue・共有メモにキーを貼らない。第三者プロバイダ（Railway 等）には暗号化シークレットとして登録する
- **環境別キー（推奨）**: dev / staging / production でキーを分けると、漏洩時の影響範囲を限定できる（Workspace 分離で実現）
- **定期ローテーション**: 公式は 90 日程度での定期ローテーションを推奨。新しいキーを作って古いキーを無効化する
- **漏洩時**: 直ちに Console の API keys ページで該当キー横の **Delete API Key** で無効化し、新しいキーを発行して再反映する。一度でも露出したキーは `lookup` の結果に関わらず再利用しない

> 公式: API key best practices（rotate every 90 days / encrypted secret / 漏洩時は revoke）。<https://support.claude.com/en/articles/9767949-api-key-best-practices-keeping-your-keys-safe-and-secure>

---

## 6. 環境変数マッピング

| 変数名 | 設定先 | 重要度 | 環境区分 |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | `.env.local`（ローカル）／ `fastapi.env`（Railway staging・production）／ `github-actions.env`（CI） | **必須** | **共通可** |

変数の意味の正本（SSOT）は [`operations/platform/ENVIRONMENT_VARIABLES.md`](../operations/platform/ENVIRONMENT_VARIABLES.md)。本書はその取得・反映手順を担当し、変数カタログは複製しない。

### 6-1. ローカル（`.env.local`）

`.env.local` に発行済みキーを記載する。

```env
ANTHROPIC_API_KEY=sk-ant-...
```

### 6-2. Railway（`fastapi.env`）— 標準は secret sync

就活Pass の標準運用では、Railway の env は `scripts/release/sync-career-compass-secrets.sh` で同期し、値の正本は repo local の `.secrets/` にある。`.secrets/<env>/fastapi.env` の `ANTHROPIC_API_KEY` を埋めてから sync する。

```bash
# production（career-compass project）
zsh scripts/release/sync-career-compass-secrets.sh --check --target railway-production
zsh scripts/release/sync-career-compass-secrets.sh --apply --target railway-production

# staging（career-compass-staging project）
zsh scripts/release/sync-career-compass-secrets.sh --check --target railway-staging
zsh scripts/release/sync-career-compass-secrets.sh --apply --target railway-staging
```

> インベントリ確認は `zsh scripts/release/sync-career-compass-secrets.sh --check` のみで行う。実 secret ファイル（`.env.local` / `.secrets/**`）は直接 Read しない。

### 6-3. Railway CLI で個別に設定（fallback）

secret sync を使わず、Railway CLI で 1 変数だけ反映する場合。

```bash
# 対象プロジェクト / 環境にリンク（初回のみ）
railway link

# 変数を設定（service と environment を明示）
railway variable set ANTHROPIC_API_KEY=sk-ant-... -s <SERVICE> -e <ENV>

# 設定値の確認
railway variable list -s <SERVICE> -e <ENV>
```

> `railway variable` のエイリアスは `variables` / `vars` / `var`。旧構文 `railway variables --set "ANTHROPIC_API_KEY=sk-ant-..."` も後方互換で動くが、現行ドキュメントは `railway variable set KEY=value` を推奨する。値を履歴に残したくない場合は `echo "sk-ant-..." | railway variable set ANTHROPIC_API_KEY --stdin` を使う。
> 公式: <https://docs.railway.com/cli/variable>

### 6-4. CI（GitHub Actions）

CI で Live AI テスト等を回す場合、`github-actions.env`（→ GitHub Secrets）にも `ANTHROPIC_API_KEY` を反映する。反映は同じ secret sync の対象。

---

## 7. ローカル値の流用可否

`ANTHROPIC_API_KEY` は **[共通可]**。Anthropic の API キーは webhook endpoint や環境固有の prefix 検査を持たないため、**`.env.local` の値をそのまま staging / production の `fastapi.env` に貼ってよい**。

ただし以下の理由から、本番だけは別キー（別 Workspace）に分けることを推奨する。

- 漏洩時の影響範囲を本番から切り離せる
- Workspace ごとに spend limit / rate limit / 使用量を分けて監査できる
- dev・staging の LLM キー共有はコスト都合で許容しつつ、production は分離する（SSOT のガイドラインと一致）

> 比較: `STRIPE_*` や `GOOGLE_CLIENT_ID/SECRET` は **[環境別]**（endpoint・OAuth client が環境ごとに分かれ、流用不可）。`ANTHROPIC_API_KEY` はこれらと異なり流用可。

---

## 8. コスト目安

従量課金（pay-as-you-go、USD 建て）。以下は目安であり、最新は公式の料金ページを参照する。Opus 4.7 は新しい tokenizer のため、同じ文章で最大 35% 程度トークン数が増える点に注意。

| モデル（一例） | 入力 / 100 万トークン | 出力 / 100 万トークン |
|---|---|---|
| Claude Opus 4.7 | $5 | $25 |
| Claude Sonnet 4.6 | $3 | $15 |
| Claude Haiku 4.5 | $1 | $5 |

- **prompt caching**: キャッシュ読み取りは入力単価の 0.1x（最大 90% 程度の入力コスト削減）
- **Batch API**: 入力・出力とも 50% 割引（非同期・即時性不要の処理向け）
- コスト管理は §4-2 の Workspace 単位の spend limit と通知で行う

> 料金は目安。正本は公式の料金ページ。<https://platform.claude.com/docs/en/about-claude/pricing>（一般向けは <https://claude.com/pricing>）

---

## 参照した公式ドキュメント

- Quickstart（キー取得・`ANTHROPIC_API_KEY` 設定・`ant` CLI）: <https://platform.claude.com/docs/en/docs/quickstart>
- Admin API（新規キー作成は不可・既存キー管理のみ）: <https://platform.claude.com/docs/en/api/administration-api>
- Workspaces（作成・workspace スコープキー・spend limit / rate limit）: <https://support.claude.com/en/articles/9796807-creating-and-managing-workspaces>
- API key best practices（サーバー専用・暗号化シークレット・90 日ローテーション・漏洩時 revoke）: <https://support.claude.com/en/articles/9767949-api-key-best-practices-keeping-your-keys-safe-and-secure>
- Pricing: <https://platform.claude.com/docs/en/about-claude/pricing>
- Railway CLI variable: <https://docs.railway.com/cli/variable>
