# Career Compass (就活Pass) - Agent Instructions

## Project Overview
- 就活支援アプリ「就活Pass」。
- 主機能は ES 添削、志望動機作成、ガクチカ深掘り、企業管理、締切管理、通知、Google カレンダー連携。
- UI は Next.js App Router、AI 処理と検索基盤は Python FastAPI が担う。

## Target Users
- 情報整理に不安があり、就活塾には行かずに進めたい学生
- 超高難度選考向けの専門対策より、迷わず進める管理体験を重視する層

## Tech Stack
- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui
- Backend API: Next.js App Router (`src/app/api`)
- AI Backend: FastAPI (`backend/app`)
- Auth: Better Auth + Google OAuth
- Database: Supabase (PostgreSQL) + Drizzle ORM
- Payments: Stripe
- Search / RAG: ChromaDB, BM25, Cross-Encoder reranking
- Testing: Playwright, Vitest, pytest

---

## Subagent Routing

タスクを始める前に、対象領域に合うサブエージェントへ自動委譲する。各 agent の詳細は `.claude/agents/<name>.md` を参照。

| 変更対象 / 作業内容 | 委譲先 subagent |
|---|---|
| `backend/app/prompts/**`, `backend/app/utils/llm.py`, プロンプト品質 / A/B | `prompt-engineer` |
| `backend/app/utils/(vector_store\|hybrid_search\|embeddings\|text_chunker\|content_classifier).py` | `rag-engineer` |
| `backend/app/utils/(bm25_store\|reranker\|japanese_tokenizer\|web_search).py`, `improve-search` | `search-quality-engineer` |
| `backend/app/routers/**`, `backend/app/main.py`, `backend/app/utils/llm_streaming.py`, SSE ストリーミング | `fastapi-developer` |
| `src/components/**`, `src/app/**/(page\|layout\|loading).tsx` のビジュアル, marketing LP | `ui-designer` |
| `src/app/**/(page\|layout).tsx` のロジック, `src/app/api/**`, `src/hooks/`, SWR | `nextjs-developer` |
| `src/lib/db/schema.ts`, `drizzle_pg/`, マイグレーション, インデックス | `database-engineer` |
| `src/lib/auth/**`, `src/lib/csrf.ts`, `src/lib/trusted-origins.ts`, `src/app/api/webhooks/stripe/**`, `src/lib/stripe/`, `src/app/api/credits/` | `security-auditor` |
| `scripts/release/**`, `Makefile` の release targets, `make deploy`, provider CLI 操作 | `release-engineer` |
| `e2e/**`, `backend/tests/**`, `src/**/*.test.ts`, AI Live テスト | `test-automator` |
| コードレビュー、500 行超ファイルへの追加、dead code 検出 | `code-reviewer` |
| architecture gate, OMM review, PRD / RFC 作成, 大規模クロスカット | `architect` |
| マーケ LP 改善, UX / 競合 / SEO / 無料ツール戦略 | `product-strategist` |

ユーザーが「本番にデプロイして」「公開して」「リリースして」「ship it」等の自然文で依頼した場合も `release-engineer` に委譲する。

docs-only、test-only、局所的な文言修正、明らかな局所バグ修正では委譲を省略してよい。

---

## Business Rules

1. **成功時のみ消費** — クレジットや無料回数は、対象処理が成功したときだけ消費する。
2. **JST 基準** — 日次リセット、通知、締切関連の基準時刻は `Asia/Tokyo`。
3. **締切は承認必須** — 自動抽出結果をそのまま締切として確定しない。
4. **非同期 UX** — 外部 I/O や AI 実行は、処理中表示、完了通知、失敗通知まで含めて設計する。
5. **guest / user の両対応** — 多くの API はログインユーザーとゲストの両方を扱う。owner 判定は `userId` と `guestId` の排他的管理を前提にする。ゲスト識別は browser-visible header ではなく `guest_device_token` cookie を正とする。

---

## User Confirmation Rules

ユーザーへの確認が必要な場面では、**必ず `AskUserQuestion` ツールを使う**。plain text で「〜しますか？」と書いて応答を待つことは禁止する。テキスト出力で質問すると自走が止まり、ユーザーが手動入力するまでブロックされるため。

- コミット確認、push 確認、E2E 実行確認、Codex レビュー確認など、すべての Yes/No 判断は `AskUserQuestion` で行う
- 確認待ちの間も、独立した作業（リサーチ、型チェック、lint 等）があれば並行して進める
- 確認不要で自明な場合（CLAUDE.md のルールで自動続行が明記されている場合）はそもそも確認を挟まない

この規約は `.claude/hooks/stop-plaintext-confirm-guard.sh` が Stop hook で機械的に enforce する。transcript の最終 assistant メッセージに `commit/push/E2E/デプロイ/リリース` 系のトピック語と `しますか?/指示があれば/未完了` 系の確認・保留語が両方含まれる場合、Stop をブロックし AskUserQuestion での再提示を要求する。

---

## Prompt Edit Confirmation Rules

`backend/app/prompts/**` または `backend/app/utils/llm*.py` を Edit/Write した場合、**毎回** AskUserQuestion でユーザーの確認を取る。

- `post-edit-dispatcher.sh` (PostToolUse) がプロンプトファイル編集を検出し、`prompt-review-pending-{SESSION_ID}` フラグを作成する
- `prompt-edit-confirm-guard.sh` (PreToolUse) が次の Edit/Write をブロックし、AskUserQuestion での確認を強制する
- ユーザーが承認 → `touch ~/.claude/sessions/career_compass/prompt-review-confirmed-{SESSION_ID}` → 次の Edit/Write が通過
- 別のプロンプトファイルを編集すると pending フラグがリセットされ、再度確認が必要

---

## Band-Aid Guard Rules

Edit/Write でその場しのぎのコードパターンを追加しようとした場合、`bandaid-guard.sh` (PreToolUse) がブロックし、AskUserQuestion でユーザー確認を強制する。非コードファイル（`.md`, `.json`, `.yml` 等）はスキップされる。

**検知パターン**: `@ts-ignore`, `@ts-expect-error`, `as any`, `as unknown`, 空の catch ブロック, `jest.mock`/`vi.mock`（テスト外）, `.skip`/`.only`/`xit`/`xdescribe`, `TODO`/`FIXME`/`HACK` コメント, `console.log`

**例外**: テストファイル（`*.test.*`, `*.spec.*`, `e2e/**`, `backend/tests/**`）では `@ts-expect-error`, `jest.mock`, `vi.mock` は免除。`.skip`/`xit` 等のテスト迂回は免除されない。

**承認**: ファイル単位。`echo "<path>" >> ~/.claude/sessions/career_compass/bandaid-approved-{SESSION_ID}` で承認リストに追加。同一ファイルの以降の band-aid は許可されるが、別ファイルは再確認。

---

## Core Architecture Notes

非自明なフローのみ記載。詳細は `docs/features/` と `.omm/` を参照。

- **Company Data Flow** — Next API で auth / ゲスト identity と所有権を検証し、企業情報取得と corporate info enrichment は FastAPI へ proxy する。RAG ソース URL、PDF ingest ジョブ、取得時刻は Postgres に保存。締切抽出結果はユーザー承認を経て初めて確定する。
- **ES Review Flow** — ドキュメントは Postgres に版管理され (`src/app/api/documents`)、レビューは `src/app/api/documents/[id]/review/stream` の SSE。成功時のみクレジット消費。
- **Motivation / Gakuchika Flow** — 会話開始 / stream / draft 生成の 3 エンドポイント構成。共通 chat-like UI は `src/components/chat/`。
- **Request Identity** — 認証済みユーザーは Better Auth session、ゲストは HttpOnly cookie から解決し、proxy が内部 `x-device-token` を再構成する。共通化済みロジックは `src/app/api/_shared/request-identity.ts`。

---

## API / Error Handling Rules

- Next API は `createApiErrorResponse()` を使って構造化エラーを返す。`userMessage` と `action` を含め、開発者向け詳細は dev 環境の `debug` にのみ出す。`X-Request-Id` / `requestId` を付与する。
- フロントでは `parseApiErrorResponse()` と `AppUiError` を使う。raw error や例外文字列を UI にそのまま出さない。
- secrets 正本は `codex-company/.secrets/career_compass`。**実ファイル (`*.env`) を直接 Read しない**。インベントリ確認は `zsh scripts/release/sync-career-compass-secrets.sh --check` のみ。

---

## UI Change Workflow (hard rules)

`src/components/**`, `src/app/**/(page|layout|loading).tsx`, `src/components/skeletons/**` を変更する前後で必ず実行する:

1. 事前: `npm run ui:preflight -- <route> --surface=marketing|product [--auth=none|guest]` → Markdown 出力を会話 / PR / 作業ログに残す
2. 変更中: `npm run lint:ui:guardrails`
3. 事後: `npm run test:ui:review -- <route>`

参照: `docs/architecture/FRONTEND_UI_GUIDELINES.md`, `DESIGN.md`, `docs/marketing/LP.md`。PR の `UI Review Routes` (`.github/PULL_REQUEST_TEMPLATE.md`) は埋める。既存画面では既存のデザインシステムを優先する。

---

## Marketing LP 追加・変更時のチェックリスト

新規 SEO LP を追加するとき (`src/app/(marketing)/<slug>/page.tsx`)、以下を必ず守る:

1. `createMarketingMetadata({ path })` で canonical 自己参照 metadata を発行する
2. FAQ は `src/lib/marketing/<slug>-faqs.ts` に SSOT 分離し、`FaqJsonLd` で埋め込む（FAQ rich results は gov/医療限定で対象外だが、可視 FAQ セクションの構造化データ整理として維持）
3. `src/app/sitemap.ts` に URL を追加する
4. `src/app/robots.ts` の allow に URL を追加する
5. `docs/marketing/README.md` のデプロイ後確認 URL 一覧とキーワード戦略テーブルを更新する
6. 訴求は `backend/app/routers/` と `docs/features/*.md` にある実装のみ（景表法 / 優良誤認回避）。内定率・通過率・無制限無料・AggregateRating などは書かない
7. 既存 LP の primary keyword と食い合わないように title / H1 / 内部リンクの語彙を排他分離する
8. 2 階層以上のページは `BreadcrumbJsonLd`（`src/components/seo/BreadcrumbJsonLd.tsx`）を付ける。1 階層 LP は `BreadcrumbList` 対象外のため付けない

---

## Key Commands

```bash
# tests (npm run test は存在しない)
npm run test:unit           # Vitest
npm run test:e2e            # Playwright
npm run test:ui:review -- <route>   # UI 変更後の Playwright 確認
npm run test:agent-pipeline # sync-pipeline のスナップショット

# DB (Drizzle)
npm run db:generate         # schema.ts → migration SQL
npm run db:push             # 本番同期（慎重に）
npm run db:migrate
npm run db:studio

# release
make ops-release-check      # 全ローカル変更を含める標準入口
make deploy-stage-all
make deploy                 # staged-only 明示時のみ
```

---

## Bash Tool Timeout Policy

本プロジェクトでは、Bash ツール呼び出し時の `timeout` パラメータを以下のルールで指定する。**指定を省略しない**（省略時のデフォルトが短すぎてコマンドが途中 kill される問題を防ぐ）。

| カテゴリ | 対象パターン | timeout (ms) |
|---|---|---|
| 長時間 (Codex / 全 E2E) | `scripts/codex/delegate.sh *`, `make test-e2e-functional-local`, `run-ai-live-local.sh`, `run-e2e-functional.sh` | `3600000` (60分) |
| 中時間 (個別テスト / ビルド) | `npm run test:e2e*`, `make test-major*`, `npm run build`, `make deploy*` | `600000` (10分) |
| 短時間 (lint / 型チェック / git) | `npm run lint*`, `npx tsc --noEmit`, `git *`, `npm run test:unit` | 指定不要（デフォルト可） |

**判断ルール**: 上記パターンに一致しない場合、実行時間が 2 分を超える可能性があるコマンドには `timeout: 3600000` を指定する。

長時間カテゴリで `--timeout 7200` をスクリプトに渡す場合は、Bash ツール側も `timeout: 7200000` に合わせる。

---

## Codex CLI 自動連携ルール

Codex CLI (GPT-5.5) を以下の条件で呼び出す。`scripts/codex/delegate.sh` は default 3600s で実行し、長時間タスクのみ `--timeout 7200` を使う。A は PreToolUse hook で強制、B・C は行動指示。
手動フォールバック: `/codex-plan-review`, `/codex-implement`, `/codex-post-review` は引き続き手動でも使用可能。

### A. 実装委譲判断 — ExitPlanMode 後 / 実装開始前（hook 強制）

ExitPlanMode は常に許可される（`exit-plan-codex-gate.sh` が `plan-exited` フラグを作成）。
実装開始時の最初の Edit|Write を `impl-start-codex-gate.sh` がブロックし、委譲判断を強制する。

1. Plan 作成・確定後、ExitPlanMode を呼ぶ（ブロックされない）
2. Codex plan review は任意（推奨）:
   - 実行する場合: プラン内容を `/tmp/codex-ctx-$(date +%s).md` に書き出し（`umask 077`、機密情報を含めない）、`bash scripts/codex/delegate.sh plan_review --context-file <path>` を実行する
   - `meta.json` の `status` で成否を判定し、`result.md` の findings をメモに反映する
   - **TIMEOUT / CODEX_ERROR / PARSE_FAILURE** → 失敗を注記し、Claude 単独判断で続行
   - スキップする場合: 省略可
3. 最初の Edit|Write 実行時に `impl-start-codex-gate.sh` がブロック
4. AskUserQuestion で「この実装を Codex に委譲しますか？」と確認する。以下の情報を提示:
   a. **委譲スコープ**: 変更対象ファイル一覧と推定変更行数
   b. **推奨 Codex エージェント**: 変更対象から最適な `.codex/agents/*.toml` のエージェントを提案
   c. **コンテキスト準備計画**: Section C-4 のどの要素を含めるか
   d. **推定所要時間**: Codex 実行の目安時間（小: ~5min, 中: ~15min, 大: ~30min）
   e. **委譲戦略オプション**: 一括委譲 vs 分割委譲の推奨
5. ユーザーの回答に応じて:
   - **委譲する** → 承認内容をメモに記録。Section C のフローで実行する
   - **委譲しない** → 「Codex 委譲: ユーザーにより見送り」と記録。Claude が直接実装する
   - **一部のみ委譲** → 委譲範囲と Claude 実装範囲を記録
6. delegation フラグを設定する: `echo "<decision>" > ~/.claude/sessions/career_compass/codex-delegation-checkpoint-$SESSION_ID`
   （`<decision>` = `delegate` / `no-delegate` / `partial`）
7. Edit|Write を再実行 → hook が delegation checkpoint を検出し許可

### B. コミット前コードレビュー自動化（post_review）

commit を作成する直前に、以下の閾値チェックを行う:

1. `git diff --numstat HEAD` で追跡ファイルの変更行数を、`git ls-files --others --exclude-standard` で未追跡ファイル一覧を取得する
   - **ファイル数**: 追跡ファイルの変更数 + 未追跡ファイル数の合算
   - **行数**: `git diff --numstat` の追加+削除行の合算（未追跡ファイルの行数は含めない）
   - ステージ済みのみでコミットする場合は `git diff --cached --numstat` も併用する
2. 以下のいずれかに該当する場合、自動で Codex レビューを実行:
   - 変更ファイル数 >= 10
   - 変更行数（追加+削除）>= 500
   - hotspot ファイルの変更を含む（正本: `.claude/hooks/lib/skill-recommender.sh` の `HOTSPOT_FILES` 配列）
3. 該当時: `bash scripts/codex/delegate.sh post_review` を実行（Bash timeout: Policy 参照）
4. 最新の handoff ディレクトリを特定する: `ls -td .claude/state/codex-handoffs/post_review-*/ | head -1`
5. `meta.json` の `status` フィールドで成否を判定し、`result.md` を Read する
6. Status 判定（`meta.json` の `status` に基づく）:
   - **APPROVE** → commit を続行
   - **REQUEST_CHANGES** で severity=high → 指摘を修正してから commit
   - **REQUEST_CHANGES** で severity=medium/low のみ → 指摘を commit メッセージに記録し commit 続行
   - **NEEDS_DISCUSSION** → ユーザーに AskUserQuestion で相談
   - **TIMEOUT / CODEX_ERROR / PARSE_FAILURE** → Claude 自身の code-reviewer skill でレビューし、commit 続行
6b. **delegation 確認** — post_review 完了後、AskUserQuestion でユーザーに確認する。post_review の結果サマリ（status / 主要 findings）を含めること:
   - **commit 続行** → `echo "reviewed-proceed" > ~/.claude/sessions/career_compass/codex-commit-delegation-$SESSION_ID`
   - **Codex に修正委譲** → Section C のフローで implementation を実行。完了後 `echo "delegate-fixes" > ~/.claude/sessions/career_compass/codex-commit-delegation-$SESSION_ID`
   - **Claude fallback** — post_review が TIMEOUT/CODEX_ERROR/PARSE_FAILURE の場合、Claude 自身の code-reviewer skill でレビュー後 `echo "fallback-reviewed" > ~/.claude/sessions/career_compass/codex-commit-delegation-$SESSION_ID`

   > **⚠** checkpoint は **最新の post_review handoff より後に作成すること**。stale checkpoint は `commit-codex-gate.sh` が拒否する（`fallback-reviewed` のみ stale 照合を免除）。`skip-review` は廃止済みで受理されない。
7. 閾値未満の場合: Codex レビューをスキップし通常通り commit（`commit-codex-gate.sh` も素通り）

### B-2. Auto Commit & E2E Verify Workflow

機能実装・改善が完了したら、自動でステージ → テスト → コミット → プッシュを行う。回帰を防ぐ最後の砦。

**正しい順序: stage → カテゴリ選択 → テスト実行 → commit → (ユーザー確認) → push**

pre-commit フック (`enforce-local-ai-e2e.mjs` + `security/scan/run-lightweight-scan.sh`) がステージ済みファイルの `snapshotHash` / マニフェスト照合とセキュリティスキャンを行う。テスト実行でマニフェストが生成されるため、この順序でなければコミットがブロックされる。

**push は常にユーザー確認必須**: `git push` は GitHub Actions CI 全スイート + Staging デプロイを発火するため、AskUserQuestion で必ずユーザーに確認してから実行する。確認時にはプッシュ対象のコミット一覧（`git log origin/develop..HEAD --oneline`）を提示する。

**テストカテゴリ 4 層モデル**:

| カテゴリ | 目的 | 実行タイミング | ブロック力 |
|---|---|---|---|
| **E2E Functional** | 機能が壊れていないか（全パターン網羅） | コミット時（該当機能のみ） | Hard block |
| **Quality** | LLM 出力品質、検索品質、RAG 品質 | ユーザー選択時 | Non-blocking |
| **Static Analysis** | lint, 型チェック, 保守性 | コミット時（推奨） | Soft warning |
| **Security** | 脆弱性、secrets 漏洩、AI 生成コード検査 | 全コミット時（軽量） | Hard block (critical) |

**E2E チェック 3 層モデル** (E2E Functional カテゴリ内):

| Layer | 内容 | 失敗時の挙動 |
|---|---|---|
| 1. Hard (blocking) | 禁止語、最低文字数、非空（全機能共通）。ES Review は文字数範囲・未完成末尾・companyless も含む | pytest.fail() → manifest status="failed" → pre-commit hook blocks |
| 2. Soft (non-blocking) | token_coverage (50%)、draft_length 範囲、required_question_groups、focus_tokens/style/RAG (ES Review) | manifest status="passed" + softFailCount>0 → Claude が AskUserQuestion で対応確認 |
| 3. LLM Judge (opt-in) | 5 軸採点。ローカル閾値: all>=2 AND avg>=3.0（CI/staging: all>=3, avg>=3.5） | Quality カテゴリで選択時のみ実行。成功=自動クリア、失敗=AskUserQuestion |

**実行フロー**:

1. `git add <対象ファイル>` で全変更をステージ
2. E2E スコープ判定: ステージ済みファイルで `resolveE2EFunctionalScope()` を呼ぶ（SSOT: `src/lib/e2e-functional-features.mjs`）
3. `shouldRun: false` → Section B の閾値チェック → コミット → **ユーザーに push 確認**
4. `shouldRun: true` → AskUserQuestion (multiSelect: true) でテストカテゴリ選択を提示:
   - 変更検出結果: トリガーされた features 一覧と source（shared-trigger / llm-shared / feature-trigger）
   - チェックボックス選択肢:
     - 「E2E Functional ({features})」（推奨、~3分/feature）
     - 「Quality Tests (LLM 出力品質)」（~10分）
     - 「Static Analysis (lint + 型チェック)」（推奨、~1分）
     - 「Security Scan (Trace-core + secrets)」（推奨、~30秒）
   - ユーザーの回答を checkpoint に記録:
     - format: `e2e-functional=<val>,quality=<val>,static=<val>,security=<val>`
     - e2e-functional: `run:<features>` / `skip`
     - quality: `run` / `skip`
     - static: `run` / `skip`
     - security: `run` / `skip`
   - checkpoint: `~/.claude/sessions/career_compass/test-categories-${SESSION_ID}`
   - この確認フローは `.claude/hooks/test-category-gate.sh` が PreToolUse hook で機械的に enforce する
   - **Judge 伝播**: Quality テストに `with-judge` を含める場合、`LIVE_AI_CONVERSATION_LLM_JUDGE=1` を付加。含めない場合は `LIVE_AI_CONVERSATION_LLM_JUDGE=0` を明示付加する
   → 選択されたカテゴリのテストを実行:
     - E2E: `make test-e2e-functional-local AI_LIVE_LOCAL_FEATURES={features}`
     - Quality: `make test-quality-all` (または feature 別)
     - Static: `npx tsc --noEmit && npm run lint`
     - Security: `bash security/scan/run-lightweight-scan.sh --staged-only --fail-on=critical`
5. テスト結果の処理:
   a. E2E manifest.status === "failed"（ハードチェック失敗）:
      → エラーを分析・修正 → 修正ファイルを `git add` → スコープを **再判定** → 失敗 feature + 新規該当 feature を再テスト（**1 回のみ**）
      → 再テスト pass → Section B → コミット → **ユーザーに push 確認**
      → 再テスト fail → ユーザーに報告（コミットしない）
   b. E2E manifest.status === "passed" AND softFailCount > 0:
      → AskUserQuestion で対応を確認:
        - 「無視してコミット」→ Section B → コミット → **ユーザーに push 確認**
        - 「再実行」→ ステップ 4 に戻る
        - 「修正する」→ 問題を報告
   c. Quality テスト失敗（LLM Judge 含む）:
      → AskUserQuestion で対応を確認（Non-blocking なのでコミット続行可能）
   d. Security scan 失敗 (critical):
      → コミットをブロック。修正後に再スキャン
   e. 全 pass → Section B の閾値チェック（Codex post_review）→ コミット → **ユーザーに push 確認**

**注意事項**:
- `git push origin develop` は AskUserQuestion でユーザー承認を得てから実行する。自動 push は禁止
- `browserRequired: true` の全 feature は `playwrightStatus === "passed"` が必要（Playwright をスキップした場合、pre-commit hook がコミットをブロックする）
- テストカテゴリ選択は `.claude/hooks/test-category-gate.sh` が PreToolUse hook で機械的に enforce する。checkpoint: `~/.claude/sessions/career_compass/test-categories-${SESSION_ID}`
- Codex `post_review`（Section B）は E2E 通過後、コミット直前に実行。修正分もレビュー対象になる
- `tools/resolve-e2e-functional-scope.mjs` は `git diff HEAD` を使うため、ステージ前に unstaged changes がないことを前提とする
- E2E スコープ判定で feature にマッチしない functional 変更はコミット + プッシュ可（pre-commit hook が最終判定）
- マニフェスト: `backend/tests/output/local_ai_live/status/{feature}.json`（softFailCount, softFailReasons, judgeStatus, judgeFailCount を含む）
- pre-commit hook は 2 段階: `enforce-local-ai-e2e.mjs` (E2E マニフェスト) + `security/scan/run-lightweight-scan.sh` (セキュリティ)
- `LLM_JUDGE_LOCAL_MODE=1` は `run-ai-live-local.sh` が自動設定。CI/staging には影響しない

### C. オーケストレーター運用 — Claude 設計 / Codex 実装・レビュー

Claude はオーケストレーター（設計・リサーチ・コンテキスト準備・検証・ユーザー対話）、Codex はワーカー（実装・コードレビュー）として機能する。

#### C-1. 委譲閾値

変更が以下のいずれかに該当する場合、Codex に実装を委譲する:
- 変更ファイル数 ≥ 3
- 変更行数 ≥ 50
- ユーザーが明示的に「Codex に任せたい」と示唆

閾値未満の場合は Claude が直接実装する。

#### C-2. 委譲禁止条件

以下は常に Claude が直接対応する:
- 設計判断・アーキテクチャ変更
- セキュリティ関連（auth / billing / CSRF / webhook）
- プロンプトエンジニアリング（反復的評価が必要）
- release / deploy / provider CLI 操作
- secrets へのアクセスが必要なタスク
- ユーザーとの対話・方向性決定

#### C-3. 閉ループフロー

```
1. [Claude] リサーチ・コンテキスト準備
2. [Claude] リッチコンテキストファイル作成
3. [Codex] implementation (workspace-write)
4. [Claude] 検証 (tsc, unit test, diff review)
5. 不合格 → [Codex] フィードバック付き再委譲 (1回のみ)
6. まだ不合格 → [Claude] 直接修正
7. [Codex] post_review (code-reviewer agent + security)
8. [Claude] Section B-2 (stage → E2E → commit → push)
```

**並列安全性**: Codex 実行中は Claude はファイル編集を行わない。リサーチ・設計・ユーザー対話のみ実施する。

#### C-4. リッチコンテキスト準備

Codex はスキル・Web 検索・サブエージェントを使えない。Claude が委譲前にリサーチを完了し、結果をコンテキストファイルに含める。タスクの複雑度に応じて以下から選択:

| 要素 | 用途 | 含める判断基準 |
|---|---|---|
| 対象ファイルの現在のコード | Codex がファイルを読めないリスクの排除 | 常に含める |
| 関連パターンのコード例 | 既存パターン踏襲を保証 | 類似実装が既にある場合 |
| ライブラリ docs (Context7 / Web 検索) | 最新 API の正しい使用を保証 | 外部ライブラリの新機能を使う場合 |
| テスト期待値 | 品質基準の明確化 | 複雑なロジックや境界条件がある場合 |

コンテキストファイル形式:
```markdown
# Implementation Task: {タスク名}
## Objective
{具体的な目標}
## Files to Modify
{ファイルパスと変更内容}
## Current Code
{対象ファイルの内容}
## Related Patterns
{既存の類似実装}
## Library Reference
{API ドキュメント}
## Test Expectations
{パスすべきテストと条件}
## Constraints
{ビジネスルール・禁止事項}
```

#### C-5. 委譲フロー（手順）

1. リッチコンテキストを `/tmp/codex-ctx-$(date +%s).md` に書き出す（`umask 077`、機密情報を含めない）
2. `bash scripts/codex/delegate.sh implementation --context-file <path>` を実行（Bash timeout: Policy 参照）
3. 最新の handoff: `ls -td .claude/state/codex-handoffs/implementation-*/ | head -1`
4. `meta.json` の `status` で成否を判定し、`result.md` を Read する
5. `git diff` で変更スコープを検証
6. 検証チェックリスト:
   - `npx tsc --noEmit` (型チェック)
   - 関連ユニットテスト実行
   - 変更がスペックと一致するか確認
7. Status 判定:
   - **COMPLETE** + 検証 pass → Section B-2 へ進む
   - **COMPLETE** + 検証 fail → フィードバック付き再委譲（C-6 へ）
   - **PARTIAL** → 不足分を Claude が補完、または再委譲
   - **BLOCKED** → Claude が直接実装にフォールバック
   - **TIMEOUT / CODEX_ERROR / PARSE_FAILURE** → Claude が直接実装にフォールバック

#### C-6. フィードバック付き再委譲（1 回限り）

1. 問題箇所・エラーメッセージ・期待する修正を新しいコンテキストファイルにまとめる
2. `bash scripts/codex/delegate.sh implementation --context-file <path>` を再実行
3. 再委譲結果を同じ検証チェックリストで検証
4. それでも不合格 → Claude が直接修正する。再々委譲はしない

#### C-7. Codex レビュー（実装後）

Codex 実装完了後（Claude 直接実装の場合も Section B の閾値該当時）、Codex の code-reviewer エージェントがレビューする:
- `bash scripts/codex/delegate.sh post_review` を実行
- code-reviewer agent がセキュリティ（OWASP Top 10）+ コード品質を検査
- Section B の Status 判定ルールに従う

---

## Documentation Rules
- 実装判断に効く事実を優先し、古い改善メモや願望ベースの TODO は残さない。
- ドキュメント本文は日本語中心で書く。
- コマンド、パス、識別子、型名、ライブラリ名は英語のまま保つ。
- `AGENTS.md` と `CLAUDE.md` は同内容で保つ。

## Language
- 思考は任意だが、ユーザー向け説明と repo 内ドキュメント更新は日本語を基本にする。
