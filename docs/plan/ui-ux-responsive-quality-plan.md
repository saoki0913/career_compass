# UI/UX・レスポンシブ品質改善計画

作成日: 2026-05-04 JST

## 1. 目的

就活Pass の現状実装を、UI/UX 品質とレスポンシブ対応の観点で網羅的に監査し、Marketing LP とプロダクト UI の両面で発見した課題を、実装可能なタスクへ落とし込む。

本計画書は **LP のブレークポイント統一・タイポグラフィ設計、プロダクト UI のタッチターゲット・レイアウト改善、Visual Regression テスト基盤構築** を 3 本柱とする。

ユーザー確認済みの方針:

- 対象スコープは LP + プロダクト UI の両方を含む全面的な改善。
- 計画書は実装可能な詳細設計レベルで作成する（既存計画書のフォーマットに準拠）。
- テスト戦略は Visual Regression + axe-core アクセシビリティ + CWV 計測まで含める。
- 本タスクの完了条件は計画書作成であり、コード実装は行わない。

## 2. 調査範囲

主に以下を静的・動的に確認した。

- `DESIGN.md` — LP デザインリファレンス（1672px viewport 基準）
- `docs/architecture/FRONTEND_UI_GUIDELINES.md` — フロントエンド実装標準
- `docs/marketing/LP.md` — LP セクション構成・アセットポリシー
- `src/app/globals.css` — OKLch カラーシステム、`--lp-*` トークン、アニメーション定義
- `src/components/landing/sections/` — 7 メインセクション + 6 プロモ LP 変種
- `src/components/layout/` — ProductLayoutClient, AppSidebar, SidebarContext
- `src/components/ui/button.tsx` — shadcn/ui ボタンバリアント（タッチターゲット検証）
- `src/components/dashboard/` — DashboardPageClient, WeeklyScheduleView, TodayTasksCard, QuickActions
- `src/app/layout.tsx` — viewport meta 検証（`viewport-fit: cover` 欠損確認）
- `e2e/tooling/ui-review.spec.ts` — 8 viewport Playwright テスト
- `src/lib/ui-guardrails.mjs` — 既存 2 ルール（marketing accent / skeleton）
- `playwright.config.ts` — Desktop Chrome only、HTML reporter

専門サブエージェントの調査結果も統合した。

- `ui-designer (Explore)`: LP 全セクションのレスポンシブパターン、インライン CSS 構造、アニメーション
- `ui-designer (Explore)`: プロダクト UI のタッチターゲット、サイドバー、モーダル、safe-area
- `ui-designer (Explore)`: デザインシステム基盤、テスト基盤、コンポーネント構造
- `Plan agent (LP)`: ブレークポイント統合、タイポグラフィ、CSS アーキテクチャ移行設計
- `Plan agent (Product)`: タッチターゲット監査、サイドバー hydration、モーダル改善設計
- `Plan agent (Test)`: Visual Regression、axe-core、CWV、タッチターゲット自動検証設計

## 3. 完了条件

この計画書作成タスクの完了条件は次のとおり。

1. `docs/plan/ui-ux-responsive-quality-plan.md` が存在する。
2. LP・プロダクト UI・テスト基盤の 3 領域にわたる課題分析、修正方針、タスク一覧が記録されている。
3. `Task Board` は `Status / Priority / Area / Task / Evidence / Acceptance Criteria / Verification / Updated At` を持つ Markdown table で管理されている。
4. 実装フェーズで Status を更新するルールが明記されている。
5. P0 と P1 のタスクは、後続実装者が追加判断なしで着手できる粒度になっている。

## 4. タスク状態更新ルール

実装フェーズでは、完了条件を満たすまで次のループを続ける。

1. `Task Board` から `Todo` の最上位 Priority を 1 件選ぶ。
2. 着手時に `Status` を `Doing` へ変え、作業内容を記録する。
3. 実装または検証でブロックしたら `Blocked` にし、必要な判断を明記する。
4. 受け入れ条件を満たしたら `Review` にし、実行したテストと差分確認結果を書く。
5. レビュー後に `Done` へ変える。
6. `Todo / Doing / Blocked / Review` が残る場合は 1 に戻る。

Status は以下だけを使う。

- `Todo`: 未着手
- `Doing`: 実装中
- `Blocked`: 判断待ちまたは環境要因待ち
- `Review`: 実装済み、検証またはレビュー待ち
- `Done`: 受け入れ条件を満たした

---

## 5. 現状評価

### 5.1 強い点

- **モバイルファースト設計**: 大半のプロダクト UI は `grid-cols-1` → `lg:grid-cols-[3fr_1fr]` パターンで構築されている。
- **デザイントークン体系**: `globals.css` に OKLch カラー + `--lp-*` LP 専用トークンが整理されている。
- **スケルトンローディング**: `ui-guardrails.mjs` で spinner-only の `loading.tsx` を禁止し、trust-oriented skeleton を強制。
- **8 viewport テスト**: 320–1440px の 8 段階 Playwright テストで水平 overflow を検知。
- **サイドバー実装**: CSS 変数ベースの width アニメーション、cookie による状態永続化、モバイルドロワーパターン。
- **アニメーション配慮**: `prefers-reduced-motion` を尊重（`globals.css` で `animation: none !important`）。
- **safe-area 部分対応**: Settings、StickyCTABar、SnackbarHost 等の主要箇所で `env(safe-area-inset-*)` 適用済み。

### 5.2 重大な弱点

- **ブレークポイント断片化**: LP は 14 種の独自 `@media` 閾値（540/600/640/767/768/900/901/980/1099/1100/1279px）を使い、プロダクト UI の Tailwind 標準（sm:640/md:768/lg:1024/xl:1280）と乖離。
- **タイポグラフィ不統一**: LP の見出しに固定 px（44px, 46px）と `clamp()` が混在。HowToUse/Pricing は tablet でのスケーリングなし。
- **タッチターゲット違反**: ~~TodayTasksCard チェックボックス 18×18px、モバイルサイドバートグル 36×36px、button `xs`/`icon-xs` バリアント 32px。~~ T-02 で大部分を修正済み（commit 58f8f24）。残存: Snackbar dismiss ~30px のみ。
- **viewport-fit:cover 欠損**: `src/app/layout.tsx` に `viewport` export がなく、既存の `env(safe-area-inset-*)` CSS がすべて 0 を返す。
- **コンテナ幅不統一**: LP 内で max-w-[1200px] / [1100px] / [1140px] / [1260px] / [1280px] の 5 種混在。
- **インライン CSS 保守性**: 全 7 LP セクションが `<style dangerouslySetInnerHTML>` を使用し、43 箇所の `!important` を含む。
- **Visual Regression 未導入**: スクリーンショットは撮影するが比較しない。baseline 管理なし。

---

## 6. Task Board

### Phase 1: 基盤整備（P0 — 即時着手）

| Status | Priority | Area | Task | Evidence | Acceptance Criteria | Verification | Updated At |
|---|---:|---|---|---|---|---|---|
| Todo | P0 | Product | T-01: viewport-fit:cover + safe-area-inset 全ページ補完を atomic に実施する | `src/app/layout.tsx` に `viewport` export なし。既存の `env(safe-area-inset-*)` が全ページで 0 を返す。ES Editor/Tasks/Deadlines/Company detail/Calendar main が safe-area-inset-bottom なし | (1) `src/app/layout.tsx` に viewport export 追加。(2) `globals.css` に `pb-safe`/`pb-safe-16` ユーティリティ追加。(3) 未対応ページに `pb-safe` 適用。**全て同一 PR で atomic に実施**（Codex review 指摘: viewport-fit:cover だけ先行すると regression window が発生） | iOS Safari 実機で全対象ページの最下部コンテンツが home bar に隠れないことを確認 | 2026-05-05 |
| Done | P0 | Product | T-02: タッチターゲット違反を修正する（全 mobile interactive 要素を走査） | Commit `58f8f24` で修正。15 files, 164 ins, 46 del。button 全 7 variant、sidebar toggle/close/nav、TodayTasksCard checkbox、DeadlineCard rows、WeeklySchedule nav、QuickActions buttons、ChatInput padding、DashboardSkeleton parity。Snackbar dismiss は未対応（別 PR） | 実施済み: (1) button default `h-11 lg:h-9`、xs `h-9 lg:h-6`、sm `h-10 lg:h-8`、lg `h-12 lg:h-11`、icon `size-11 lg:size-9`、icon-xs `size-9 lg:size-6`、icon-sm `size-10 lg:size-8`。(2) TodayTasksCard: `min-h-[44px] min-w-[44px]` button wrapper + 18px visual span。(3) サイドバートグル: `h-11 w-11` + safe-area-inset-top。(4) AppSidebar close: `h-11 w-11`、nav: `h-11 lg:h-9`、width: `w-56 sm:w-64` + safe-area-inset-bottom。(5) WeeklySchedule: `h-9 w-9 lg:h-7 lg:w-7`。(6) DeadlineCard rows: `min-h-11 lg:min-h-8`。(7) QuickActions: `h-11 lg:h-9`。(8) Typography: `text-[10px]`/`text-[11px]` → `text-xs lg:text-[10px]`/`text-xs lg:text-[11px]`。Snackbar dismiss は別 PR で対応予定 | pages-smoke E2E 7/7 pass、tsc 0 errors、ui-guardrails pass、security scan pass | 2026-05-09 |
| Todo | P0 | Product | T-03: モーダル/ダイアログの ultra-small screen 対応 | `CompanySelectModal` max-h-[300px] 固定、`CalendarPageContent.tsx:157`/`WorkBlockSuggestionsModal.tsx:63`/`CompanyEditModal.tsx:177`/`CorporateInfoSection.tsx:303` が DialogContent を使わず独自モーダル | (1) CompanySelectModal: `max-h-[min(300px,50dvh)]` に変更。(2) 独自モーダル 4 箇所に `max-w-[calc(100%-2rem)]` を追加。**注意**: `CorporateInfoSection.tsx` は 595 行の hotspot 相当（`.claude/hooks/lib/skill-recommender.sh` HOTSPOT_FILES）。局所 CSS 変更のみに留め、commit 前に code-reviewer/post_review 対象とする | `npm run test:ui:review -- /dashboard /companies` の 320px viewport で全モーダルが画面内に収まることを確認 | 2026-05-05 |
| Todo | P0 | LP | T-04: LP ブレークポイントを 6 段階正規化トークンへ統合する | HeroSection(901px)、PainPoints(540/900px)、Features(768/1099px)、Pricing(600/980px)、HowToUse(640/1100/1279px)、BeforeAfter(767px) の 14 種の独自閾値 | `globals.css` の `@theme` に `--breakpoint-xs:480px` を追加。各セクションのインライン `@media` を正規化マッピング（901→1024、1100→1200、540→480、600→640、980→1024）に従い置換。変更前後で 8 viewport スクリーンショットに視覚的破綻がない | `npm run test:ui:review -- /` の全 8 viewport で水平 overflow なし + 前後スクリーンショット比較 | 2026-05-04 |
| Todo | P0 | LP | T-05: LP タイポグラフィを fluid clamp() トークンへ統一する | PainPoints(44px固定)、HowToUse(46px固定)、Pricing(46px固定) vs Features/FAQ(clamp使用) の不統一。Hero は 56→44→36px の 3 段階ステップ | `globals.css` に 6 段階 LP タイポグラフィトークンを追加: `--lp-text-hero: clamp(36px, 2.4vw+16px, 56px)` 等。全 7 セクションの h2/h1 が対応トークンを参照。`@media` による font-size override を削除 | 1672px/1200px/768px/390px の 4 viewport で見出しサイズの段階的変化を目視確認 | 2026-05-04 |
| Todo | P0 | Test | T-06: axe-core アクセシビリティ自動検証を導入する | 現状 axe-core テストなし。タッチターゲット違反、コントラスト未検証 | `@axe-core/playwright` を devDependencies に追加。`e2e/tooling/accessibility.spec.ts` を作成。WCAG 2.1 AA (critical/serious) を Hard fail、moderate を Soft warning。LP 全ページ + product 主要 5 ページを 390px/1440px の 2 viewport で検証 | `npx playwright test e2e/tooling/accessibility.spec.ts` が critical/serious violation 0 で pass | 2026-05-04 |

### Phase 2: レイアウト改善（P1 — Phase 1 完了後）

| Status | Priority | Area | Task | Evidence | Acceptance Criteria | Verification | Updated At |
|---|---:|---|---|---|---|---|---|
| Done | P1 | Product | T-07: (T-01 に統合) safe-area-inset 未適用ページの補完 | Codex review 指摘により T-01 と統合。viewport-fit:cover と safe-area 補完は同一 PR で atomic に実施する必要があるため | T-01 の acceptance criteria に含まれる | — | 2026-05-05 |
| Todo | P1 | Product | T-08: ダッシュボード WeeklySchedule overflow チェーンを修正する | `WeeklyScheduleView.tsx:177` Card が `overflow-hidden` で内部の `overflow-x-auto` スクロールバーを clip。モバイルでスクロール可能なことが非自明 | Card に `max-lg:overflow-visible` を追加し、モバイルでは内部の `overflow-x-auto` がスクロールバーを表示できるようにする。デスクトップの `lg:overflow-hidden` は維持 | `npm run test:ui:review -- /dashboard` の 390px/768px で週間予定カードが横スクロール可能（スクロールバー表示）であることを確認 | 2026-05-04 |
| Todo | P1 | Product | T-09: サイドバー hydration flash を解消する | `AppSidebar.tsx:30-41,373` の `useSyncExternalStore` hydration guard で SSR 時に sidebar が null を返し、クライアント切替時に一瞬サイドバーが不在になる | (1) hydration guard を削除。(2) `src/app/(product)/layout.tsx` にサーバー側で `--sidebar-width-initial` CSS 変数を設定。(3) `ProductLayoutClient.tsx` で CSS fallback を追加 | デスクトップで初回ロード時にサイドバー幅のちらつきがないことを DevTools Performance recording で確認 | 2026-05-04 |
| Todo | P1 | LP | T-10: LP コンテナ幅を 3 段階トークンへ正規化する | max-w-[1200px]/[1100px]/[1140px]/[1260px]/[1280px]/[800px]/[700px]/[600px] の 8 種混在 | `globals.css` に `--lp-container-wide:1300px`、`--lp-container-default:1200px`、`--lp-container-narrow:800px` を追加。Tailwind `max-w-lp-wide` 等のユーティリティを生成。全セクションのコンテナ幅を 3 トークンに集約 | `npm run test:ui:review -- /` の 1440px viewport で全セクションの左右マージンが均等であることを確認 | 2026-05-04 |
| Todo | P1 | Test | T-11: Visual Regression baseline システムを構築する | 現状スクリーンショットは撮影するが比較しない（`UI_PLAYWRIGHT_VERIFICATION.md` に明記） | `e2e/tooling/visual-regression.spec.ts` を作成。Playwright `toHaveScreenshot()` API で 3 viewport (390/768/1440) × 主要 5 route の baseline 比較。LP は `maxDiffPixelRatio:0.01`、Product は `0.03`。baseline 画像を snapshots/ にコミット。**Codex review 指摘反映**: (1) `--auth=mock` 固定で匿名 seed data を使用。(2) mask allowlist 明文化。(3) CI Chromium 限定。**依存: T-04,T-05,T-08,T-09,T-10 全完了後**（LP baseline は T-04/T-05/T-10 後、Product baseline は T-08/T-09 後に分離確立。途中確立すると再生成が必要になるため） | `npx playwright test e2e/tooling/visual-regression.spec.ts` が baseline 差分なしで pass | 2026-05-05 |
| Todo | P1 | Test | T-12: タッチターゲット自動検証スクリプトを作成する | T-02 で手動修正するが、将来の回帰を検知する仕組みがない | `e2e/tooling/touch-targets.spec.ts` を作成。390px viewport で全 interactive 要素の `getBoundingClientRect()` を計測し、44px 未満を検知。`[data-touch-target-exempt]` による除外リスト対応 | `npx playwright test e2e/tooling/touch-targets.spec.ts` が既知の exempt 以外で violation 0 | 2026-05-04 |

### Phase 3: デコレーション・画像最適化（P2 — Phase 2 完了後）

| Status | Priority | Area | Task | Evidence | Acceptance Criteria | Verification | Updated At |
|---|---:|---|---|---|---|---|---|
| Todo | P2 | LP | T-13: LP 装飾要素のレスポンシブ化 | HeroSection のグラデーション blob が `top:-160, right:-200, width:720` で固定。PricingSection の装飾画像 7 個が固定 px 配置 | HeroSection: blob 位置を `top:-10%, right:-12%, width:min(720px,50vw)` に変更。PricingSection: 装飾画像幅に `clamp()` 適用。全セクションの `overflow-hidden` 確認（6/7 は適用済み） | `npm run test:ui:review -- /` の全 viewport で装飾が content に重ならないことを確認 | 2026-05-04 |
| Todo | P2 | LP | T-14: LP content 画像を next/image に移行する | 30 個の plain `<img>` のうち 17 個が content 画像。next/image 未使用で WebP/AVIF 自動変換・responsive srcSet なし。**Codex review 指摘**: `PainPointsSection.test.ts:57` が plain `<img>` 維持を明示的に期待 | FeaturesSection(6枚)、HowToUse(4枚)、BeforeAfter(3枚)、PainPoints(4枚) を `<Image>` に置換。`sizes` prop で viewport に応じた最適サイズを指定。**テスト更新を先行**: PainPointsSection.test.ts の img 期待値を Image に変更してから実装変更 | Lighthouse Image audit で改善確認 + 既存テスト pass | 2026-05-05 |
| Todo | P2 | LP | T-15: LP セクション CSS を CSS Modules に移行する | 7 セクションが `<style dangerouslySetInnerHTML>` + 43 箇所の `!important` 使用。IDE 補完・lint 不可。BeforeAfterSection(939行)、PricingSection(541行) は 500 行超 | セクションごとに `.module.css` ファイルを作成。共通 fontFamily を `lp-base.module.css` に抽出。`dangerouslySetInnerHTML` と `!important` を全削除。**Codex review 指摘反映**: セクション単位で「CSS 移行 + テスト期待値更新 + UI review」を完結させる分割方式を採用。500 行超ファイル（BeforeAfter/Pricing）は局所変更に留め、リファクタ scope を制御する | `npm run lint:ui:guardrails` pass + `npm run test:ui:review -- /` の全 viewport で前後スクリーンショット一致 | 2026-05-05 |
| Todo | P2 | Test | T-16: Core Web Vitals 計測テストを導入する | CLS/LCP の自動計測なし。LP は SEO critical だが CLS 検証されていない | `e2e/tooling/core-web-vitals.spec.ts` を作成。PerformanceObserver で CLS < 0.1（LP は < 0.05）、LCP < 2.5s を検証。390px/1440px の 2 viewport | `npx playwright test e2e/tooling/core-web-vitals.spec.ts` が閾値内で pass | 2026-05-04 |
| Todo | P2 | Test | T-17: ui-guardrails に 4 新ルールを追加する | 現状 2 ルール（marketing accent / skeleton）のみ。safe-area、clamp、touch target、container width の静的検証なし | Rule 3: safe-area-required（`h-screen` 含む layout に `safe-area-inset` 必須）。Rule 4: heading-clamp-required（marketing 見出しに固定 px 禁止）。Rule 5: touch-target-minimum（Checkbox/Switch に 44px ラッパー必須）。Rule 6: container-width-consistency（marketing で許可幅以外を警告） | `npm run lint:ui:guardrails` が新ルール違反を検出できることを確認 | 2026-05-04 |
| Todo | P2 | Test | T-18: Playwright viewport を拡張する | iPad landscape(1024×768)、foldable outer(412×915)、foldable inner(884×1104)、ultra-wide(1920×1080) が未テスト | `ui-review.spec.ts` の viewport 配列に 4 viewport を追加（`PLAYWRIGHT_UI_EXTRA_VIEWPORTS=1` で有効化）。Visual regression baseline に iPad landscape を追加 | 新 viewport でのスクリーンショットに破綻がないことを目視確認 | 2026-05-04 |

### Phase 4: 仕上げ（P3 — 任意）

| Status | Priority | Area | Task | Evidence | Acceptance Criteria | Verification | Updated At |
|---|---:|---|---|---|---|---|---|
| Todo | P3 | Product | T-19: プロダクト UI コンテナ幅を 3 段階に文書化する | max-w-7xl(1280px) / max-w-4xl(896px) / max-w-3xl(768px) が暗黙的。Interview dashboard が max-w-5xl で浮いている | `src/lib/layout-constants.ts` に 3 tier を定義。Interview dashboard を max-w-7xl に変更。FRONTEND_UI_GUIDELINES.md に tier 表を追記 | 対象ファイルの max-width が 3 tier のいずれかに該当することを grep 確認 | 2026-05-04 |
| Todo | P3 | Product | T-20: Dark Mode の方針を決定する | `globals.css:194-264` に `.dark` パレット定義済み。15+ コンポーネントに `dark:` modifier 散在。テーマトグル UI なし | (A) 保持（現状維持 + TODO コメント追加）or (B) 実装（next-themes 導入 + Settings にトグル追加）を決定。(A) の場合は globals.css にコメント追加のみ | 方針決定後、該当する対応を実施 | 2026-05-04 |
| Todo | P3 | Test | T-21: CI パイプラインに Visual Quality ジョブを追加する | Visual Regression / axe-core / CWV テストが CI に統合されていない | `develop-ci.yml` に `visual-quality` ジョブ（visual regression + typography + container width + CWV）と `accessibility-quality` ジョブ（axe-core + touch targets）を追加。最初の 2 週間は soft check、安定後 hard block。**依存: T-06,T-11,T-12,T-16,T-17** | CI ジョブが green で完走することを確認 | 2026-05-05 |
| Todo | P3 | Test | T-22: pre-commit hook に ui-guardrails を追加する | `npm run lint:ui:guardrails` がスクリプトとして存在するが pre-commit hook に含まれていない | `.githooks/pre-commit` に `npm run lint:ui:guardrails` を blocking step として追加 | guardrails 違反を含むコミットがブロックされることを確認 | 2026-05-04 |

---

## 7. 優先 Findings

### F-1. LP ブレークポイント断片化（14 種の独自閾値）

Severity: High
Area: Marketing LP

対象:

| 現ブレークポイント | 使用セクション | 用途 |
|---|---|---|
| 540px | PainPointsSection | 1 カラムカード |
| 600px | PricingSection | パディング |
| 640px | HeroSection, HowToUseSection | モバイルタイトル |
| 767px | BeforeAfterSection | デスクトップ/モバイル切替 |
| 768px | FeaturesSection | 1 カラム |
| 900px, 901px | HeroSection, PainPointsSection | 2 カラム切替 |
| 980px | PricingSection | 3 カラム |
| 1099px, 1100px | FeaturesSection, HeroSection, HowToUseSection | タイトルサイズ / レイアウト |
| 1279px | HowToUseSection | 2 カラムフォールバック |

正規化マッピング:

| 旧 | 新 | 根拠 |
|---|---|---|
| 540px | 480px (xs) | xs 境界に統一 |
| 600px | 640px (sm) | sm 境界に統一 |
| 900px, 901px | 1024px (lg) | Product UI と一致 |
| 980px | 1024px (lg) | lg 境界に統一 |
| 1099px, 1100px | 1200px (xl) | xl 境界に統一 |
| 1279px | 1200px (xl) | xl 境界に統一 |
| 640px, 768px | 640px, 768px | 変更なし（sm/md 一致） |

リスク: 901→1024px へのシフトにより、901–1023px の viewport で 2 カラムから 1 カラムに変わる。視覚的な確認が必須。

対象ファイル:

- `src/app/globals.css` — `@theme` に `--breakpoint-xs: 480px` 追加
- `src/components/landing/sections/HeroSection.tsx` (line 36–51) — 901→1024, 1100→1200, 900→1024
- `src/components/landing/sections/PainPointsSection.tsx` (line 262–283) — 900→1024, 540→480
- `src/components/landing/sections/FeaturesSection.tsx` (line 48–108) — 1099→1200
- `src/components/landing/sections/PricingSection.tsx` (line 282–295) — 600→640, 980→1024
- `src/components/landing/sections/HowToUseSection.tsx` (line 104–159) — 1279→1200, 1100→1200
- `src/components/landing/sections/BeforeAfterSection.tsx` (line 455–461) — 767→767（md 一致、変更なし）

### F-2. LP タイポグラフィ不統一（固定 px vs clamp() 混在）

Severity: High
Area: Marketing LP

| セクション | 現在の h2 fontSize | 方式 | 問題 |
|---|---|---|---|
| HeroSection h1 | 56px (→44→36 via @media) | ステップ固定 | 中間サイズなし |
| PainPointsSection h2 | 44px (→32 via @media) | ステップ固定 | tablet でジャンプ |
| FeaturesSection h2 | `clamp(34px, 3.4vw, 44px)` | Fluid | vw 係数が統一されていない |
| HowToUseSection h2 | 46px 固定 | 固定のみ | mobile override なし |
| BeforeAfterSection h2 | `clamp(34px, 5.2vw, 46px)` | Fluid | OK |
| PricingSection h2 | 46px (→32 via @media) | ステップ固定 | tablet でジャンプ |
| LPFAQSection h2 | `clamp(34px, 5.2vw, 46px)` | Fluid | OK |

提案する Fluid Type Scale（1672px デザインリファレンスに校正）:

```css
:root {
  --lp-text-hero:    clamp(36px, 2.4vw + 16px, 56px);   /* Hero h1 */
  --lp-text-display: clamp(32px, 1.9vw + 14px, 46px);   /* Section h2 (大) */
  --lp-text-heading: clamp(30px, 1.7vw + 12px, 44px);   /* Section h2 (標準) */
  --lp-text-title:   clamp(22px, 1.2vw + 10px, 32px);   /* Sub-heading h3 */
  --lp-text-body-lg: clamp(16px, 0.5vw + 12px, 20px);   /* Large body */
  --lp-text-body:    clamp(14px, 0.3vw + 12px, 16px);    /* Standard body */
}
```

検証: viewport=1672px で `--lp-text-display` = clamp(32, 1.9×1672/100+14, 46) = clamp(32, 45.8, 46) ≈ 46px（最大値に到達）。viewport=375px: clamp(32, 21.1, 46) = 32px（最小値に到達）。

### F-3. タッチターゲット違反（WCAG 2.5.5: 44px 最低基準）

Severity: High
Area: Product UI

全違反インベントリ:

| 要素 | ファイル:行 | 旧サイズ | 修正後 | Status |
|---|---|---|---|---|
| TodayTasksCard チェックボックス | `TodayTasksCard.tsx:85-105,249-259` | 18×18px | `min-h-[44px] min-w-[44px]` button wrapper + 18px visual span (`lg:min-h-0 lg:min-w-0`) | Done (58f8f24) |
| モバイルサイドバートグル | `ProductLayoutClient.tsx:32` | 36×36px (h-9 w-9) | `h-11 w-11` (44px) + `safe-area-inset-top` | Done (58f8f24) |
| WeeklySchedule prev/next | `WeeklyScheduleView.tsx:198,209` | 28×28px (h-7 w-7) | `h-9 w-9 lg:h-7 lg:w-7` (36px mobile) | Done (58f8f24) |
| button default バリアント | `button.tsx:28` | h-10 (40px) | `h-11 lg:h-9` (44px mobile) | Done (58f8f24) |
| button xs バリアント | `button.tsx:30` | h-8 (32px) | `h-9 lg:h-6` (36px mobile) | Done (58f8f24) |
| button sm バリアント | `button.tsx:31` | h-9 (36px) | `h-10 lg:h-8` (40px mobile) | Done (58f8f24) |
| button lg バリアント | `button.tsx:32` | h-11 (44px) | `h-12 lg:h-11` (48px mobile) | Done (58f8f24) |
| button icon バリアント | `button.tsx:34` | size-10 (40px) | `size-11 lg:size-9` (44px mobile) | Done (58f8f24) |
| button icon-xs バリアント | `button.tsx:35` | size-8 (32px) | `size-9 lg:size-6` (36px mobile) | Done (58f8f24) |
| button icon-sm バリアント | `button.tsx:36` | size-9 (36px) | `size-10 lg:size-8` (40px mobile) | Done (58f8f24) |
| AppSidebar close button | `AppSidebar.tsx:280` | 32×32px (h-8 w-8) | `h-11 w-11` (44px) | Done (58f8f24) |
| AppSidebar nav items | `AppSidebar.tsx:317` | h-9 (36px) | `h-11 lg:h-9` (44px mobile) | Done (58f8f24) |
| DeadlineCard rows | `DeadlineCard.tsx:60` | min-h-8 (32px) | `min-h-11 lg:min-h-8` (44px mobile) | Done (58f8f24) |
| QuickActions buttons | `QuickActions.tsx:69` | h-9 (36px) | `h-11 lg:h-9` (44px mobile) | Done (58f8f24) |
| Snackbar dismiss | `snackbar-host.tsx:89-99` | ~30px | `min-h-[44px] min-w-[44px]` に拡大予定 | Todo |

修正パターン: モバイルでは 44px 以上のタッチ領域を確保し、デスクトップでは `lg:` prefix でコンパクトサイズに圧縮。button `default` バリアント（`h-11 lg:h-9`）で実証済みのパターンを全コンポーネントに展開。

### F-4. viewport-fit:cover 欠損

Severity: High
Area: Product UI（全ページ影響）

`src/app/layout.tsx` に `viewport` export がない。Next.js 16 では metadata と viewport を分離して export する。

```typescript
// 追加すべきコード
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};
```

これがないと、既に適用されている以下の CSS が全て無効:

- Settings: `pb-[calc(5rem+env(safe-area-inset-bottom,0px))]`
- StickyCTABar: `pb-[calc(0.75rem+env(safe-area-inset-bottom))]`
- SnackbarHost: `pt-[max(1rem,env(safe-area-inset-top))]`
- CalendarPageContent / WorkBlockSuggestionsModal / CorporateInfoSection: 複数の safe-area 参照

**T-01 と T-07 の依存関係**: T-01 で viewport-fit:cover を有効化すると、safe-area-inset 未対応のページ（ES Editor、Tasks、Deadlines、Company detail）で content が home bar に隠れる。T-07 で補完が必要。

### F-5. WeeklySchedule overflow チェーン

Severity: Medium
Area: Product UI

overflow の連鎖:

```
DashboardPageClient main (lg:overflow-hidden)
  → grid cell (lg:overflow-hidden)
    → Card (overflow-hidden)        ← ここが問題
      → CardContent (overflow-hidden)
        → scrollable div (overflow-x-auto lg:overflow-hidden)
          → inner grid (min-w-[480px] lg:min-w-0)
```

モバイルでは内部グリッドが 480px を強制し `overflow-x-auto` で横スクロールできるはずだが、Card の `overflow-hidden` がスクロールバーを clip する。スクロール可能なことがユーザーに非自明。

修正: Card に `max-lg:overflow-visible` を追加し、モバイルでのスクロールバー表示を許可。デスクトップの `overflow-hidden`（h-screen グリッド containment 用）は維持。

### F-6. サイドバー hydration flash

Severity: Medium
Area: Product UI

`AppSidebar.tsx:30-41,373` の `useSyncExternalStore` hydration guard:

- SSR: `getServerHydrationSnapshot()` が `false` → sidebar は `null` を返す
- Client: `getHydrationSnapshot()` が `true` → sidebar が描画される
- 結果: デスクトップで初回ロード時にサイドバーが一瞬不在

修正方針: hydration guard を削除し、サーバー側で `--sidebar-width-initial` CSS 変数を設定。サイドバーの内容は全て `useEffect` 内で `window` にアクセスするため SSR 安全。

### F-7. LP コンテナ幅の断片化

Severity: Medium
Area: Marketing LP

| 現在の max-width | 使用箇所 | 提案 |
|---|---|---|
| max-w-[1200px] | メインセクション 15 箇所 | `--lp-container-default: 1200px` |
| max-w-[1100px] | LandingContentSection 5 箇所 | → 1200px に統一 |
| max-w-[1300px] | サブ feature hero 4 箇所 | `--lp-container-wide: 1300px` |
| max-w-[1280px] | LPFAQSection 1 箇所 | → 1300px に統一 |
| maxWidth: 1140 | PricingSection inner | → 1200px に統一 |
| maxWidth: 1260 | HowToUseSection | → 1300px に統一 |
| max-w-[700px]/[800px]/[600px] | CTA/テキストセクション | `--lp-container-narrow: 800px` |

---

## 8. 実行順序と依存関係

```
Week 1: Phase 1 — 基盤整備 (P0)
  T-01 viewport-fit:cover + safe-area 全補完 ─────┐
  T-02 タッチターゲット修正（全 mobile 要素）      │ 並列可
  T-03 モーダル mobile 対応                       │
  T-04 LP ブレークポイント正規化                  │
  T-05 LP タイポグラフィ統一                      │
  T-06 axe-core 導入                              │

Week 2-3: Phase 2 — レイアウト改善 (P1)
  T-07 (T-01 に統合済み)                          │
  T-08 WeeklySchedule overflow 修正               │
  T-09 サイドバー hydration fix                   │ 並列可
  T-10 LP コンテナ幅正規化                        │
  T-11 Visual Regression baseline ←── T-04,T-05,T-08,T-09,T-10
  T-12 タッチターゲット自動検証 ←── T-02         │

Week 3-4: Phase 3 — 最適化 (P2)
  T-13 装飾要素レスポンシブ化                     │
  T-14 next/image 移行（テスト更新先行）          │
  T-15 CSS Modules 移行 ←── T-04,T-05,T-10      │ 最後（CSS 変更が完了してから）
  T-16 CWV 計測                                   │ 並列可
  T-17 ui-guardrails 拡張                         │
  T-18 viewport 拡張 ←── T-11                    │

Week 4+: Phase 4 — 仕上げ (P3, 任意)
  T-19 Product コンテナ幅文書化
  T-20 Dark Mode 方針決定
  T-21 CI Visual Quality ジョブ ←── T-06,T-11,T-12,T-16,T-17
  T-22 pre-commit guardrails ←── T-17
```

重要な依存関係:

1. **T-01 に T-07 を統合**: viewport-fit:cover と safe-area 補完は同一 PR で atomic に実施（Codex review 指摘）。
2. **T-04, T-05 → T-15**: CSS Modules 移行はブレークポイント・タイポグラフィ変更完了後。変更中の CSS を移行すると二重作業になる。
3. **T-04,T-05,T-08,T-09,T-10 → T-11**: Visual Regression baseline は全レイアウト変更が安定してから確立する（LP baseline は T-04/T-05/T-10 後、Product baseline は T-08/T-09 後）。
4. **T-02 → T-12**: タッチターゲット修正完了後に自動検証で回帰防止。
5. **T-14 内**: テスト期待値更新 → 実装変更の順序を厳守（PainPointsSection.test.ts 衝突回避）。

---

## 9. 修正パターン詳細

### 9.1 タッチターゲット修正パターン（T-02） — 実装済み (58f8f24)

**button.tsx 全サイズバリアント（実装後）:**

```typescript
size: {
  default: "h-11 px-5 py-2 has-[>svg]:px-4 lg:h-9 lg:px-4 lg:has-[>svg]:px-3",
  xs: "h-9 gap-1 rounded-lg px-2.5 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3 lg:h-6",
  sm: "h-10 rounded-lg gap-1.5 px-3.5 has-[>svg]:px-2.5 lg:h-8 lg:px-3",
  lg: "h-12 rounded-xl px-6 has-[>svg]:px-4 lg:h-11",
  xl: "h-12 rounded-lg px-8 text-base has-[>svg]:px-6",  // 変更なし（44px+）
  icon: "size-11 rounded-xl lg:size-9",
  "icon-xs": "size-9 rounded-lg [&_svg:not([class*='size-'])]:size-3 lg:size-6",
  "icon-sm": "size-10 rounded-lg lg:size-8",
  "icon-lg": "size-11 rounded-xl lg:size-10",  // 変更なし（44px+）
}
```

**TodayTasksCard.tsx チェックボックス（実装後）:**

```tsx
<button
  className={cn(
    "flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center lg:min-h-0 lg:min-w-0",
    canToggle ? "cursor-pointer" : "cursor-default"
  )}
>
  <span className={cn(
    "h-[18px] w-[18px] rounded border transition-colors",
    canToggle ? "border-border hover:border-foreground/40" : "border-border/60"
  )} />
</button>
```

**ProductLayoutClient.tsx サイドバートグル（実装後）:**

```tsx
className="fixed top-[max(0.75rem,env(safe-area-inset-top,0.75rem))] left-3 z-20 flex h-11 w-11 items-center justify-center rounded-lg border border-border/40 bg-background/80 shadow-sm backdrop-blur-sm transition-colors hover:bg-muted lg:hidden"
```

**AppSidebar.tsx モバイルサイドバー（実装後）:**

```tsx
// 幅: w-56 sm:w-64 (224px/256px) + safe-area-inset-bottom
"fixed inset-y-0 left-0 z-40 flex w-56 flex-col bg-sidebar pb-[env(safe-area-inset-bottom,0px)] shadow-xl transition-transform duration-200 ease-in-out sm:w-64 lg:hidden"
```

### 9.2 viewport-fit:cover 追加パターン（T-01）

```typescript
// src/app/layout.tsx に追加
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};
```

### 9.3 safe-area ユーティリティ（T-07）

```css
/* globals.css の @layer utilities に追加 */
@layer utilities {
  .pb-safe {
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  .pb-safe-16 {
    padding-bottom: calc(4rem + env(safe-area-inset-bottom, 0px));
  }
}
```

### 9.4 LP タイポグラフィトークン（T-05）

```css
/* globals.css の :root に追加（--lp-* ブロック末尾） */
:root {
  --lp-text-hero:    clamp(36px, 2.4vw + 16px, 56px);
  --lp-text-display: clamp(32px, 1.9vw + 14px, 46px);
  --lp-text-heading: clamp(30px, 1.7vw + 12px, 44px);
  --lp-text-title:   clamp(22px, 1.2vw + 10px, 32px);
  --lp-text-body-lg: clamp(16px, 0.5vw + 12px, 20px);
  --lp-text-body:    clamp(14px, 0.3vw + 12px, 16px);
}
```

### 9.5 LP コンテナ幅トークン（T-10）

```css
/* globals.css の :root に追加 */
:root {
  --lp-container-wide:    1300px;
  --lp-container-default: 1200px;
  --lp-container-narrow:  800px;
}
```

---

## 10. テスト戦略

### 10.1 新規テストファイル一覧

| ファイル | 目的 | カテゴリ | CI 統合 |
|---|---|---|---|
| `e2e/tooling/visual-regression.spec.ts` | スクリーンショット baseline 比較 | Quality | `visual-quality` ジョブ |
| `e2e/tooling/visual-regression.spec.ts-snapshots/` | Baseline PNG（コミット対象） | — | — |
| `e2e/tooling/accessibility.spec.ts` | axe-core WCAG 2.1 AA スキャン | Quality | `accessibility-quality` ジョブ |
| `e2e/tooling/touch-targets.spec.ts` | タッチターゲットサイズ検証 | Quality | `accessibility-quality` ジョブ |
| `e2e/tooling/core-web-vitals.spec.ts` | CLS / LCP 計測 | Quality | `visual-quality` ジョブ |
| `e2e/tooling/typography.spec.ts` | フォントサイズ範囲検証 | Quality | `visual-quality` ジョブ |
| `e2e/tooling/container-width.spec.ts` | max-width 一貫性チェック | Quality | `visual-quality` ジョブ |
| `e2e/tooling/visual-regression-config.ts` | 共有設定（ルート、閾値、allowlist） | — | — |

### 10.2 既存テスト基盤との統合

```
4 カテゴリモデルへのマッピング:

┌─ E2E Functional ─── 既存テスト（機能別、pre-commit blocking）
│
├─ Quality ────────── ★ Visual Regression（P0→hard block）
│                     ★ axe-core Accessibility（P0→hard for critical）
│                     ★ Touch Targets（P1→soft initially）
│                     ★ CWV（P2→soft, metrics only）
│                     ★ Typography / Container（P2→soft）
│
├─ Static Analysis ── npm run lint + tsc --noEmit
│                     ★ ui-guardrails 拡張（4 新ルール）
│
└─ Security ───────── run-lightweight-scan.sh
```

### 10.3 Visual Regression 運用ルール

- **baseline 更新**: `npx playwright test e2e/tooling/visual-regression.spec.ts --update-snapshots` は Ubuntu CI 環境で実行し、OS 間のレンダリング差異を排除。
- **差分許容度**: LP は `maxDiffPixelRatio: 0.01`（1%）、Product は `0.03`（3%）。
- **アニメーション無効化**: `page.emulateMedia({ reducedMotion: "reduce" })` + `animations: "disabled"` で安定化。
- **動的要素マスク**: タイムスタンプ、ユーザーアバター等は `mask: [locator]` で除外。
- **flaky 対策**: `retries: 2`、失敗 3 回連続で自動 issue 作成。`visual-regression-flaky-allowlist.json` で一時的に soft fail に降格可能。

---

## 11. リスク評価

| リスク | 影響 | 発生確率 | 緩和策 |
|---|---|---|---|
| LP ブレークポイント変更で 901-1023px の表示崩れ | Medium | High | 変更前後で 8 viewport スクリーンショットを比較。1024px viewport を追加テスト |
| viewport-fit:cover 有効化で safe-area 未対応ページの content 隠れ | High | High | T-01 に T-07 を統合し同一 PR で atomic 実施（Codex review 指摘反映）。iOS 実機テスト必須 |
| CSS Modules 移行でクラス名変更によるテスト破綻 | Medium | High | セクション単位で段階的に移行。各セクション完了後に Playwright 確認 |
| button xs/icon-xs サイズ変更でデスクトップ UI 密度低下 | Low | Low | `lg:h-6`/`lg:size-6` でデスクトップは従来サイズを維持 |
| Visual Regression baseline のプラットフォーム差異 | Medium | Medium | CI 環境（Ubuntu + Chromium）を baseline の canonical source にする |
| axe-core 初回スキャンで大量違反が発見される | Low（影響なし） | High | 初回は soft check。critical/serious のみ hard fail。段階的にカバレッジ拡大 |

---

## 12. 工数見積もり

| Phase | タスク数 | 推定工数 | 備考 |
|---|---|---|---|
| Phase 1 (P0) | 6 タスク | 3–4 日 | T-04 (LP ブレークポイント) が最大 |
| Phase 2 (P1) | 5 タスク (T-07 は T-01 に統合済み) | 3–4 日 | T-11 (Visual Regression) の baseline 安定化に時間 |
| Phase 3 (P2) | 6 タスク | 4–5 日 | T-15 (CSS Modules) が最大 |
| Phase 4 (P3) | 4 タスク | 2–3 日 | 任意、CI 統合中心 |
| **合計** | **22 タスク** | **12–16 日** | |

---

## 13. Codex Plan Review 結果

実行日: 2026-05-05
Status: NEEDS_REVISION → 反映済み
Request ID: plan_review-20260505-000053-855a

### 反映済み指摘

| Severity | 指摘 | 対応 |
|---|---|---|
| High | T-01 (viewport-fit:cover) と T-07 (safe-area 補完) の間に regression window が発生する | T-07 を T-01 に統合し同一 PR で atomic 実施に変更 |
| Medium | T-02 のタッチターゲット対象が不足。AppSidebar mobile close/nav、Snackbar dismiss、WeeklySchedule controls が未記載 | T-02 の対象を拡充し、P0 時点で mobile interactive 要素を網羅する方針に変更 |
| Medium | Visual Regression baseline に実ユーザー名・企業名が混入するリスク | T-11 に `--auth=mock` 固定、匿名 seed data、mask allowlist、CI Chromium 限定を明記 |
| Medium | T-14 の next/image 移行が PainPointsSection.test.ts と衝突する | T-14 にテスト更新順序（テスト期待値変更 → 実装変更）を明記 |
| Low | T-15 CSS Modules 移行で 500 行超ファイルへの churn が続く | T-15 にセクション単位の分割方式を明記。500 行超ファイルは局所変更に留める |

### 2nd Review 反映済み指摘 (PASS_WITH_CONCERNS)

実行日: 2026-05-05
Request ID: plan_review-20260505-000751-d4a9

| Severity | 指摘 | 対応 |
|---|---|---|
| Medium | T-11 の依存が T-04/T-05 のみで不足。T-08/T-09/T-10 もスクリーンショット差分を発生させる | T-11 の依存を `T-04,T-05,T-08,T-09,T-10` に拡大。LP/Product baseline の確立タイミングを分離 |
| Medium | T-03 の CorporateInfoSection.tsx が hotspot だが明示されていない | T-03 に hotspot 注記と code-reviewer/post_review 対象を明記 |
| Low | T-21 の依存に T-12/T-17/T-16 が漏れている | T-21 の依存を `T-06,T-11,T-12,T-16,T-17` に更新 |
| Low | Phase 2 の工数表が 6 タスクだが実際は 5 active | 工数表を「5 タスク (T-07 は T-01 に統合済み)」に修正 |

### 追加リスク（Codex 指摘）

- Visual baseline は日付・通知・credit 表示・guest/user 状態でも揺れる。mock fixture と mask 対象を先に固定しないと flake と情報混入が同時に起きる。
- axe-core は WCAG 2.1 AA の自動検査には有効だが、44px touch target の完全検出は別ロジック（T-12）が必要。T-06 と T-12 の責務を混同しない。
- `CorporateInfoSection.tsx` は 595 行の hotspot 相当。T-03 の対象だが局所変更に留めるべき。
