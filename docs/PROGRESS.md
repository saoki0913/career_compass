# 実装進捗ドキュメント

**最終更新**: 2026-04-28

## 人向け要約（読み始めに）

`docs/SPEC.md` の機能ごとに、**実装済みかどうか**を表形式で追うメモです。プラン別の上限・クレジット付与・料金は **`src/lib/stripe/config.ts`、`src/lib/credits/`、各 `src/app/api/`** を正とし、本表と食い違う場合はコード側の更新が先です。

**凡例**: ✅ 完了 / 🟡 部分実装 / 🔴 未実装 / ⏸️ MVP 除外

---

## 最近の更新

- 2026-04-28: サイドバー検索を展開状態でも結果候補が出る形に修正。2文字以上で `useSearch` がデバウンス検索し、企業/ES/締切候補をドロップダウン表示、候補クリックまたは「すべての結果を見る」で `/search?q=` へ遷移する。`/search` ページは Next.js 16 の `searchParams` Promise に対応し、URL クエリ変更と画面状態を同期。`/api/search` は検索種別 validation、rate limit、構造化エラー、LIKE `ESCAPE`、関連企業 join の owner 条件を追加。
- 2026-04-27: ダッシュボードサイドバーを改善。検索は隠し `SearchBar` + synthetic Cmd+K 依存を廃止し、サイドバー展開時の直接入力から `/search?q=` へ遷移する形に変更。サイドバーに「志望動機作成」を追加し、既存 `CompanySelectModal mode="motivation"` で企業選択後に `/companies/{id}/motivation` へ遷移する。`AppSidebar` の nav action を link / modal で明示し、面接対策と志望動機作成のモーダル状態を分離。
- 2026-04-27: ダッシュボード企業ロゴ取得を主要企業向けに強化。`company_mappings.json` にロゴ専用 `logo_domains` を追加できるようにし、三菱商事は `mitsubishicorp.com`、三菱UFJ銀行は `bk.mufg.jp` を優先候補化。Logo.dev / Brandfetch / favicon fallback は複数ドメイン候補を順に試し、Brandfetch 要件に合わせて画像の `referrerPolicy` を `strict-origin-when-cross-origin` へ変更。
- 2026-04-27: ダッシュボード企業アイコンを実ロゴ対応に更新。`NEXT_PUBLIC_LOGO_DEV_TOKEN` 設定時は Logo.dev、`NEXT_PUBLIC_BRANDFETCH_CLIENT_ID` 設定時は Brandfetch を優先し、未設定または取得失敗時は `estimatedFaviconUrl` / Google favicon / DuckDuckGo favicon / 頭文字 avatar に段階 fallback する。CSP の `img-src` に `img.logo.dev` と `cdn.brandfetch.io` を追加。
- 2026-04-27: ダッシュボード v3 リデザイン。QuickActions をヘッダー行の挨拶横に inline ピル配置し、CA リファレンス画像の配色（fuchsia→pink / orange→amber / emerald→green / rose→red / blue→teal）に統一。WeeklyScheduleView の TIME_SLOTS を 12→9 (09-17) に削減し min-h-[420px] を除去、行高さを 24→20px に縮小。右カラムから QA を除去し TodayTasksCard + DeadlineCard のみに。MacBook Air 13" (1440×900) でスクロールなしに全要素表示可能に。`compact` prop を `inline` に置換、DashboardSkeleton を新レイアウトに同期。
- 2026-04-27: ダッシュボード v3 の参照画像追従を強化。PC では `h-dvh` + 内部 grid で `/dashboard` を 1440×900 の一画面に収める方針へ調整し、QuickActions を lucide icon の上部ピルに統一。`WeeklyScheduleView` は Google Calendar 接続状態を props で受ける表示コンポーネント寄りに整理。企業アイコンは `estimatedFaviconUrl` → Google favicon → DuckDuckGo favicon → 頭文字 avatar の順に fallback する。`TodayTasksCard` / `DeadlineCard` に dashboard 側から表示件数を渡せる density prop を追加し、DashboardSkeleton と dashboard unit tests を同期。
- 2026-04-26: ダッシュボードをリデザイン。StatsCards（4枚の KPI カード）を完全削除し、QuickActions を5つのカラフルなグラデーションボタン（ES添削 / ES作成 / 企業研究 / ガクチカの深掘り / 面接対策）に刷新。企業セクションを縦リストから `groupCompaniesByPipeline()` を使った5列パイプライン（カンバン）表示に変更。レイアウトを `[7fr_2fr_3fr]` + `[7fr_3fr]` の2段グリッドに再構成し、PC一画面でスクロール不要に。`StatsCard.tsx` 削除、`computeDashboardStats` / `StatsInput` / `DashboardStats` をデッドコード削除、`DashboardSkeleton` を新レイアウトに合わせて更新。ActivationChecklist は未完了時のみ条件表示に変更。
- 2026-04-05: ガクチカ・志望動機の ES 下書き生成を ES 添削と同一の `TEMPLATE_DEFS` 由来に統一。`build_template_draft_generation_prompt`（`gakuchika` / `company_motivation`）、旧 `GAKUCHIKA_DRAFT_PROMPT`・`DRAFT_GENERATION_PROMPT`・`DRAFT_FROM_PROFILE_PROMPT` 削除、Notion 必須キーから `gakuchika.draft_generation` / `motivation.draft_generation` 除外。`tests/prompts/test_es_draft_generation_prompt.py` 追加。`SPEC` 17・17.5、`GAKUCHIKA_DEEP_DIVE`、`MOTIVATION`、`ES_REVIEW`、本ファイルを同期。
- 2026-04-05: ガクチカ一覧・詳細・進捗（MEMO 追加分）。`GET /api/gakuchika` で最新会話行を素材単位に集約し `conversationStatus` を正規化、`questionCount` フォールバックを追加。一覧は `getGakuchikaListStatusKey` と `visibilitychange` 再取得。詳細は次質問を `useStreamingTextPlayback` + `StreamingChatMessage` で再生。FastAPI `_build_core_missing_elements` の `context` を状況語ヒントで緩和。Vitest / pytest 更新。`docs/SPEC.md` 17・`GAKUCHIKA_DEEP_DIVE`・本ファイルを同期。
- 2026-04-05: ガクチカ作成（MEMO 77–86）。`会話をやり直す` を確認モーダル経由に、STAR 進捗の楽観更新削除と `getBuildItemStatus` 保守化、FastAPI で ES 構築中の `focus_key` を `missing_elements` 先頭 STAR に正規化、プロンプトに STAR 順の明示、ES 下書き 300/400/500 字の UI 選択と `charLimit` 連携。`docs/SPEC.md` 17 / `docs/features/GAKUCHIKA_DEEP_DIVE.md` を同期。
- 2026-04-05: 志望動機（MEMO 48–64 相当）。setup UI をビューポート内に収める、`会話せずに下書き` ルート（`generate-draft-direct` + FastAPI `generate-draft-from-profile`）、志望動機・ガクチカ ES 本文の 1 段落正規化、FastAPI `detail` のユーザー向け正規化、`closing` /「仕上げを整理中」の非表示とプロンプト・遷移の整理、質問の反復抑止・`ready_for_draft` 緩和の継続。`docs/features/MOTIVATION.md` / `SPEC` 17.5 / `CREDITS` を同期。
- 2026-04-02: ES添削の品質基盤を更新。設問分類を `confidence / secondary_candidates / rationale / recommended_grounding_level` 付きへ拡張し、company grounding を `none / light / standard / deep` の段階制へ移行。company evidence card は `value_orientation / business_characteristics / work_environment / role_expectation` の中間表現へ正規化し、非 length 主因の複合失敗では safe fallback rewrite を使うようにした。`review_meta` と telemetry に classification / grounding / fallback / misclassification recovery 診断を追加し、ReviewPanel に自動判定の推奨理由表示を追加。
- 2026-04-02: 企業特化模擬面接を v2.1 に更新。`coverageState` を deterministic coverage の正本にし、`recentQuestionSummariesV2 + intentKey` による同義質問抑止、`formatPhase` による方式別制御、`interview_turn_events` による各ターンの canonical log 保存、`weakest_turn_id` に紐づく `improved_answer`、完了後の `satisfactionScore` 保存を追加。開始時は既存進行中セッションを reset し、講評履歴のみ保持する形に統一。`docs/features/INTERVIEW.md` と `docs/SPEC.md` を最新の state / API / UI に同期。
- 2026-04-02: 企業特化模擬面接を v2 に移行。開始前設定を `業界 / 職種 / 面接方式 / 選考種別 / 面接段階 / 面接官タイプ / 厳しさ` の確認型に再編し、`roleTrack` は内部自動分類へ変更。FastAPI / Next API / product UI を固定段階フローから `interview_plan + turn_state + turn_meta` ベースの進行へ置換し、`standard_behavioral / case / technical / discussion / presentation` を同一機能で扱えるよう更新。最終講評は 7 軸評価、一貫性リスク、弱い設問タイプ、次の準備論点を返す形へ拡張し、旧版セッションは reset 扱いに統一。`docs/features/INTERVIEW.md`、`docs/SPEC.md`、`docs/features/CREDITS.md`、pricing 表記を同期。
- 2026-04-05: 面接方式を 4 種（`life_history` 追加、旧 `discussion` / `presentation` は `life_history` へ正規化）、`formatPhase` に `life_history_main`、FastAPI の LLM 文字列フィールドを真ストリーミング SSE 化、講評履歴モーダルを `max-height` + 内部スクロール化。関連ドキュメント同期。
- 2026-03-29: 面接対策を motivation 準拠の 2 カラム product UI に刷新。`DashboardHeader` / `BottomTabBar` に `面接対策` 導線を追加し、`CompanySelectModal mode="interview"` で企業選択後に `/companies/[id]/interview` へ遷移する形へ統一。interview 専用 skeleton、mock UI review route を追加。
- 2026-03-29: ガクチカを `深掘り` から `作成` に寄せて UI 文言を整理。`/gakuchika` 一覧・詳細・完了画面の主要文言を更新し、未使用の `STAROnboarding` / `STARHintBanner` を削除。FastAPI に `interview` feature と `MODEL_INTERVIEW` を追加し、Next/FastAPI 間で企業特化模擬面接を実装。
- 2026-03-27: 通知と profile の初回描画を frontend 側で集約。`/notifications` は page で 50 件の通知を server preload し、`DashboardHeader` には 5 件のプレビューのみを渡して page と header の重複 fetch を解消。`/profile` は profile / companies / ES / 通知 / credits を server preload し、header の通知・クレジットも初回から初期データで描画するよう整理。`useNotifications` / `useCredits` は SWR の `initialData` を受け取れるようにして mount fetch を抑制。関連文書を `docs/architecture/ARCHITECTURE.md` に同期。
- 2026-03-25: ES添削の live extended で多発した **字数不足・インターン/コース志望のフォーカストークン** に対し、プロンプト（結論ファースト・長文・required テンプレの型）と **`under_min` リトライヒント**（現状字数と不足分の明示）、`gpt-5.4-mini` の温度・`max_tokens`、Gemini 長文の出力余裕を調整。`evaluate_live_case` 用ライブケースの期待トークンを表記ゆれに合わせて拡張。`docs/features/ES_REVIEW.md` / `docs/testing/ES_REVIEW_QUALITY.md` を同期。
- 2026-03-24: ES添削の出力契約を rewrite-only に整理し、SSE の順序を `rewrite → sources → complete` に統一。retry は `strict → focused retry 1 → focused retry 2 → length-fix → degraded/422` に固定し、focus modes を `length_focus_min/max`, `style_focus`, `grounding_focus`, `answer_focus`, `opening_focus`, `structure_focus` に整理。`length-fix` の final soft は `length` / `style` / `grounding` のみ、`length_fix_result=soft_recovered` と `rewrite_validation_status=soft_ok` を使うよう更新。`user_provided_corporate_urls` は family-aligned retrieval boost 扱いに変更。参考ESは `quality hints + skeleton + conditional hints` のみを使い、overlap guard は削除。
- 2026-03-21: LP・UI/UX 改善。カラーシステムを oklch hue 265（パープル）→ 235（ブルー）に移行。LP 全セクションのコピーを共感+安心型に書き換え、色を `text-primary` / `bg-primary/*` に統一。ローディング UI をスケルトン UI に統一し、`RouteProgressBar` と `PageLoadingState` を廃止。ページ別スケルトン 7 種を `src/components/skeletons/` に追加し、9 個の `loading.tsx` を更新。`/pricing` ページに損失回避（Free 制限コールアウト）、1クレジットあたりコスト表示、FAQ 2 項目追加。
- 2026-03-21: 主要導線のパフォーマンス改善。`/companies/[id]` と `/es/[id]` を server wrapper + client island 構成へ移行し、初回表示の company/document/applications/deadlines/ES 一覧を shared loader (`src/lib/server/app-loaders.ts`) から直接取得する形に変更。`useApplications` / `useCompanyDeadlines` / `useDocument` に `initialData` 対応を追加し、mount 時の不要 fetch を削減。`/api/companies/[id]` と `/api/documents/[id]` は `getRequestIdentity()` + `Server-Timing` 付きの shared loader 経由に統一。旧 page 実装は `src/components/companies/CompanyDetailPageClient.tsx` と `src/components/es/ESEditorPageClient.tsx` へ移し、App Router page は薄い server wrapper に整理。
- 2026-03-21: `/pricing` ページを UX 心理学テクニック適用＋プレミアムリデザイン。アンカリング効果（年額時に月額取り消し線＋具体的な節約額表示）、メンタルアカウンティング（日割り表現改善）、コントラスト効果（年額トグルに 15%お得バッジ＋最大節約額アニメーション表示）を適用。テキスト比較セクションを視覚的な比較テーブルに置換。FAQ を統一カード＋回転シェブロンの洗練されたアコーディオンに改善。pricing 専用カードと比較レイアウトを再設計し、LP `PricingSection` のプラン仕様を `/pricing` と統一。
- 2026-03-22: ES添削 ReviewPanel のスクロール UX を再整理。開始直後は `priming` でパネル上端と内側コンテナ先頭を見せ、最初の実結果が見えた時点で `following` に移って下端追尾、ユーザーが上へ戻ったら `paused` で追尾停止する phase 制御に統一。scroll helper / unit test を更新し、重複していた scroll effect と古い ref を削除。`docs/features/ES_REVIEW.md` を実装に合わせて更新。
- 2026-03-25: プロダクト UI のクライアント fetch 最適化。`useNotifications` / `useCredits` を SWR 化し `/api/notifications`・`/api/credits` を同一キーでデデュープ。`src/lib/swr-fetcher.ts` に認証付き fetch ヘッダー共通化。`(product)/layout` は `children` のみとし、`DashboardHeader` は各ページ／`loading.tsx` が配置（ES 添削など画面単位のレイアウトは `origin/develop` と整合）。
- 2026-03-21: ES添削・クレジット不具合修正。ReviewPanel 二重マウント解消（`useSyncExternalStore` で viewport 判定し単一マウント）、`acquireLock` 失敗時のトースト表示、`useCredits` の 401 フォールバック修正（認証済みユーザーにゲスト値を返さない）、DashboardHeader のクレジット読み込み/エラー表示、`useESReview` の HTTP 402 明示処理、ReviewPanel のクレジット不足ソフトガード、`review/stream` のクレジット確定ロジック強化（ストリーム終了時のバッファ再スキャン）。
- 2026-03-21: ES添削の retry / pricing / provider 契約を簡素化。rewrite は最大3回 + 専用 length-fix 1回に統一し、Standard 300 / Pro 1000 credits と新しい ES credit band（<=500 / <=1000 / <=1500 / >1500）に更新。
- 2026-03-22: ES添削の OpenAI rewrite を stability-first の plain text 経路へ切り替え、`prompt_cache_key` と `verbosity=medium` を追加。strict 文字数帯は常に `X-10〜X` に統一し、retry は `strict → focused retry 1 → focused retry 2 → length-fix → degraded / 422` に整理。final soft は `length` / `style` / `grounding` のみに限定し、`answer_focus / grounding / 参考ES距離 / だ・である調` は strict 維持。Gemini は低温固定を外し、live gate は `all_standard` sweep を手動・夜間で回せるよう更新した。
- 2026-03-21: セキュリティベースライン文書（`docs/ops/SECURITY.md`）、法令用 `LEGAL_*` の `.env.example` 追記、LP プレースホルダ SVG の刷新とマーケドキュメント（`docs/marketing/README.md`）、設定画面の個人名っぽいプレースホルダ除去、内部 STRATEGY のペルソナ見出しから固有名を除去。
- 2026-03-20: ES添削のモデル選択を `Claude / GPT / Gemini / クレジット消費を抑えて添削` に整理。企業未選択時バナー、内部出典リンク、自動スクロール追従の改善、OpenAI 経路の `Responses API` 採用を反映。
- 2026-03-20: 企業RAG課金を整数クレジットに統一。`40 unit = 1クレジット`、月次無料枠 `160 / 640 / 2400 unit`、1社あたり上限 `10 / 100 / 500 source`、`company_info_monthly_usage` 追加と既存 credits 2倍 migration を適用。
- 2026-03-14: Codex 用の安全ラッパー CLI を追加。`git / gh / vercel / railway / supabase / stripe / modal / hf / huggingface-cli / gcloud` を同名 wrapper で包み、危険操作を拒否しつつ `develop -> main -> 本番` の運用を維持。
- 2026-03-14: 主要 API と主要 hook で `ユーザー向けメッセージ` と `開発者向け詳細` を分離。`requestId` を導入し、開発環境では devtools / ログから debug 情報を追える構成に整理。

---

## 凡例

- ✅ **完了**: 実装済み、テスト可能
- 🟡 **部分実装**: 基本機能は動作するが一部機能が未実装
- 🔴 **未実装**: まだ実装されていない
- ⏸️ **MVP除外**: MVPスコープ外

---

## 1. 非機能仕様 (SPEC Section 1)

| 機能 | 状態 | 備考 |
|------|------|------|
| JST タイムゾーン対応 | ✅ 完了 | 日付表示、リセット処理 |
| 成功時のみ消費 | ✅ 完了 | クレジット、無料回数とも実装済み |
| 非同期UX | ✅ 完了 | トースト・通知機能、処理中表示実装済み |
| パフォーマンス要件（1.4） | ✅ 完了 | スケルトン UI でローディング表示 |
| セッション管理（1.5） | 🟡 部分実装 | 7日タイムアウト要検証 |
| オフライン対応（1.6） | 🟡 部分実装 | ES編集ローカル保存は部分的 |
| A11y（1.7） | 🟡 部分実装 | キーボード操作基本対応、WCAG AA未対応 |

---

## 2. 認証・アカウント (SPEC Section 2)

| 機能 | 状態 | 備考 |
|------|------|------|
| ゲスト利用 | ✅ 完了 | `guestUsers` テーブル、7日保持 |
| Google ログイン | ✅ 完了 | Better Auth + Google OAuth |
| ゲスト→ログイン移行 | ✅ 完了 | データ引き継ぎ実装済み（自動引継） |
| プラン選択画面 | ✅ 完了 | `/pricing` |
| ゲスト制限（企業3社、クレジット12等） | ✅ 完了 | スキーマ・API実装済み |
| ログイン促し（機能ごと1回） | ✅ 完了 | `loginPrompts` テーブル |
| アカウント削除 | ✅ 完了 | API + 設定画面の削除モーダル実装済み |
| ゲストデータ警告（2.4） | 🔴 未実装 | 7日経過前の「データ削除されます」警告 |
| 利用規約同意（2.5） | 🔴 未実装 | 有料購入時の同意フロー |

---

## 3. 料金・プラン・制限 (SPEC Section 3)

| 機能 | 状態 | 備考 |
|------|------|------|
| Free/Standard/Pro プラン | ✅ 完了 | `userProfiles.plan` |
| Stripe 連携 | ✅ 完了 | Webhook、Checkout 実装済み |
| 企業登録上限 | ✅ 完了 | Free: 5社、Guest: 3社 |
| プラン変更即時反映 | 🟡 部分実装 | Webhook処理済み、UI未実装 |
| 支払い失敗時ダウングレード | ✅ 完了 | Webhook で処理 |
| 企業RAG取得ページ上限 | ✅ 完了 | Free: 10, Standard: 100, Pro: 500 を API / UI に反映 |
| ダウングレード時データ扱い（3.5） | 🔴 未実装 | 超過データ読み取り専用化 |

---

## 4. クレジット仕様 (SPEC Section 4)

| 機能 | 状態 | 備考 |
|------|------|------|
| 月次付与 | ✅ 完了 | Free: 30, Standard: 100, Pro: 300 |
| 企業情報取得/更新の無料回数 | ✅ 完了 | Guest: 5、Free: 10、Standard: 20、Pro: 40 / 日 |
| ES添削クレジット消費 | ✅ 完了 | Claude / GPT / Gemini: 6/10/14/20、low-cost: 3/6/9/12 |
| 面接対策クレジット消費 | ✅ 完了 | plan `GPT-5.4` / 質問 `Claude Haiku 4.5` / 講評 `Claude Sonnet 4.6`。開始 2 credits、回答/続き各 1 credit、最終講評 6 credits |
| 部分成功（0クレジット） | ✅ 完了 | 締切抽出失敗でも他データ保存時は無料 |
| 部分成功UX | ✅ 完了 | 部分成功メッセージと課金ルールを最新化 |
| 0.5累積バー表示 | ⏸️ MVP除外 | 0.5クレジット仕様を廃止 |
| 無料回数表示（ダッシュボード） | ✅ 完了 | 「今日の無料取得: 残X回」実装済み |
| 実行履歴の通知 | ✅ 完了 | `notifications` テーブル |
| クレジット不足時の実行不可 | ✅ 完了 | API でチェック |

---

## 5. 画面一覧 (SPEC Section 5)

| 画面 | 状態 | パス |
|------|------|------|
| オンボーディング | ✅ 完了 | `/onboarding` |
| ダッシュボード | ✅ 完了 | `/dashboard` |
| 企業一覧 | ✅ 完了 | `/companies` |
| 企業詳細 | ✅ 完了 | `/companies/[id]` |
| 企業登録 | ✅ 完了 | `/companies/new` |
| カレンダー | ✅ 完了 | `/calendar` |
| カレンダー設定 | ✅ 完了 | `/calendar/settings` |
| 締切/タスク一覧 | ✅ 完了 | `/tasks` |
| ESエディタ | ✅ 完了 | `/es/[id]` |
| ES一覧 | ✅ 完了 | `/es` |
| 通知一覧 | ✅ 完了 | `/notifications` |
| 設定 | ✅ 完了 | `/settings` |
| ガクチカ一覧 | ✅ 完了 | `/gakuchika` |
| ガクチカ詳細 | ✅ 完了 | `/gakuchika/[id]` |
| 志望動機作成 | ✅ 完了 | `/companies/[id]/motivation` |
| 面接対策 | ✅ 完了 | `/companies/[id]/interview` |
| 検索結果 | ✅ 完了 | `/search` グローバル検索結果画面 |

---

## 6. オンボーディング (SPEC Section 6)

| 機能 | 状態 | 備考 |
|------|------|------|
| 企業登録導線の優先表示 | ✅ 完了 | ダッシュボードの「最初の一歩」に統合 |
| 企業登録後の志望動機導線 | ✅ 完了 | 初回は `/companies/[id]/motivation` へ遷移 |
| プロフィール補完 | ✅ 完了 | `/onboarding` は任意入力画面に整理 |
| 空送信スキップ防止 | ✅ 完了 | `/api/auth/onboarding` が 1 項目以上を要求 |
| ガクチカ素材入力 | ✅ 別導線 | 初回オンボーディングからは外し、専用画面で対応 |

---

## 7. ダッシュボード (SPEC Section 7)

| 機能 | 状態 | 備考 |
|------|------|------|
| 今日の最重要1タスク | ✅ 完了 | API: `/api/tasks/today` |
| 通知欄 | ✅ 完了 | 最大5件 + 「他◯件」 |
| クレジット残高表示 | ✅ 完了 | 残量・次回付与日 |
| 今日の無料取得回数 | ✅ 完了 | 「今日の無料取得: 残X回」 |
| 締切警告（3日/24時間以内） | ✅ 完了 | DeadlineCard コンポーネント |
| タスク開始→画面遷移 | ✅ 完了 | |

---

## 8. 企業登録 (SPEC Section 8)

| 機能 | 状態 | 備考 |
|------|------|------|
| 企業名・業界入力 | ✅ 完了 | `/companies/new` |
| Free/ゲスト上限チェック | ✅ 完了 | API でバリデーション |
| 重複判定 | 🟡 部分実装 | 名前完全一致のみ、法人判定は未実装 |
| 統合提案モーダル（8.4） | 🔴 未実装 | 同一企業検知時のモーダル |
| 削除時の紐づきデータ削除 | ✅ 完了 | CASCADE 設定済み |
| 並び替え・ピン留め | ✅ 完了 | `isPinned`, `sortOrder` 実装済み |

---

## 9. 企業情報取得/更新 (SPEC Section 9)

| 機能 | 状態 | 備考 |
|------|------|------|
| 採用ページ候補の検索・選択 | ✅ 完了 | `/api/companies/[id]/search-pages` + UI（FastAPI `/company-info/search-pages`、未接続時はモック） |
| 手動URL入力 | ✅ 完了 | `FetchInfoButton` |
| 情報抽出（締切/募集区分等） | 🟡 部分実装 | FastAPI `company_info.py` 基本実装済み |
| 根拠URL・信頼度表示 | 🟡 部分実装 | スキーマにフィールドあり、UI表示は部分的 |
| 締切候補の承認モーダル | ✅ 完了 | `DeadlineApprovalModal` |
| 更新時の差分提示 | 🔴 未実装 | |

---

## 10. 応募枠 (SPEC Section 10)

| 機能 | 状態 | 備考 |
|------|------|------|
| 応募枠CRUD | ✅ 完了 | `applications` テーブル |
| フェーズ管理 | ✅ 完了 | 5種のフェーズテンプレート実装済み |
| 職種管理 | ✅ 完了 | `jobTypes` テーブル |
| 応募枠上限（10枠/企業） | ✅ 完了 | APIでバリデーション済み |
| フェーズテンプレ | ✅ 完了 | インターン（夏/秋/冬）/早期選考/本選考 |

---

## 11. 締切承認UX (SPEC Section 11)

| 機能 | 状態 | 備考 |
|------|------|------|
| 承認モーダル | ✅ 完了 | `DeadlineApprovalModal` |
| LOW信頼度の初期OFF | ✅ 完了 | |
| 0件承認エラー | ✅ 完了 | |
| 終日締切（12:00扱い） | 🔴 未実装 | |
| 締切変更検知 | 🔴 未実装 | |
| 提出済み連動（タスク一括完了） | ✅ 完了 | completedAt 設定時に自動処理 |
| 手動締切追加/編集 | ✅ 完了 | `DeadlineModal` |

---

## 12. 通知 (SPEC Section 12)

| 機能 | 状態 | 備考 |
|------|------|------|
| 締切リマインド | ✅ 完了 | Vercel Cron でバッチ処理 |
| 企業更新/ES添削結果通知 | ✅ 完了 | |
| 通知一覧表示 | ✅ 完了 | `/notifications` |
| 未読/既読管理 | ✅ 完了 | |
| すべて既読ボタン | ✅ 完了 | |
| 通知タイプ別ON/OFF | ✅ 完了 | 設定画面に実装済み |
| 90日自動削除 | ✅ 完了 | Vercel Cron でバッチ処理 |
| 日次通知（JST 9:00） | ✅ 完了 | Vercel Cron `0 0 * * *` |
| 日次通知時刻選択（12.3） | 🔴 未実装 | 7:00/9:00/12:00/18:00から選択式 |
| 通知削除（個別+一括）（12.3） | 🔴 未実装 | 「すべて削除」ボタン |

---

## 13. タスク・進捗管理 (SPEC Section 13)

| 機能 | 状態 | 備考 |
|------|------|------|
| タスクCRUD | ✅ 完了 | `/api/tasks` |
| 任意タスク追加 | ✅ 完了 | |
| 企業/応募枠紐づけ | ✅ 完了 | |
| 今日の最重要1タスク推薦 | ✅ 完了 | DEADLINE/DEEP_DIVEモード |
| 72h閾値固定 | ✅ 完了 | カスタマイズ不可として実装 |
| 締切承認時の標準タスク自動作成 | ✅ 完了 | ES作成/提出物準備/提出の3タスク |
| タスク種別管理 | 🟡 部分実装 | 固定enum、ユーザー追加未実装 |
| タスク一覧の並び順（締切順） | ✅ 完了 | |

---

## 14. カレンダー連携 (SPEC Section 14)

| 機能 | 状態 | 備考 |
|------|------|------|
| アプリ内カレンダー | ✅ 完了 | `/calendar` |
| Google カレンダー連携 | 🟡 部分実装 | スキーマあり、OAuth実装必要 |
| 追加先カレンダー選択 | 🟡 部分実装 | 設定画面あり、Google連携は未完 |
| freebusy（空き時間算出） | 🔴 未実装 | |
| 作業ブロック追加 | ✅ 完了 | |
| [就活Pass]接頭辞 | ✅ 完了 | カレンダーイベント作成時に付与 |
| 置換モード | 🔴 未実装 | |
| 作業ブロック自動提案 | 🔴 未実装 | |
| 同期エラー3回自動リトライ（14.9） | 🔴 未実装 | バックグラウンドリトライ |
| 外部削除同期（14.8） | 🔴 未実装 | Google側削除を就活Pass側に反映 |

---

## 15. ESエディタ (SPEC Section 15)

| 機能 | 状態 | 備考 |
|------|------|------|
| 左右分割（本文/AI添削） | ✅ 完了 | |
| モバイル縦積み（15.1） | 🟡 部分実装 | レスポンシブ対応要検証 |
| Notion風ブロックエディタ | ✅ 完了 | H2/段落/箇条書き |
| 文字数カウント（設問単位） | ✅ 完了 | 文字数制限表示も実装 |
| 自動保存 | ✅ 完了 | 2秒デバウンス |
| 編集履歴（5版） | 🟡 部分実装 | スキーマあり、UI未実装 |
| 復元時確認モーダル（15.7） | 🔴 未実装 | 「現在の内容が失われます」確認 |
| ゴミ箱（30日） | 🟡 部分実装 | スキーマあり、復元UI未実装 |
| ES/Tips/企業分析の種別 | ✅ 完了 | |
| 応募枠・職種紐づけ | ✅ 完了 | |

---

## 16. AI添削 (SPEC Section 16)

| 機能 | 状態 | 備考 |
|------|------|------|
| スコア（5軸）表示 | ✅ 完了 | 論理/具体性/熱意/企業接続/読みやすさ |
| 改善ヒント（内部） | ✅ 完了 | rewrite-only 契約に整理 |
| リライト（Free: 1本、有料: 3本） | ✅ 完了 | |
| スタイル選択 | ✅ 完了 | 8種（有料は全種） |
| 設問別指摘（有料） | ✅ 完了 | 文字数制限も考慮 |
| 企業接続評価（RAG時のみ） | ✅ 完了 | |
| 全文添削（コピーのみ） | ✅ 完了 | |
| 並列添削対応（16.1） | 🟡 部分実装 | 複数セクション同時添削 |
| 添削中の編集ロック（16.1） | 🟡 部分実装 | 本文全体をロック。上部の進行帯は非表示 |
| セクション/ブロック反映 | 🟡 部分実装 | クリップボードコピーのみ、直接反映は未実装 |
| 反映確認モーダル + Undo | 🔴 未実装 | |
| AIスレッド管理 | 🟡 部分実装 | スキーマとAPIは残存、ES editor のUI利用は停止 |
| ES添削スレッド中断・再開（16.10） | 🟡 部分実装 | ガクチカと同様の中断機能 |
| 添削履歴保存（Free: 20件等） | ⚪️ 未使用 | ES editor からの新規保存を停止 |
| 英語ES対応（16.1） | ✅ 完了 | 言語自動判定なし（入力テキストから判断） |

### ESテンプレ (SPEC Section 16.9)

> **注意**: ESテンプレートギャラリー機能は削除されました（2026-02-03）。
> 代わりに「AI対話形式ES作成（志望動機）」機能が追加されています。

---

## 17. ガクチカ作成 (SPEC Section 17)

| 機能 | 状態 | 備考 |
|------|------|------|
| 作成対話 | ✅ 完了 | FastAPI `gakuchika.py` |
| 最大6問の質問設計 | ✅ 完了 | 十分な材料が揃えば早終了 |
| 中断/再開 | ✅ 完了 | |
| クレジット消費（5問ごと3） | ✅ 完了 | |
| Q&A保存 | ✅ 完了 | `gakuchikaConversations` |
| 再実行時の履歴保持（17.2） | ✅ 完了 | 別セッション開始と同一セッション再開の両方に対応 |
| 面接準備完了後の継続深掘り | ✅ 完了 | `resume` + `extended_deep_dive_round`、完了カードから「もっと深掘る」 |
| 素材の企業紐づけ | ⚪︎ スキーマ残存 | 現行の作成 UI / API では未使用 |
| サマリー生成 | ✅ 完了 | 完了時は `/structured-summary` のみ（失敗時は回答連結フォールバック） |
| 完了カードの空表示 | ✅ 完了 | structured 全空時の案内と要約再取得ボタン |

---

## 17.5 志望動機作成（AI対話形式） 🆕

ESテンプレートギャラリー機能の代替として実装。ガクチカ作成と同様の対話形式で志望動機を作成。

| 機能 | 状態 | 備考 |
|------|------|------|
| 対話形式での深掘り | ✅ 完了 | FastAPI `motivation.py` |
| 骨格ベース評価 | ✅ 完了 | 6要素（業界理由/企業理由/自己接続/やりたい仕事/価値発揮/差別化） |
| 中断/再開 | ✅ 完了 | `motivationConversations` テーブル |
| クレジット消費（5問ごと3） | ✅ 完了 | ガクチカと同様のロジック |
| 企業RAG連携 | ✅ 完了 | 企業情報を質問に反映 |
| 参考企業情報 | ✅ 完了 | 自由入力UIに切り替え、`evidenceCards` は compact card UI で表示 |
| ガクチカ連携 | ✅ 完了 | 完了済み要約を質問生成に反映 |
| SSEストリーミング送信 | ✅ 完了 | 進捗表示のみ先出しし、質問は確定後の canonical question だけを表示 |
| ES下書き生成 | ✅ 完了 | 300/400/500文字指定 |
| 企業ページからの導線 | ✅ 完了 | 「志望動機を作成」ボタン |
| 進捗バー（6要素） | ✅ 完了 | setup / 進捗 / draft ready を統一表示 |
| setup-first 初期設定 | ✅ 完了 | 業界/職種をチャット前に確定 |
| 初回開始の空履歴処理 | ✅ 完了 | 空 `messages=[]` をそのまま LLM に渡さない |
| 質問適合候補 | ✅ 完了 | LLM質問は server-side validator で単一論点・未確認前提なしを確認し、回答は自由入力のみ。raw企業文や見出しは除外。回答送信は `conversation/stream` のみ |

---

## 17.6 面接対策（企業特化模擬面接） 🆕

| 機能 | 状態 | 備考 |
|------|------|------|
| 企業別模擬面接UI | ✅ 更新 | motivation 準拠の 2 カラム UI + setup-first + 論点ベース進捗 + 自動スクロール |
| 面接対策 API | ✅ 更新 | `GET /interview` + `POST /interview/start` + `POST /interview/stream` + `POST /interview/feedback` |
| FastAPI interview router | ✅ 更新 | adaptive 6〜10 問 + opening / turn / feedback SSE |
| モデル固定 | ✅ 完了 | plan `GPT-5.4`、質問 `Claude Haiku 4.5`、講評 `Claude Sonnet 4.6` |
| セッション課金 | ✅ 完了 | 開始 `2 credits`、回答/続き各 `1 credit`、最終講評 `6 credits` |
| 月次無料枠 | ✅ 完了 | なし |
| 4軸講評 | ✅ 完了 | 企業適合 / 具体性 / 論理性 / 説得力 + card 逐次更新 |
| ナビ導線 | ✅ 更新 | header / mobile nav から modal 起動 |
| UI review route | ✅ 更新 | `/companies/ui-review-company/interview --auth=mock` |

**関連ファイル:**
- `backend/app/routers/interview.py`
- `src/app/(product)/companies/[id]/interview/page.tsx`
- `src/app/api/companies/[id]/interview/route.ts`
- `src/app/api/companies/[id]/interview/start/route.ts`
- `src/app/api/companies/[id]/interview/stream/route.ts`
- `docs/features/INTERVIEW.md`

---

## 18. 提出物テンプレ (SPEC Section 18)

| 機能 | 状態 | 備考 |
|------|------|------|
| 提出物項目（履歴書/ES/証明写真等） | ✅ 完了 | `submissionItems` テーブル |
| 応募枠ごとの提出物管理 | ✅ 完了 | `SubmissionsList` コンポーネント |
| 標準項目（履歴書/ES削除不可） | ✅ 完了 | API & UI で削除保護実装 |

---

## 19. 典型ユーザーフロー (SPEC Section 19)

> 機能横断のフロー定義。個別機能の実装状況に依存。

| フロー | 状態 | 備考 |
|------|------|------|
| フローA: 最短セット | 🟡 部分実装 | 採用ページ候補提示が未実装 |
| フローB: ES改善 | 🟡 部分実装 | 反映UX（確認モーダル+Undo）が未実装 |
| フローC: カレンダー | 🟡 部分実装 | Google連携・freebusy・置換モードが未実装 |

---

## 20. 受入観点 (SPEC Section 20)

> Done定義。各観点は個別機能で追跡。

---

## 21. 用語集 (SPEC Section 21)

> 定義のみ。実装不要。

---

## 22. 検索機能 (SPEC Section 22) 🆕

| 機能 | 状態 | 備考 |
|------|------|------|
| グローバル全文検索 | ✅ 完了 | `/api/search` + `/search` ページ |
| 検索結果グループ化 | ✅ 完了 | 企業/ES/締切で種別ごとに表示 |
| 検索導線（サイドバー配置） | ✅ 完了 | `SidebarSearch` で2文字以上の候補を表示し、`/search?q=` へ遷移 |
| useSearch フック | ✅ 完了 | デバウンス、abort制御付き |

---

## 23. データエクスポート (SPEC Section 23) 🆕

| 機能 | 状態 | 備考 |
|------|------|------|
| ES PDF出力 | 🔴 未実装 | ESエディタのメニューから |
| 締切一覧CSV出力 | 🔴 未実装 | 締切一覧画面から |

---

## 24. APIセキュリティ・レートリミット (SPEC Section 24) 🆕

| 機能 | 状態 | 備考 |
|------|------|------|
| ES添削レートリミット | 🟡 部分実装 | CRON認証強化、基本レート制限実装 |
| 企業情報取得レートリミット | 🟡 部分実装 | SSRF対策、基本レート制限実装 |
| 異常パターン検知・ブロック | 🔴 未実装 | |
| 運用ドキュメント（ヘッダー・CSP・ログ・法令 env） | ✅ 完了 | `docs/ops/SECURITY.md` |

---

## 25. 将来拡張 (SPEC Section 25) 🆕

| 機能 | 状態 | 備考 |
|------|------|------|
| LINE通知 | ⏸️ MVP除外 | PWAプッシュよりLINE連携検討 |
| フィードバック機能 | ⏸️ MVP除外 | Googleフォーム/メールリンクで代替 |
| RAG差分更新 | ⏸️ MVP除外 | 既存RAGを残し新URLのみ追加 |

---

## バックエンド (FastAPI)

| 機能 | 状態 | ファイル |
|------|------|------|
| ES添削 | ✅ 完了 | `backend/app/routers/es_review.py` |
| ガクチカ作成 | ✅ 完了 | `backend/app/routers/gakuchika.py` |
| 志望動機作成 | ✅ 完了 | `backend/app/routers/motivation.py` |
| 面接対策 | ✅ 完了 | `backend/app/routers/interview.py` |
| 企業情報抽出 | 🟡 部分実装 | `backend/app/routers/company_info.py` |
| LLMユーティリティ | ✅ 完了 | `backend/app/utils/llm.py` |
| ベクトルストア（RAG） | 🟡 部分実装 | `backend/app/rag/vector_store.py` |
| ハイブリッド検索 | ✅ 完了 | `backend/app/rag/hybrid_search.py` |
| BM25インデックス | ✅ 完了 | `backend/app/utils/bm25_store.py` |
| テキストチャンキング | ✅ 完了 | `backend/app/utils/text_chunker.py` |

## Next.js API (新機能)

| 機能 | 状態 | ファイル |
|------|------|------|
| ES添削ストリーミング | ✅ 完了 | `src/app/api/documents/[id]/review/stream/route.ts` |
| 志望動機会話API | ✅ 完了 | `conversation/route.ts`（GET/DELETE）、`conversation/stream/route.ts`（回答送信SSE） |
| 志望動機下書き生成 | ✅ 完了 | `src/app/api/motivation/[companyId]/generate-draft/route.ts` |
| 面接対策 API | ✅ 完了 | `src/app/api/companies/[id]/interview/route.ts` |

---

## E2Eテスト

| テスト | 状態 | ファイル |
|------|------|------|
| guest major | ✅ 再編済み | `e2e/guest-major.spec.ts`（ゲストは `gakuchika` 作成上限 0 のため素材 POST は含めず、志望動機はログイン案内を確認） |
| user major | ✅ 再編済み | `e2e/user-major.spec.ts` |
| auth boundary | ✅ 再編済み | `e2e/auth-boundary.spec.ts` |
| focused regressions | ✅ 維持 | `e2e/regression-bugs.spec.ts`, `e2e/motivation.spec.ts` |
| UI review | ✅ 追加済み | `e2e/ui-review.spec.ts` |

---

## 実装優先度（推奨）

### 高優先度（コア体験・セキュリティに直結）

| # | 機能 | Section | 状態 | 理由 |
|---|------|---------|------|------|
| 1 | レートリミット | 24 | 🔴 | セキュリティ必須 |
| 2 | ゲストデータ警告 | 2.4 | 🔴 | データ保護・ユーザー信頼 |
| 3 | 採用ページ候補3件提示 | 9 | 🔴 | コア体験改善（既存優先項目） |
| 4 | ~~検索機能~~ | 22 | ✅ | **完了**（2026-01-30確認） |

### 中優先度

| # | 機能 | Section | 状態 | 理由 |
|---|------|---------|------|------|
| 5 | エクスポート機能（PDF/CSV） | 23 | 🔴 | ユーザー価値提供 |
| 6 | 日次通知時刻選択 | 12.3 | 🔴 | UX改善 |
| 7 | 添削中の編集ロック | 16.1 | 🔴 | データ整合性 |
| 8 | Google カレンダーOAuth完全実装 | 14 | 🟡 | 連携機能強化 |
| 9 | 反映確認モーダル + Undo | 16.6 | 🔴 | 安全なUX |

### 低優先度（MVP後）

| # | 機能 | Section | 状態 | 理由 |
|---|------|---------|------|------|
| 10 | 統合提案モーダル | 8.4 | 🔴 | 重複企業対策 |
| 11 | 同期エラーリトライ | 14.9 | 🔴 | 堅牢性向上 |
| 12 | freebusy（空き時間算出） | 14.3 | 🔴 | カレンダー機能強化 |
| 13 | 置換モード | 14.6 | 🔴 | カレンダー機能強化 |
| 14 | LINE通知 | 25.1 | ⏸️ | 将来拡張 |

---

## 統計サマリー

| カテゴリ | 完了 | 部分実装 | 未実装 |
|----------|------|----------|--------|
| 非機能仕様 | 4 | 3 | 0 |
| 認証・アカウント | 7 | 0 | 2 |
| 料金・クレジット | 5 | 2 | 1 |
| クレジット仕様 | 6 | 1 | 1 |
| 画面 | 16 | 0 | 0 |
| オンボーディング | 4 | 0 | 1 |
| ダッシュボード | 6 | 0 | 0 |
| 企業登録 | 4 | 1 | 1 |
| 企業情報取得 | 2 | 2 | 2 |
| 応募枠 | 5 | 0 | 0 |
| 締切承認UX | 5 | 0 | 2 |
| 通知 | 8 | 0 | 2 |
| タスク管理 | 7 | 1 | 0 |
| カレンダー連携 | 3 | 2 | 5 |
| ESエディタ | 6 | 3 | 2 |
| AI添削 | 8 | 5 | 2 |
| ~~ESテンプレ~~ | - | - | - |
| ガクチカ | 7 | 1 | 0 |
| 志望動機作成 🆕 | 8 | 0 | 0 |
| 提出物 | 3 | 0 | 0 |
| ユーザーフロー | 0 | 3 | 0 |
| 検索 | 4 | 0 | 0 |
| エクスポート | 0 | 0 | 2 |
| セキュリティ | 0 | 2 | 1 |
| 将来拡張 | 0 | 0 | 0 |
| バックエンド | 7 | 2 | 0 |
| Next.js API | 3 | 0 | 0 |
| E2Eテスト | 4 | 0 | 0 |
| **合計** | **132** | **28** | **24** |

**実装完了率: 約 72%**（部分実装を50%として計算すると約 80%）

※ ESテンプレートギャラリー機能を削除し、志望動機作成機能を追加（2026-02-03）

---

## 最近の更新履歴

### 2026-03-29
- 📏 **ES添削の短答 required 設問の under-min を抑制**
  - `company_motivation` など required 設問の **150〜220字帯**は、短答でも `3〜4文` と bridge guidance を使い、`under_min` 時に経験→役割/企業接点→貢献の接続を 1〜2文まで補えるよう更新
- 🧩 **required 設問の single-source evidence を補強**
  - 同一 verified source しか残らない場合でも、excerpt が `事業理解` と `現場期待 / 役割理解` を両方含むなら 2 theme card として安全に分解できるよう修正
  - `company_motivation_noisy_rag_medium` 系で、短い title のため excerpt が primary claim になるケースでも `company_evidence_count` を落としにくくした
- 🧪 **ES添削の回帰テストと docs を更新**
  - `backend/tests/es_review/test_es_review_template_repairs.py` と `backend/tests/es_review/test_es_review_prompt_structure.py` に今回の failure pattern 用の固定ケースを追加
  - `docs/features/ES_REVIEW.md` と `docs/testing/ES_REVIEW_QUALITY.md` を最新の length / evidence 方針に更新

### 2026-03-13
- 🧠 **ES添削の企業依存設問 quality gate を強化**
  - `role_course_reason` と `intern_goals` を rubric / final-quality の固定回帰へ追加
  - `selected_user_facts` は `current_answer + 補助 fact` を最低保証し、profile の過剰注入を抑えるよう更新
  - `company_evidence_cards` は required 設問で `役割/プログラム軸 + 企業理解軸` を最低 1 枚ずつ確保し、theme diversity を優先するよう整理
- 🔎 **ES添削の question focus と second pass を整理**
  - broad role だけでなく required 設問全体で `事業理解 / 成長機会 / 価値観 / 将来接続 / 役割理解 / インターン機会` の 6 軸を使って evidence を選ぶよう更新
  - `grounding_focus` second pass は `weak` だけでなく `partial` coverage でも、役割軸か企業軸が欠けるときに 1 回だけ走るよう改善
- 🧩 **標準モデルの shared structured output 契約を補強**
  - OpenAI Chat Completions の `json_schema.name` 欠落を修正し、`name / schema / strict` を常に付与
  - Gemini は strict JSON 指示と parse fallback を shared layer に寄せ、Claude 専用 transport には手を入れずに標準経路の整合だけを修正
- 📝 **ES添削ドキュメントを更新**
  - `docs/features/ES_REVIEW.md` と `docs/testing/ES_REVIEW_QUALITY.md` に required 設問優先の品質監査、6 軸 evidence、shared provider 契約を反映

### 2026-03-15
- ✅ Google カレンダー連携を設定画面の明示操作に限定
  - `/calendar/settings` からのみ連携、再連携、解除、追加先変更を実行する構成へ整理
  - Google ログインだけでは連携が有効にならず、追加先カレンダー選択が必須になった
- ✅ Google 同期を非同期キューへ移行
  - `calendar_sync_jobs` を追加し、締切と作業ブロックの Google 登録・削除を cron 経由で処理
  - 3回自動再試行と `calendar_sync_failed` 通知を実装
- ✅ Google 側変更の取り込みを追加
  - 作業ブロックは Google 側の編集・削除をアプリへ反映
  - 締切は Google 側削除時に `suppressed` 扱いへ変更し、自動再作成を止めた
- ✅ 旧 Google 直書きコードを削除
  - `FetchInfoButton` からの直接 Google 登録を廃止し、共通同期サービスへ統一
  - `/api/calendar/google` は read / reconcile 用に縮小し、作成 POST を削除
- ✅ カレンダー連携のテストとドキュメントを更新
  - `vitest` を導入し、接頭辞正規化、接続状態、同期ジョブ、失敗通知のユニットテストを追加
  - `docs/features/CALENDAR.md` と `docs/SPEC.md` を現行仕様へ更新

### 2026-03-11
- 🧠 **ES添削の企業補強を current-run 品質向上向けに更新**
  - `complete` 後の次回向け補強をやめ、ユーザーが選択した企業ソースをその回の添削で使う流れへ整理
  - broad role では `事業理解 / 成長機会 / 価値観 / 将来接続` の設問軸で query を組み立て、公式 source の不足を補う
  - 高信頼二次情報は query hint にだけ使い、本文根拠と UI 出典は一次情報に限定
  - 追加ソースは bounded wait にし、coverage 不足の content type を優先して time budget 内でだけ補う
- ✍️ **ES添削の参考ES活用を quality + outline へ拡張**
  - `reference quality block` に coarse な骨子を追加し、品質ヒントに加えて論点配置も prompt へ渡すよう更新
  - `review_meta` に `reference_outline_used` を追加
- 📏 **ES添削の根拠カバレッジ通知を追加**
  - `review_meta` に `evidence_coverage_level` / `weak_evidence_notice` を追加
  - 企業根拠が薄いときは安全寄りに返しつつ UI で通知できるよう更新
- 🧪 **ES添削の固定 rubric 評価を追加**
  - `backend/tests/test_es_review_quality_rubric.py` を追加し、broad role / weak evidence / companyless の固定ケースを継続監視対象にした
- 🛡️ **企業情報取得の親子会社誤判定を是正**
  - 企業情報検索の `official / parent / subsidiary / other` 判定を `classify_company_domain_relation()` 起点に一本化
  - 親会社検索で子会社サイト、子会社検索で親会社サイトが `公式` や `公式・高` に昇格しないよう修正
  - 親会社/子会社候補は除外せずに残しつつ、`parent` / `subsidiary` のまま表示し、自動選択させず confidence は `low` 上限に固定
- 🎯 **AI選考スケジュール取得の年度・モーダルUXを更新**
  - 卒業年度はプロフィール値を初期選択しつつ、モーダル内で常時変更可能に修正
  - `選考条件を設定` と `採用ページURLを選択` のモーダル幅を統一し、検索中コピーを `候補URLを検索中です。` に簡素化
  - 候補一覧に `親会社` / `子会社` と relation 企業名を表示し、手動選択前提で判断できるよう改善
- 📅 **Google Calendar 追加失敗の原因を分離**
  - `未連携 / 再連携必要 / 追加先カレンダー未設定 / 一部失敗 / dueDate不正` を個別通知に変更
  - `/api/calendar/google` は `TARGET_CALENDAR_REQUIRED` などの原因別 code を返すよう更新
- 🧹 **企業情報取得の旧 helper 依存を削除**
  - 監査スクリプトから `_is_subsidiary()` / `_is_parent_company_site()` 依存を削除し、本番の classifier と同じ基準へ統一
- 📝 **企業情報取得ドキュメントを更新**
  - `docs/features/COMPANY_INFO_SEARCH.md` と `docs/features/COMPANY_INFO_FETCH.md` に relation-first 判定と confidence ルールを反映

### 2026-03-10
- 🧠 **ES添削の生成パイプラインを簡素化**
  - rewrite-only の流れに整理し、backend 側で必要な内部ヒントだけを補完する形へ変更
  - rewrite plan、LLM validator、targeted repair、LLM 文字数補修を削除
  - rewrite は `strict → focused retry 1 → focused retry 2 → length-fix → degraded / 422` に固定し、final soft は `length` / `style` / `grounding` に限定
- 🎯 **ES添削の文脈活用を強化**
  - `allowed_user_facts` から relevance と source balance で `selected_user_facts` を作り、prompt に入れる情報量を整理
  - `rag_sources` を `company evidence cards` に圧縮し、企業理解を深めつつ固有施策の幻覚を抑える構成へ更新
  - 参考ESは本文注入をやめ、`reference quality profile` と overlap guard の二段用途に限定
  - `総合職` など broad role label のときは、role 軸ではなく設問軸で 2nd pass retrieval と evidence selection を行うよう更新
- ✍️ **短字数設問の失敗耐性を改善**
  - `char_max <= 220` では short-answer mode を有効化
  - 上限厳守のまま、下限未達が小さい場合は `soft_ok` / `soft_recovered` として安全返却できるように更新
- ✨ **ES添削の業界・職種 UI を簡素化**
  - 業界・職種の選択を chip 群から dropdown に変更
  - broad / 未設定業界では `業界 → 職種` を段階表示し、同一 ES 内で選択を保持
- ✨ **ES添削の設定 UI と CTA 導線を整理**
  - `設問タイプ` も dropdown カード化し、`準備完了` バッジと `現在の設定` に統一
  - `消費クレジット` と CTA を右パネル / mobile sheet の固定フッターに移し、結果後も同じ高さで切り替わるように更新
- 🧭 **企業連携ステータス表示を安定化**
  - autosave 後も company 情報を落とさないよう、documents API の返却 shape を `GET`/`PUT` で統一
  - 企業連携ステータスを右パネル上部に常時表示し、添削中と結果表示中は compact bar に縮約
- 🔒 **ES添削の prompt injection 対策を強化**
  - `参考ESの開示要求` と `SQL / 個人情報抽出要求` を高リスク遮断に追加
  - `content` 以外の prompt 入力もサーバー入口で検査・無害化するよう更新
- 📝 **ES添削ドキュメントを更新**
  - `docs/features/ES_REVIEW.md` に company evidence cards、reference quality profile、soft-min policy を反映

### 2026-03-09
- ✨ **ES添削ストリーミング UX を更新**
  - 当時は `改善案 → 改善ポイント → 出典リンク` の順で単一カード表示
  - 現在は rewrite-only へ移行済み
  - 表示完了時はカーソルを自動で消すように調整
- 🧹 **ES添削の未使用 UI コードを削除**
  - 旧 UI の残骸だった未使用コンポーネントを整理
- 📝 **ES添削ドキュメントを更新**
  - `docs/features/ES_REVIEW.md` を現行 UI と SSE 契約に合わせて更新
  - `docs/INDEX.md` の ES添削説明を更新

### 2026-02-04
- 📝 **README.md 日本語化**
  - プロジェクト説明を日本語に翻訳
  - 技術スタックにChromaDB、ベクトルDBを追加
  - 主な機能セクションを追加
- 🔍 **企業検索精度向上**
  - 3文字未満ドメインパターンの許可リスト（short_domain_allowlist）を導入
  - COMPANY_QUERY_ALIASESで企業ブランド名/英語名の検索クエリを拡充
  - 他社プレフィックス衝突による子会社誤検出を防止
  - 除外ドメインリストを拡充（Wikipedia、金融情報サイト等）
- ✨ **ES添削UI改善**
  - 比較ビュー（Before/After）を追加
  - タブベースのリライト表示を実装
  - RAGソース情報をUI表示に含める
- 🔒 **セキュリティ強化**
  - SSRF対策を実装
  - CRON認証強化
  - 基本レート制限を実装
  - エラーハンドリング改善
- 🆕 **汎用ES添削テンプレート（basic）を追加**
- 📊 **統計更新**
  - セキュリティ: 🔴 0/0/3 → 0/2/1（レート制限を部分実装に変更）
  - 完了率: 72%（部分実装50%計算で約80%）

### 2026-02-03（SPEC.md更新）
- 📋 **SPEC.md 機能変更**
  - ❌ ESテンプレート共有/公開ギャラリー機能をMVPから削除
  - ✅ 志望動機作成機能（Section 17.5）を追加
  - 画面一覧からESテンプレ管理/公開ギャラリーを削除
  - ゲスト/Free制限からテンプレ作成上限を削除
- 📝 **PROGRESS.md 連動更新**
  - 画面一覧を更新（ESテンプレ管理/公開ギャラリー削除、志望動機作成追加）
  - 統計サマリーを更新（画面: 17→16、完了合計: 133→132）

### 2026-02-03（ドキュメント更新）
- 📝 **PROGRESS.md 自動更新**
  - バックエンドセクションに「志望動機作成」ルーターを追加
  - Next.js APIセクションを新規追加（ES添削ストリーミング、志望動機API）

### 2026-02-03
- 📁 **docsフォルダを整理**
  - サブフォルダ構成に変更: `setup/`, `architecture/`, `features/`, `testing/`
  - `INDEX.md` を作成（目次・ナビゲーション）
  - 各ファイル間の相対パスリンクを更新
- ✅ **志望動機作成機能（AI対話形式）を追加**（Section 17.5）
  - ESテンプレートギャラリー機能の代替として実装
  - 対話形式での深掘り、6要素評価、企業RAG連携
  - ES下書き生成（300/400/500文字指定）
  - 関連ファイル: `backend/app/routers/motivation.py`, `src/app/companies/[id]/motivation/page.tsx`
- ❌ **ESテンプレートギャラリー機能を削除**
  - Section 16.9 の内容を削除
- 統計サマリーを更新（実装完了率: 70%→71%）

### 2026-01-30
- ✅ 検索機能が実装済みであることを確認・反映
  - `/api/search` API実装済み
  - `/search` ページ実装済み
  - `SidebarSearch`, `SearchPageClient`, `SearchResults`, `SearchResultItem`, `SearchHighlight` コンポーネント
  - `useSearch` フック（デバウンス、abort制御付き）
- 実装完了率を68%→70%に更新（検索機能の正確な反映）
- 高優先度から検索機能を完了として更新
- SPEC.mdに新規追加されたセクション22-25を反映
  - 22. 検索機能（グローバル全文検索）→ **実装済み**
  - 23. データエクスポート（PDF/CSV出力）
  - 24. APIセキュリティ（レートリミット）
  - 25. 将来拡張（LINE通知など）
- 非機能仕様の詳細項目を追加（パフォーマンス、セッション、オフライン、A11y）
- 認証・アカウントにゲストデータ警告、利用規約同意を追加
- クレジット仕様に0.5累積バー表示、部分成功UXを追加
- 通知に日次通知時刻選択、削除機能を追加
- カレンダー連携に同期エラーリトライ、外部削除同期を追加
- ESエディタにモバイル縦積み、復元時確認モーダルを追加
- AI添削に並列添削、編集ロック、英語ES対応、スパム対策を追加
- ガクチカに再実行時の履歴保持を追加
- 実装優先度リストを更新

### 2026-03-24
- ✅ ES添削から Cohere provider を削除
  - shared LLM layer から Cohere routing / env / live gate / provider-specific test を削除
  - ES添削の標準経路と docs は `Claude / GPT / Gemini / low-cost` のみを current-state として更新

### 2026-03-12
- ✅ ES添削の標準モデル経路に商用API provider routing を追加
  - `MODEL_ES_REVIEW` で `gpt-5.1`, `gemini-3.1-pro-preview`, `deepseek-chat` などの明示モデルIDを指定可能に更新
  - Gemini は公式 API、DeepSeek は OpenAI compatibility API で扱うよう整理
  - `review_meta.llm_provider / llm_model` を標準経路でも正しく返すように更新
  - フロントの標準経路ラベルを `Claude` 固定ではなく実選択モデルベースへ変更
- ✅ ES添削パネルに `モデル選択` dropdown を追加
  - 標準添削は `Claude Sonnet 4.5 / GPT-5.1 / Gemini 3.1 Pro Preview / DeepSeek V3.2` を UI から選択可能に更新
  - 低コスト導線を `GPT-5.4-mini` ベースに統一

### 2026-03-13
- ✅ GPT-5.1 の 400字設問 under-min を prompt 主導で改善
  - 非Claudeの 300〜500 字 required 設問に 4 文構成 guidance を追加し、`role_course_reason` などで短くまとまりすぎる失敗を抑制
  - `under_min` が続く場合は 3 回目以降に length-focused retry へ切り替え、最後の length-fix も 45 字不足まで救済するよう更新
  - Claude の prompt / transport / 挙動は変更せず、標準モデル側だけを調整
- ✅ ES添削の企業補強を current-run で使えるように更新
  - ユーザーが手動追加した URL / PDF は `user_provided_corporate_urls` として最優先 evidence 扱いに変更
  - 企業RAG はユーザーが選択して保存した公開ソースのみを使うように変更
- ✅ ES添削の required 設問で role grounding 判定を厳格化
  - `employee_interviews` 1件だけでは `role_grounded` に上げず、role/company の片軸欠けがある `partial` でも second pass が動くように更新
- ✅ 企業検索の official score を補正
  - official domain であれば title の表記揺れだけでは `企業不一致ペナルティ` を入れないように修正
  - `mysite.bk.mufg.jp` のような実質公式の recruit/interview URL が不自然に `medium` へ落ちにくくなった
- ✅ ES添削の標準モデル UI を stable allowlist 化
  - UI では `Claude Sonnet 4.5`、`GPT-5.1`、`Gemini 3.1 Pro Preview` を selectable にし、`DeepSeek V3.2` は `現在調整中` として継続無効化
  - Gemini 3.1 は Google 互換 schema 正規化、`thinkingLevel=LOW`、追加 token budget、低温度固定を入れて ES添削の template smoke を通過

### 2026-01-29
- ✅ 提出物（履歴書/ES）の削除保護を実装（API & UI両方）
- ✅ 部分クレジット消費（0.5）を実装（締切抽出失敗時の累積方式）
- ✅ IMPLEMENTATION_STATUS.md を実際の実装状況に合わせて大幅更新
  - テンプレート作成制限：既に実装済み
  - 応募枠上限・フェーズテンプレート：既に実装済み
  - 企業ソート/ピン留め：既に実装済み
  - 通知設定UI：既に実装済み
  - ギャラリーランキング：既に実装済み
  - カレンダー接頭辞[就活Pass]：既に実装済み
- ✅ 実装完了率を73%→81%に更新

### 2026-01-28
- ✅ 締切承認時の標準タスク自動作成を実装
- ✅ 初期ESテンプレ5種をSPEC.md準拠に更新（インターン①②③/早期選考/本選考）
- ✅ 日次通知バッチ処理を実装（Vercel Cron JST 9:00）
- ✅ アカウント削除機能が既に実装済みであることを確認
- ✅ 提出済み連動（タスク一括完了）が既に実装済みであることを確認
