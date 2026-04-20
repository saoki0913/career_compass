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

## Codex CLI 自動連携ルール

Codex CLI (GPT-5.4) を以下の条件で呼び出す。A は PreToolUse hook で強制、B・C は行動指示。
手動フォールバック: `/codex-plan-review`, `/codex-implement`, `/codex-post-review` は引き続き手動でも使用可能。

### A. 設計レビュー — Codex plan_review（hook 強制）

ExitPlanMode の PreToolUse hook (`exit-plan-codex-gate.sh`) がフラグ未設定時にブロックする。以下の手順は省略できない。

1. AskUserQuestion で「Codex plan review を実行しますか？」とユーザーに確認する
2. ユーザーが承認した場合:
   a. プラン内容を `/tmp/codex-ctx-$(date +%s).md` に書き出す（`umask 077` で作成し、読み取り後に削除する。機密情報・secrets パスを含めない）
   b. 通常は `bash scripts/codex/delegate.sh plan_review --context-file <path>` を実行する（default 3600s）。長時間タスクのみ `--timeout 7200` を明示する
   c. 最新の handoff ディレクトリを特定する: `ls -td .claude/state/codex-handoffs/plan_review-*/ | head -1`
   d. `meta.json` の `status` フィールドで成否を判定する（終了コードだけで判定しない。`PARSE_FAILURE` は exit 0 で返る場合がある）
   e. `result.md` を Read し、Codex の findings を自身の判断と統合してプランに反映する
   f. Status 判定:
      - **PASS / PASS_WITH_CONCERNS** → 指摘を注記してプラン確定
      - **NEEDS_REVISION** → severity=high の指摘をプランに反映
      - **TIMEOUT / CODEX_ERROR / PARSE_FAILURE** → 失敗をプランに注記し、Claude 単独判断で続行
3. ユーザーがスキップした場合:
   - プランに「Codex レビュー: ユーザーによりスキップ」と記録する
4. **実装委譲の判断** — AskUserQuestion で「この実装を Codex に委譲しますか？」と確認する。プランの変更規模・Section C-1 の閾値・C-2 の禁止条件を踏まえ、以下の情報を提示する:
   a. **委譲スコープ**: 変更対象ファイル一覧と推定変更行数
   b. **推奨 Codex エージェント**: 変更対象から最適な `.codex/agents/*.toml` のエージェントを提案（例: fastapi-developer, nextjs-developer）
   c. **コンテキスト準備計画**: Section C-4 のどの要素を含めるか（対象コード / 関連パターン / ライブラリ docs / テスト期待値）を変更の複雑度に応じて提案
   d. **推定所要時間**: Codex 実行の目安時間（小: ~5min, 中: ~15min, 大: ~30min）
   e. **委譲戦略オプション**: 一括委譲 vs 分割委譲（ファイル群ごとに複数回）の推奨
5. ユーザーの回答に応じて:
   - **委譲する** → 承認内容（スコープ・エージェント・コンテキスト計画）をプランに記録。ExitPlanMode 後に Section C のフローで実行する
   - **委譲しない** → プランに「Codex 委譲: ユーザーにより見送り」と記録。ExitPlanMode 後に Claude が直接実装する
   - **一部のみ委譲** → 委譲範囲と Claude 実装範囲をプランに記録
6. フラグを設定する: `touch ~/.claude/sessions/career_compass/codex-plan-checkpoint-$SESSION_ID`
7. ExitPlanMode を呼ぶ（フラグが存在すれば hook が許可する）

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
3. 該当時: `bash scripts/codex/delegate.sh post_review` を実行
4. 最新の handoff ディレクトリを特定する: `ls -td .claude/state/codex-handoffs/post_review-*/ | head -1`
5. `meta.json` の `status` フィールドで成否を判定し、`result.md` を Read する
6. Status 判定（`meta.json` の `status` に基づく）:
   - **APPROVE** → commit を続行
   - **REQUEST_CHANGES** で severity=high → 指摘を修正してから commit
   - **REQUEST_CHANGES** で severity=medium/low のみ → 指摘を commit メッセージに記録し commit 続行
   - **NEEDS_DISCUSSION** → ユーザーに AskUserQuestion で相談
   - **TIMEOUT / CODEX_ERROR / PARSE_FAILURE** → Claude 自身の code-reviewer skill でレビューし、commit 続行
7. 閾値未満の場合: Codex レビューをスキップし通常通り commit

### B-2. Auto Commit & E2E Verify Workflow

機能実装・改善が完了したら、自動でステージ → E2E テスト → コミット → プッシュを行う。回帰を防ぐ最後の砦。

**正しい順序: stage → test → commit → (ユーザー確認) → push**

pre-commit フック (`enforce-local-ai-e2e.mjs`) がステージ済みファイルの `snapshotHash` とマニフェストを照合する。テスト実行でマニフェストが生成されるため、この順序でなければコミットがブロックされる。

**push は常にユーザー確認必須**: `git push` は GitHub Actions CI 全スイート + Staging デプロイを発火するため、AskUserQuestion で必ずユーザーに確認してから実行する。確認時にはプッシュ対象のコミット一覧（`git log origin/develop..HEAD --oneline`）を提示する。

**実行フロー**:

1. `git add <対象ファイル>` で全変更をステージ
2. E2E スコープ判定: ステージ済みファイルで `resolveE2EFunctionalScope()` を呼ぶ（SSOT: `src/lib/e2e-functional-features.mjs`）
3. `shouldRun: false` → Section B の閾値チェック → コミット → **ユーザーに push 確認**
4. `shouldRun: true` → `make test-e2e-functional-local AI_LIVE_LOCAL_FEATURES={features}` を実行
5. 全 pass → Section B の閾値チェック（Codex post_review）→ コミット → **ユーザーに push 確認**
6. いずれか fail:
   a. エラーを分析し修正
   b. 修正ファイルを `git add` で追加ステージ
   c. スコープを **再判定**（初回結果を再利用しない）
   d. 失敗 feature + 新規該当 feature を再テスト（**1 回のみ**）
   e. 再テスト pass → Section B → コミット → **ユーザーに push 確認**
   f. 再テスト fail → ユーザーに報告（コミットしない）

**注意事項**:
- `git push origin develop` は AskUserQuestion でユーザー承認を得てから実行する。自動 push は禁止
- `es-review` feature は `playwrightStatus === "passed"` も必要
- Codex `post_review`（Section B）は E2E 通過後、コミット直前に実行。修正分もレビュー対象になる
- `tools/resolve-e2e-functional-scope.mjs` は `git diff HEAD` を使うため、ステージ前に unstaged changes がないことを前提とする
- E2E スコープ判定で feature にマッチしない functional 変更はコミット + プッシュ可（pre-commit hook が最終判定）
- マニフェスト: `backend/tests/output/local_ai_live/status/{feature}.json`

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
2. `bash scripts/codex/delegate.sh implementation --context-file <path>` を実行
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
