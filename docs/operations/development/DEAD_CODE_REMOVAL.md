# デッドコード削除手順

## 目的

就活Pass の Web アプリ構成に合わせて、AI エージェントでデッドコード候補を調査し、反証してから安全に削除するための手順を定義する。

削除対象の検出結果はそのまま信じない。現 UI、API、cron、webhook、E2E、scripts、CI、DB migration、docs / public assets からの参照を確認し、「消して問題ない」と反証できたものだけを削除する。

## 対象範囲

- Web FE: `src/app`, `src/components`, `src/hooks`
- Next.js API / BFF: `src/app/api`, `src/bff`, `src/lib`
- FastAPI / AI backend: `backend/app`
- DB / migration: `src/lib/db/schema.ts`, `drizzle_pg`
- Tests / scripts / CI: `e2e`, `*.test.*`, `backend/tests`, `scripts`, `Makefile`, `.github/workflows`
- Docs / SEO / assets: `docs`, `src/app/sitemap.ts`, `src/app/robots.ts`, `public`

iOS / Widget / Watch / Siri はこの repo の通常対象外とし、Web アプリの動線とバックエンド連携に絞る。

## Step 1: 生きているエントリポイントを固定する

最初に、現 UI と外部呼び出しの入口を列挙する。これは全調査担当の共通前提にする。

- UI 入口: `src/app/**/page.tsx`, `layout.tsx`, navigation、CTA、モーダル、設定画面、marketing LP。
- API 入口: `src/app/api/**/route.ts`, `backend/app/routers/**`。
- 非画面入口: cron、Stripe webhook、Google OAuth callback、calendar sync、sitemap、robots、middleware。
- テスト入口: Playwright の直接 URL、AI Live / E2E Functional の feature route、Vitest / pytest の対象ファイル。
- 運用入口: `Makefile`, `package.json` scripts, `scripts/**`, `.github/workflows/**`。

補助コマンド:

```bash
npm run deadcode
rg --files src/app src/components src/hooks src/bff backend/app e2e backend/tests scripts .github docs public
rg "src/app/api|backend/app|AI_LIVE_LOCAL_FEATURES|test:e2e|webhook|cron|sitemap|robots" package.json Makefile scripts .github docs e2e
```

`npm run deadcode` は候補抽出の補助であり、削除判断の正本にはしない。

## Step 2: 6領域で並列調査する

各担当には、コードを書き換えず、削除候補・参照根拠・不明点だけを返すよう指示する。

調査担当向けテンプレート:

```text
編集は禁止です。担当領域のデッドコード候補を調査し、削除候補、参照根拠、残すべき理由、不明点だけを返してください。
候補は「どこからも呼ばれていない」だけでなく、動的参照・テスト・scripts・CI・docs・migration からの参照も確認してください。
```

推奨分担:

| 担当 | 主な対象 |
|------|----------|
| Web FE | `src/app`, `src/components`, `src/hooks`, UI assets |
| Next API / BFF | `src/app/api`, `src/bff`, `src/lib/auth`, `src/lib/csrf`, `src/lib/credits` |
| FastAPI / AI backend | `backend/app/routers`, `backend/app/services`, `backend/app/utils`, `backend/app/prompts` |
| DB / migration | `src/lib/db/schema.ts`, `drizzle_pg`, DB関連 scripts |
| Tests / scripts / CI | `e2e`, `*.test.*`, `backend/tests`, `scripts`, `Makefile`, `.github/workflows` |
| Docs / SEO / assets | `docs`, `src/app/sitemap.ts`, `src/app/robots.ts`, `public` |

## Step 3: 削除候補を反証する

Step 2 の候補を別担当に渡し、「本当に消して問題ないか」を反証する。反証できない候補は削除しない。

反証担当向けテンプレート:

```text
あなたの役目は、削除候補が本当に消して問題ないか反証することです。
動的参照、非コード参照、テスト・seed・migration 経由、他の実行入口、DB の不可逆変更を重点的に探してください。
消してよいと判断する場合も、確認した検索範囲と根拠を明記してください。
```

重点観点:

- 動的参照: `import()`, route params、URL 文字列、API path 文字列、webhook path、cron path。
- 非コード参照: `Makefile`, `package.json`, `scripts`, `.github/workflows`, launchd 設定、docs。
- テスト参照: Playwright の直接遷移、AI Live feature、Vitest、pytest、snapshot。
- DB参照: migration、seed、repair script、production drift check、analytics query。
- 事業ルール: guest / user 両対応、成功時のみクレジット消費、JST 基準、締切承認必須。
- 外部連携: Stripe、Google OAuth、Google Calendar、Supabase、Railway、Vercel。
- 不可逆性: `DROP COLUMN`, `DROP TABLE`, migration 履歴の書き換え。

## Step 4: コードから削除し、DBは最後に扱う

削除順序は、型崩れと migration 事故を避けるために固定する。

1. UI / component / hook / helper など、上位の未使用コードから削除する。
2. 呼び出しが消えた Next.js API / BFF / FastAPI service を削除する。
3. 関連テストは、削除対象のテストだけを削除する。残す機能のテストは消さない。
4. DB schema / migration は最後に扱う。
5. DB の破壊的変更は既存 migration を書き換えず、新規 migration として追加する。

DB を先に落とすと、型生成・ビルド・E2E の広範囲が失敗しやすい。必ずコード側の参照を整理してから `src/lib/db/schema.ts` と `drizzle_pg` を更新する。

## Step 5: 削除前後で同じテストを通す

削除前に、残したい機能のテストを一度通す。削除後に同じテストを再実行し、挙動が変わっていないことを確認する。

基本確認:

```bash
npm run deadcode
npx tsc --noEmit
npm run lint
npm run test:unit
```

影響範囲別の確認:

```bash
npm run test:e2e:major
npm run test:e2e:functional:local:es
npm run test:e2e:functional:local:motivation
npm run test:e2e:functional:local:gakuchika
npm run test:e2e:functional:local:interview
npm run test:e2e:functional:local:company-info-search
npm run test:e2e:functional:local:selection-schedule
npm run test:e2e:functional:local:rag-ingest
```

UI を変更した場合:

```bash
npm run lint:ui:guardrails
npm run test:ui:review -- <route>
```

DB を変更した場合:

```bash
npm run db:generate
npm run db:migrate
```

本番 DB や secret 実値は直接読まない。環境変数の確認は repo の `--check` 系 script に限定する。

## Step 6: 実画面で動作確認する

主要導線を Chrome / Playwright / MCP で操作し、UI と API の両方を確認する。

- guest と login user の主要導線。
- ES 添削、志望動機、ガクチカ、面接、企業管理、締切、通知、カレンダー連携。
- API 失敗時の UI 表示。raw error や例外文字列を出していないこと。
- 外部 I/O / AI 実行中の loading、完了通知、失敗通知。
- mobile viewport での主要画面と横スクロール。

## 削除してはいけない典型例

- URL 文字列や webhook path でしか参照されない route。
- Playwright / AI Live が直接叩く画面や API。
- migration や repair script のために残している schema 互換コード。
- docs / sitemap / robots / public asset から参照される marketing LP 資産。
- guest identity、credit reservation、deadline approval、JST reset に関わる防御的コード。
- 既存 migration ファイル。履歴修正ではなく、新規 migration で差分を表現する。

