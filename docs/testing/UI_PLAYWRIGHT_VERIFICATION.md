# UI Playwright Verification

UI 変更後に Codex / 開発者が毎回同じ流れで見た目確認を行うための手順です。

- 目的: 「対象ページを開いて desktop / mobile の見た目を確認し、スクリーンショットを残す」ことを標準化する
- 対象: `src/components/`、`src/app/**/page.tsx`、主要導線の UI 改修
- 前提: `npm install` 済み、必要なら `.env.local` を用意、`npm run dev` で起動できる状態

標準フロー:

1. UI 実装前に `npm run ui:preflight -- <route> --surface=marketing|product [--auth=none|guest]`
2. preflight の Markdown を会話、PR 本文、作業ログのいずれかに残す
3. UI 実装を行う
4. 実装後に `npm run lint:ui:guardrails`
5. 実装後に `npm run test:ui:review -- <route> [--auth=guest]`

---

## 1. 基本コマンド

public ページ:

```bash
npm run test:ui:review -- /
npm run test:ui:review -- /pricing
```

guest 導線:

```bash
npm run test:ui:review -- /companies --auth=guest
npm run test:ui:review -- /dashboard --auth=guest
```

複数ページをまとめて確認:

```bash
npm run test:ui:review -- / /pricing /companies --auth=guest
```

## 2. 実行内容

この command は `e2e/ui-review.spec.ts` を使って次を行う。

- 対象 route を開く
- `desktop` と `mobile` の 2 viewport で表示を確認する
- route が意図せず別ページへ redirect されていないことを確認する
- `main` があれば `main`、なければ `body` の表示を確認する
- `test-results/ui-review/` に screenshot を保存する
- CI では `UI Review Routes` を PR 本文に書けるようにしておき、共有コンポーネント変更時は reviewer が明示的な route を足せるようにする

## 3. 出力先

生成物は Git 管理外の `test-results/ui-review/` に保存される。

例:

- `test-results/ui-review/home-desktop.png`
- `test-results/ui-review/home-mobile.png`
- `test-results/ui-review/companies-desktop.png`

## 4. Codex 運用ルール

- UI 変更後は、変更対象に対応する route を最低 1 つ指定してこの command を実行する。
- Public UI なら public route、product UI なら最も近い操作導線の route を確認する。
- 1 つのコンポーネント変更でも、実際に表示される page 単位で確認する。
- loading UI を触った場合は、first view の blank state が出ていないか、通常ヘッダーや filter 文脈が消えていないか、skeleton が説明カードより先に見えているかを確認する。
- 失敗した場合は screenshot を見る前に、redirect、ロード崩れ、overlay 重なり、mobile 崩れを疑う。

## 5. 補足

- 既定では `playwright.config.ts` の `webServer` により `npm run dev` が自動起動される。
- すでに別ターミナルでアプリを起動している場合は、そのまま再利用される。
- 別の URL を使いたい場合は `PLAYWRIGHT_BASE_URL` を使う。
- 追加の visual regression snapshot 比較は v1 では行わない。

## 6. ログイン必須の会話 UI（志望動機・ガクチカ深掘りなど）

`useAuth().isAuthenticated` は **Better Auth のユーザー（`session.user`）のみ** true です。`--auth=guest` の ui:review では、これらのページは **ログイン誘導カード**だけが写り、**チャット本体は表示されません**。

会話レイアウトの mobile / desktop をスクリーンショットで確認するには、次のいずれかを使います。

1. **環境変数 `PLAYWRIGHT_AUTH_STATE`**  
   `playwright.config.ts` が設定済みの `storageState` を読み込みます。Google ログイン済みの state を取得する例は [`docs/release/PRODUCTION.md`](../release/PRODUCTION.md) と `scripts/release/capture-google-storage-state.sh` を参照。

   ```bash
   export PLAYWRIGHT_AUTH_STATE=/path/to/storage-state.json
   PLAYWRIGHT_SKIP_WEBSERVER=1 npm run test:ui:review -- /gakuchika/your-id /companies/your-id/motivation
   ```

2. **E2E でセッションをモック**  
   `e2e/fixtures/auth.ts` の `mockAuthenticatedUser` で `**/api/auth/get-session` を差し替え、会話 API を `page.route` でモックする（`e2e/motivation.spec.ts` のパターン）。

3. **手動**でブラウザ幅を 390px 前後にし、ログイン後に該当 route を開いて確認する。
