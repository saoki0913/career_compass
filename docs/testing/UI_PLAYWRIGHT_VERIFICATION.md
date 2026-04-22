# UI Playwright Verification

UI 変更後に Codex / 開発者が毎回同じ流れで見た目確認を行うための手順です。

- 目的: 「対象ページを開いて desktop / mobile の見た目を確認し、スクリーンショットを残す」ことを標準化する
- 対象: `src/components/`、`src/app/**/page.tsx`、主要導線の UI 改修
- 前提: `npm install` 済み、必要なら `.env.local` を用意、`npm run dev` で起動できる状態

標準フロー:

1. UI 実装前に `npm run verify:prepare -- --route <route> --surface=marketing|product [--auth=none|guest|mock|real]`
2. 証跡は `.ai/verification/` に保存される
3. UI 実装を行う
4. 実装後に `npm run verify:change -- --route <route> [--auth=guest|mock|real]`
5. 実装後に `npm run verify:manual -- --route <route> [--auth=guest|mock|real]`

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

mock 認証で detail / conversation UI を確認:

```bash
npm run test:ui:review -- /companies/ui-review-company/motivation --auth=mock
```

実ブラウザでログイン済み localhost state を使う:

```bash
npm run auth:save-playwright-state
npm run test:ui:review -- /companies/ui-review-company/motivation --auth=real --headed
```

複数ページをまとめて確認:

```bash
npm run test:ui:review -- / /pricing /companies --auth=guest
```

## 2. 実行内容

この command は `e2e/ui-review.spec.ts` を使って次を行う。

- 対象 route を開く
- `320 / 390 / 768 / 1024 / 1440` の viewport で表示を確認する
- route が意図せず別ページへ redirect されていないことを確認する
- `main` があれば `main`、なければ `body` の表示を確認する
- `document.body.scrollWidth <= window.innerWidth` を確認し、UI 全体の横溢れを検知する
- `test-results/ui-review/` に screenshot を保存する
- CI では `UI Review Routes` を PR 本文に書けるようにしておき、共有コンポーネント変更時は reviewer が明示的な route を足せるようにする
- これは **見た目確認用**。`main` 向けの GitHub required check は `guest-major` / `auth-boundary` / `user-major` / `regression` の Playwright 機能 E2E が正本

### モックログイン E2E（`regression-bugs` など）

- `e2e/fixtures/auth.ts` の `mockAuthenticatedUser` は `/api/auth/get-session` をスタブするだけでなく、プロキシが `/calendar` 等で要求する **Better Auth セッション Cookie**（`better-auth.session_token` / 本番相当なら `__Secure-` 付き）を付与する。Cookie が無いと `/calendar/connect` がログインへリダイレクトされ、カード文言のアサーションが失敗する。
- 企業追加フォームの業界は `src/lib/constants/industries.ts` の正規ラベル（例: `IT・通信`）と一致させる。サジェストだけが非正規名だと Select の値が空のままになる。

### ゲスト major / live AI

- `PLAN_METADATA.guest.gakuchika` が `0` のため、ゲストでガクチカ素材の POST は上限エラー（403）になる。`guest-major` は一覧ページ到達までとし、素材作成は含めない。
- 志望動機の AI 系 API はログイン必須のため、`live-ai-major` のゲスト E2E は現状 `test.skip` としている（復帰時はプロダクト仕様と揃えて再構成する）。

## 3. 出力先

生成物は Git 管理外の `test-results/ui-review/` に保存される。

例:

- `test-results/ui-review/home-desktop.png`
- `test-results/ui-review/home-mobile.png`
- `test-results/ui-review/companies-desktop.png`

## 4. Codex 運用ルール

- UI 変更後は、変更対象に対応する route を最低 1 つ指定してこの command を実行する。
- Public UI なら public route、product UI なら最も近い操作導線の route を確認する。
- detail / conversation UI は `--auth=mock` を使い、代表 route を screenshot review する。
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

1. **`npm run auth:save-playwright-state` を使う**  
   普段の Chrome プロファイルを直接共有せず、copy した profile から `localhost` の Better Auth session を Playwright 用 `storageState` に保存する。保存先は既定で `.ai/auth/playwright-auth-state.json`。

   ```bash
   npm run auth:save-playwright-state
   PLAYWRIGHT_SKIP_WEBSERVER=1 npm run test:ui:review -- /gakuchika/your-id /companies/your-id/motivation --auth=real --headed
   ```

   これは dedicated browser / dedicated context で動くため、通常ブラウザの作業は奪わない。

2. **`npm run test:ui:review -- --auth=mock` を使う**  
   `e2e/ui-review.spec.ts` が `mockAuthenticatedUser` と route fixture を使って、代表的な authenticated UI を screenshot review できる。現状の fixture は `/companies/ui-review-company/motivation` をカバーする。

3. **E2E でセッションをモック**  
   `e2e/fixtures/auth.ts` の `mockAuthenticatedUser` で `**/api/auth/get-session` を差し替え、会話 API を `page.route` でモックする（`e2e/motivation.spec.ts` のパターン）。

4. **`npm run verify:manual -- --route <route> --auth=real`**  
   dedicated browser を開き、目視 checklist を `.ai/verification/` に保存する。

CI では `PLAYWRIGHT_AUTH_STATE` の代わりに non-production の test auth route を使うため、`main` 向け必須チェックで Google storage state は不要です。
