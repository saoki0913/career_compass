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

### User scope: `~/.claude/settings.json`（リポジトリ外）

個人環境の user scope には **context7 MCP** を設定しています。

- **用途**: Claude / OpenAI / FastAPI / Next.js / Drizzle などライブラリ・フレームワークの最新ドキュメントを全プロジェクト共通で注入（`mcp__context7__*` ツール群）。Codex では user scope の context7 だけ常時 MCP として残し、`required = false` と短い startup timeout で起動全体を止めない設定にする。
- **管理**: 個人の `~/.claude/settings.json` が正本。リポジトリでは設定 JSON を管理しない
- **導入**: 各自の環境で `~/.claude/settings.json` を編集。公式手順は https://code.claude.com/docs/en/mcp を参照

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

- `private/reference_es/es_references.json`
- `private/reference_es/raw_notion_dump.json`

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
2. `context7` 以外が enabled なら、CLI 代替できるものは `~/.codex/config.toml` で `enabled = false` に戻す
3. 固まった Codex プロセス配下に残った MCP 子プロセスがあれば Codex を終了して再起動する

### playwright MCP のツールが見えない

1. Claude Code の MCP 承認プロンプトを承認済みか確認
2. `@playwright/mcp` の初回 `npx` ダウンロードが完了しているか確認
3. プロジェクトルートに `.mcp.json` が存在するか確認
4. Codex の場合は MCP ではなく `npm run test:ui:review -- <route>` または `npx playwright test ...` を使う

### context7 MCP が動かない

1. user scope の `~/.claude/settings.json` に context7 の設定が入っているか確認
2. 公式 docs（https://code.claude.com/docs/en/mcp）の最新手順と照合
3. 他プロジェクトでも同様に動かないなら user scope 側の問題

---

## 参考リンク

- [MCP 公式ドキュメント](https://modelcontextprotocol.io/)
- [Claude Code MCP 設定](https://code.claude.com/docs/en/mcp)
- [Supabase Docs](https://supabase.com/docs)
- [`docs/ops/AI_HARNESS.md`](../ops/AI_HARNESS.md) — Claude Code ハーネス全体のリファレンス
- [`docs/ops/CLI_GUARDRAILS.md`](../ops/CLI_GUARDRAILS.md) — CLI ガードレール（MCP を導入しない CLI の運用ルール）
