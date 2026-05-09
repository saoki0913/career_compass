# MCP サーバー設定ガイド

このプロジェクトで現在有効な MCP（Model Context Protocol）サーバーの設定と、Notion ベースの参考 ES / Prompt Registry の取り込み手順をまとめます。

> Claude Code ハーネス全体（agents / skills / hooks / MCP / commands）の詳細リファレンスと運用ガイドは [`docs/ops/AI_HARNESS.md`](../ops/AI_HARNESS.md) を参照してください。本ドキュメントは MCP と Notion 取り込み手順のみを扱います。

## 目次
1. [現在有効な MCP サーバー](#現在有効な-mcp-サーバー)
2. [Database（Supabase/PostgreSQL）](#database-supabasepostgresql)
3. [Notion 参考 ES の取り込み](#notion-参考-es-の取り込み)
4. [Notion Prompt Registry の同期](#notion-prompt-registry-の同期)
5. [トラブルシューティング](#トラブルシューティング)
6. [参考リンク](#参考リンク)

---

## 現在有効な MCP サーバー

### Project scope: `.mcp.json`

Claude Code / Cursor 向けにリポジトリへ commit されている MCP は **playwright** と **notion** の 2 つです。Codex は起動時ハング回避を優先し、`.codex/config.toml` の同名エントリを `enabled = false` にしています。

```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp", "--headless"],
      "env": {}
    },
    "notion": {
      "type": "http",
      "url": "https://mcp.notion.com/mcp"
    }
  }
}
```

- **playwright**: Claude Code / Cursor では `ui-designer` / `test-automator` からの interactive な browser 操作（`mcp__playwright__*` ツール群）。Codex では常時 MCP ではなく、UI 確認や E2E のタイミングで `npm run test:ui:review -- <route>`、`npx playwright test ...`、Browser Use / Playwright skill を使う。関連: [`docs/testing/UI_PLAYWRIGHT_VERIFICATION.md`](../testing/UI_PLAYWRIGHT_VERIFICATION.md)
- **notion**: Notion Prompt Registry と参考 ES Database の取得に使う HTTP 型 MCP。Codex では常時無効化し、後段の「Notion 参考 ES の取り込み」「Notion Prompt Registry の同期」節の作業時だけ一時的に有効化する。初回接続時に Notion OAuth フローで承認する。

### User scope（リポジトリ外）

個人環境の user scope には **context7 MCP** を設定しています。

- **Claude Code**: `~/.claude/settings.json` が正本。`mcp__context7__*` ツール群として利用する。
- **Codex**: `~/.codex/config.toml` が正本。通常起動では `context7` を `enabled = false` にし、必要時だけ明示的に有効化する。
- **用途**: Claude / OpenAI / FastAPI / Next.js / Drizzle などライブラリ・フレームワークの最新ドキュメントを取得する。Codex worker へ委譲する場合は、親セッションで取得した docs を context file に含め、worker 側では MCP を起動しない。
- **管理**: 個人の user scope 設定はリポジトリに commit しない。

### 導入していない MCP と理由

Supabase / Railway / Vercel / GitHub / Stripe / OpenAI Developer Docs は MCP を導入せず、CLI または公式 docs 検索を直接利用する方針です。理由と許可 / 禁止操作は [`docs/ops/CLI_GUARDRAILS.md`](../ops/CLI_GUARDRAILS.md) を、全体方針は [`docs/ops/AI_HARNESS.md`](../ops/AI_HARNESS.md) 6.3 節を参照してください。`gh auth token` や OAuth token、provider secrets は config・ログ・handoff に残しません。

---

## Database (Supabase/PostgreSQL)

このプロジェクトのメイン DB は Supabase (PostgreSQL) です。

開発・デバッグは以下で行えます:
- Supabase Dashboard の SQL Editor
- ローカルから `psql "$DIRECT_URL"`（Direct connection 推奨）

MCP 経由で DB を操作したい場合は、PostgreSQL 対応の MCP Server を利用し、接続情報として `DIRECT_URL` を渡してください。現状はリポジトリレベルでの MCP 設定は行っていません。

---

## Notion 参考 ES の取り込み

ES 添削の benchmark に使う参考 ES は、Notion Database を正本として管理し、必要時にローカル JSON へ一括取り込みします。

詳細手順は [NOTION_REFERENCE_ES.md](./NOTION_REFERENCE_ES.md) を参照してください。

要点:

1. Notion Database に参考 ES を保存する
2. Notion MCP で Database query 結果 JSON を取得する
3. 正規化が必要な場合は `backend/app/prompts/reference_es_importer.py` の処理を使って one-off で取り込む

出力先:

- `backend/app/reference/es_review/<template>/references.jsonl`
- `backend/app/reference/es_review/<template>/references.jsonl`

---

## Notion Prompt Registry の同期

Notion を prompt 正本として扱う半自動運用では、Prompt Registry Database の内容を generated JSON に同期してからアプリが読み込みます。

基本コマンド:

```bash
npm run prompts:sync -- --dry-run
npm run prompts:sync -- --apply
```

必要な環境変数:

- `NOTION_TOKEN`
- `NOTION_PROMPT_REGISTRY_DATABASE_ID`

Codex / MCP 経由で raw JSON を取得済みなら、offline でも同期できます。

```bash
npm run prompts:sync -- --input /tmp/notion-prompt-registry.json --apply
```

出力先:

- `backend/app/prompts/generated/notion_prompts.json`

---

## トラブルシューティング

### MCP サーバーが起動しない

1. Node.js バージョン確認: `node -v`（18 以上推奨）
2. `.mcp.json` の JSON 構文エラー確認
3. Claude Code を再起動して MCP 承認プロンプトが出るか確認

### Codex 起動時に MCP で止まる

1. `codex mcp list` で `supabase` / `github` / `openaiDeveloperDocs` / `notion` / `playwright` が disabled になっているか確認
2. `context7` も通常起動では `~/.codex/config.toml` で `enabled = false` にする
3. `scripts/codex/delegate.sh` 経由の worker 実行では `--ignore-user-config` が付いていることを確認する
4. 固まった Codex プロセス配下に残った MCP 子プロセスがあれば Codex を終了して再起動する

既存の対話型 Codex session は、設定変更前に作成した MCP manager と子プロセスを保持している場合がある。`enabled = false` に変更しても、既に spawn 済みの `context7-mcp` / `playwright-mcp` / `github-mcp-server` は自動では終了しない。

確認:

```bash
ps -ef | rg 'codex|context7|playwright-mcp|github-mcp-server|@playwright/mcp|@upstash/context7-mcp'
```

対応は、子 MCP だけを直接 kill する前に、まず古い親 Codex session を終了する。親が生きている状態で子 MCP だけを kill すると、親が再 spawn する可能性がある。親終了後に残った孤児プロセスだけを `ps` で再確認してから終了する。

### MCP の冗長起動と RMCP 実験クライアント

Codex は enabled な MCP server を session 起動時に接続しようとする。subagent / child session / `codex exec --ephemeral` は親 session の MCP 接続を再利用せず、別の MCP manager を初期化する場合がある。そのため、`context7` を常時 `enabled = true` にすると、1 つの作業中でも MCP server が複数回起動し、起動待ちや残存子プロセスの原因になる。

`experimental_use_rmcp_client = true` も stdio MCP server の起動フリーズ要因になりうるため、Codex では無効化する。

**修正方法**: `~/.codex/config.toml` の先頭行を以下に設定する:

```toml
experimental_use_rmcp_client = false
```

Codex の `context7` は通常 disabled にする:

```toml
[mcp_servers.context7]
enabled = false
required = false
startup_timeout_sec = 10
tool_timeout_sec = 60
```

`scripts/codex/delegate.sh` の全モード（plan_review / implementation / post_review / imagegen）は `-c experimental_use_rmcp_client=false` と `--ignore-user-config` を付ける。これにより、Claude Code からの委譲 worker は user scope MCP を起動しない。

**関連 GitHub Issues**: [#18068](https://github.com/openai/codex/issues/18068), [#19542](https://github.com/openai/codex/issues/19542), [#16899](https://github.com/openai/codex/issues/16899), [#11489](https://github.com/openai/codex/issues/11489)

### Codex で context7 を使う標準手順

Codex worker / subagent / `codex exec --ephemeral` の中で context7 MCP を起動しない。ライブラリ docs が必要な場合は、親セッションで context7 または Web 検索を使って必要箇所だけ取得し、委譲用 context file の `Library Reference` セクションに貼る。その context file を `scripts/codex/delegate.sh --context-file <path>` に渡す。

この運用により、Context7 の情報は使い続けつつ、worker ごとの MCP startup と子プロセス再起動を避ける。

### playwright MCP のツールが見えない

1. Claude Code の MCP 承認プロンプトを承認済みか確認
2. `@playwright/mcp` の初回 `npx` ダウンロードが完了しているか確認
3. プロジェクトルートに `.mcp.json` が存在するか確認
4. Codex の場合は MCP ではなく `npm run test:ui:review -- <route>` または `npx playwright test ...` を使う

### context7 MCP が動かない

1. Claude Code なら `~/.claude/settings.json`、Codex なら `~/.codex/config.toml` に context7 の設定が入っているか確認
2. Codex worker に渡す場合は、親セッションで docs を取得して context file に含める
3. 公式 docs（https://code.claude.com/docs/en/mcp）の最新手順と照合
4. 他プロジェクトでも同様に動かないなら user scope 側の問題

---

## 参考リンク

- [MCP 公式ドキュメント](https://modelcontextprotocol.io/)
- [Claude Code MCP 設定](https://code.claude.com/docs/en/mcp)
- [Supabase Docs](https://supabase.com/docs)
- [`docs/ops/AI_HARNESS.md`](../ops/AI_HARNESS.md) — Claude Code ハーネス全体のリファレンス
- [`docs/ops/CLI_GUARDRAILS.md`](../ops/CLI_GUARDRAILS.md) — CLI ガードレール（MCP を導入しない CLI の運用ルール）
