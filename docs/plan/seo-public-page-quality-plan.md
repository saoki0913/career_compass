# SEO・公開ページ品質 改善計画

作成日: 2026-05-05 JST

## 1. 目的

就活Pass の 21 公開マーケティングページについて、オーガニック流入増加と技術的 SEO 負債解消を目的とした包括的改善を行う。本格 SEO 運用前の段階で、技術基盤を固めつつ新規 LP 展開の道筋をつける。

本計画書の対象は以下に絞る。

- Technical SEO（title, canonical, sitemap, robots, 構造化データ, 内部リンク）
- Core Web Vitals（font, 画像, preconnect, CLS）
- アクセシビリティ（WCAG 2.1 AA 準拠）
- 計測基盤（Search Console, GA4 カスタムイベント）
- コンテンツ最適化（description, OG 画像, title 最適化）
- 新規 LP 展開（競合調査ベースのキーワードギャップ）

ブログ基盤構築、SNS/外部施策、A/B テスト基盤は対象外とする。

本タスクの完了条件は計画書作成であり、コード実装は行わない。

## 2. 調査範囲

以下を静的に確認した。

- `src/lib/marketing-metadata.ts` — メタデータ生成
- `src/lib/seo/site-structured-data.ts` — Organization / SoftwareApplication / WebSite スキーマ
- `src/lib/seo/json-ld.ts` — FAQ シリアライズ
- `src/lib/seo/breadcrumb-jsonld.ts` — Breadcrumb 生成
- `src/components/seo/FaqJsonLd.tsx`, `BreadcrumbJsonLd.tsx` — JSON-LD コンポーネント
- `src/app/sitemap.ts` — サイトマップ（21 URL）
- `src/app/robots.ts` — robots 設定
- `src/app/layout.tsx` — root metadata + title template
- `src/app/(marketing)/layout.tsx` — marketing レイアウト（GA4 + 構造化データ）
- `src/app/opengraph-image.tsx` — 共通 OG 画像生成（Edge, 1200x630px）
- `src/components/landing/LandingHeader.tsx`, `LandingFooter.tsx` — ヘッダー / フッター
- `src/components/landing/StickyCTABar.tsx` — モバイル CTA
- `src/components/landing/sections/*.tsx` — 各セクションコンポーネント
- `src/components/analytics/GoogleAnalytics.tsx` — GA4 統合
- `src/lib/analytics/client.ts` — イベントトラッキング
- `src/app/globals.css` — CSS 変数・フォントスタック
- `src/app/(marketing)/**/page.tsx` — 全 21 マーケティングページ
- `src/app/checklists/**` — checklists ページ（marketing レイアウト外）
- `src/lib/marketing/*.ts` — FAQ データファイル（14 ファイル, 71 FAQ）
- `next.config.ts` — リダイレクト、ヘッダー、画像最適化設定
- `public/marketing/LP/sections/**` — 画像素材
- `docs/marketing/README.md` — キーワード戦略・チャネル施策

外部参照: SmartES, ES メーカー, OneCareer, 就活会議, note.com の公開ページ・SEO 戦略を Web 検索で調査した。

## 3. 完了条件

この計画書作成タスクの完了条件は次のとおり。

1. `docs/plan/seo-public-page-quality-plan.md` が存在する。
2. 技術的 SEO 負債・CWV・a11y・計測・コンテンツ・新規 LP の現状、主要リスク、タスク、受入基準、検証方法が記録されている。
3. `Task Board` は `Status / Priority / Phase / Task / Owner / Acceptance Criteria / Verification / Updated At` を持つ Markdown table で管理されている。
4. 実装フェーズで Status を更新するルールが明記されている。
5. P0 と P1 のタスクは、後続実装者が追加判断なしで着手できる粒度になっている。
6. 競合分析サマリが含まれている。
7. 計画書作成後に、ファイル存在確認と主要見出し検索が実行されている。

## 4. タスク状態更新ルール

実装フェーズでは、完了条件を満たすまで次のループを続ける。

1. `Task Board` から `Todo` の最上位 Priority を 1 件選ぶ。
2. 着手時に `Status` を `In Progress` へ変え、`Progress Log` に開始理由を書く。
3. 実装または検証でブロックしたら `Blocked` にし、必要な判断または環境条件を明記する。
4. 受入基準を満たしたら `Review` にし、実行したテストと差分確認結果を書く。
5. レビュー後に `Done` へ変える。
6. `Todo / In Progress / Blocked / Review` が残る場合は 1 に戻る。

Status は以下だけを使う。

- `Todo`: 未着手
- `In Progress`: 作業中
- `Blocked`: 外部要因で停止中（理由を必ず記載）
- `Review`: 実装完了、レビュー待ち
- `Done`: レビュー完了、受入基準クリア

## 5. 競合分析サマリ

### 5.1 競合マップ

| サービス | 公開ページ数 | 構造化データ | ブログ/記事 | 主な強み | 主な弱み |
|---|---|---|---|---|---|
| **就活Pass** | 21 | FAQ(16P), Breadcrumb(3P), Org+App+Web | なし | LP 充実、構造化データ網羅 | 内部リンク孤立、title 二重、CWV |
| SmartES | ~3 | なし | なし | LINE ログイン低摩擦 | SEO 投資なし |
| ES メーカー | ~3 | なし | なし | 「無料」訴求 | AI 添削なし、SEO なし |
| OneCareer | 数千 | 基本的 | 1,946 記事 | 企業名 x 選考段階の長尾 | ツール体験なし |
| 就活会議 | 数千 | 基本的 | 606+ 記事 | 大学群ターゲティング | AI 機能なし |
| ChatGPT 直接利用 | N/A | N/A | note 5,000+ 記事 | 汎用性 | 就活特化なし |

### 5.2 戦略的示唆

- 真の競合は大手メディア（OneCareer, 就活会議）であり、個別 AI ツール（SmartES, ES メーカー）ではない
- 大手メディアはブログ記事量で圧倒するが、AI ツール体験は提供していない
- 就活Pass は「実用ツール LP + テンプレ」で差別化すべき。ブログ量で勝負しない
- 「自己PR AI」「就活 AI 比較」「ES 書き方」系のキーワードギャップが大きい

### 5.3 キーワードギャップ

| ギャップ領域 | 現状 | 想定検索意図 | 対応候補 |
|---|---|---|---|
| 自己PR AI / 自己PR 作成 | 既存機能あるが専用 LP なし | AI で自己PR を作りたい | `/jikopr-ai` 新設 |
| 就活 AI 比較 / ES添削 AI 比較 | es-ai-guide が部分カバー | サービス比較して選びたい | `/shukatsu-ai-hikaku` 新設 |
| ES 書き方 / エントリーシート 書き方 | entry-sheet-ai が部分カバー | ES の書き方を知りたい | `/es-kakikata` 新設 |
| 自己分析 AI | 未対応 | AI で自己分析したい | `/jikobuseki-ai` 新設 |
| ChatGPT 就活 / ChatGPT ES 添削 | 未対応 | ChatGPT を就活に使いたい | `/chatgpt-shukatsu` 新設 |
| 面接 質問 一覧 / 面接 頻出質問 | ai-mensetsu が部分カバー | 面接質問を把握したい | `/mensetsu-shitsumon` 新設 |
| 就活 準備 チェックリスト | checklists が部分カバー | 就活全体の準備確認 | `/shukatsu-junbi-checklist` 新設 |
| 自己PR テンプレート | 未対応 | 自己PR の書き方テンプレ | `/templates/jikopr` 新設 |

## 6. 現状評価

### 6.1 Strong Points

- FAQ JSON-LD が 16 ページに適用済み（71 FAQ アイテム）
- Site-wide に Organization + SoftwareApplication + WebSite @graph を出力
- 21 URL の sitemap に適切な priority 設定
- robots.ts で公開/非公開を正しく分離 + X-Robots-Tag で二重保護
- canonical URL は metadataBase + 相対パスで一貫
- OG 画像自動生成（Edge runtime, 1200x630px）
- GA4 は afterInteractive + anonymize_ip で GDPR フレンドリー
- CSP nonce 対応済み
- 全 marketing ページが SSG/ISR（CDN キャッシュ最適）
- `createMarketingMetadata()` で全ページのメタデータ生成を統一

### 6.2 Critical Weaknesses

**F-1. Title 二重サフィックス (P0)**
- Root layout `template: "%s | 就活Pass"` (layout.tsx:14) + 各ページの title に `| 就活Pass` → 出力が `〇〇 | 就活Pass | 就活Pass`
- 全 21 ページで発生。Google の title rewrite を誘発し、SERP CTR に直接影響
- 修正方針: `createMarketingMetadata()` の契約を「brand suffix なし」に変更。全 page.tsx から `| 就活Pass` を除去。ホームは `title.absolute` 使用
- 対象: `src/lib/marketing-metadata.ts`, 全 `page.tsx`

**F-2. 内部リンク孤立 (P0)**
- フッター (`LandingFooter.tsx`) のリンク先: `/#features`, `/pricing`, `/#faq`, `/contact`, `/terms`, `/privacy`, `/legal`, `/tools`, `/templates`
- 以下 10 ページがフッター/ヘッダーからリンクされていない: `/es-tensaku-ai`, `/shukatsu-ai`, `/ai-mensetsu`, `/shiboudouki-ai`, `/gakuchika-ai`, `/entry-sheet-ai`, `/es-ai-guide`, `/shukatsu-kanri`, `/checklists`, `/data-source-policy`
- Googlebot がサイトマップからしか発見できない状態。PageRank が流れず、クロール優先度も低下

**F-3. checklists が (marketing) レイアウト外 (P0)**
- `src/app/checklists/` は `src/app/(marketing)/` の外
- 結果: Organization/SoftwareApplication/WebSite JSON-LD が出力されない、GA4 トラッキングが動作しない
- 対象: `/checklists`, `/checklists/deadline-management` の 2 ページ
- 移動時に LandingHeader/Footer との UI 一貫性方針を決定する

**F-4. CTA blue コントラスト不足 (P0 — a11y)**
- `--lp-cta: #2680ff` のコントラスト比が白背景で 3.7:1（WCAG AA 通常テキスト 4.5:1 未達）
- CSS 変数のほか、HeroSection.tsx 等で `#2680ff` がハードコードされている箇所あり
- 影響: Hero h1, Features, PainPoints, BeforeAfter, FAQ セクションの強調テキスト
- 修正: `--lp-cta` を #1a6de0 等（4.6:1+）に変更 + ハードコード全棚卸し

**F-5. meta description 不足 (P1)**
- 7 ページで description が 55 文字以下: contact(25字), tools(55字), templates(40字), es-counter(45字), shiboudouki-template(45字), gakuchika-star-template(45字), checklists(55字)

**F-6. robots.ts trailing slash 不整合 (P1)**
- robots.ts に `/tools/`, `/templates/`, `/checklists/` と trailing slash 付き allow エントリあり
- canonical は trailing slash なし。next.config.ts に `trailingSlash` の明示設定なし

**F-7. CTA クリック追跡なし (P1)**
- GA4 カスタムイベントにマーケティング CTA クリックが未設定
- `trackMarketingCtaClick({ location, label, href })` の allowlist wrapper で設計。PII 送信禁止

**F-8. marketing 専用 404 ページなし (P1)**
- `src/app/not-found.tsx` が存在しない

**F-9. next/font 未使用 (P1 — CWV)**
- Noto Sans JP がローカルインストール依存。未インストール端末では system-ui にフォールバック
- product UI にも影響するため visual regression テスト必須

**F-10. 画像未最適化 (P1 — CWV)**
- features セクションのカード画像 5 枚が計 23.2 MB (PNG)
  - card-company-application-management.png: 5.3 MB
  - card-motivation-gakuchika.png: 4.9 MB
  - card-es-review.png: 4.7 MB
  - card-interview-prep.png: 4.2 MB
  - card-schedule-deadline.png: 4.1 MB
- `<img>` タグ使用、next/image 未適用。WebP 自動変換・srcSet なし
- フッター装飾画像 (couple.png: 1.7 MB) に loading="lazy" / width / height なし

**F-11. preconnect 未設定 (P1 — CWV)**
- GA4 ドメイン (`www.googletagmanager.com`) への preconnect / dns-prefetch なし

**F-12. skip-to-content / nav aria-label 不足 (P1 — a11y)**
- skip-to-content リンクが全ページで欠如
- LandingHeader.tsx の `<nav>` に aria-label なし
- ContactForm のエラー表示に `role="alert"` なし

**F-13. OG 画像共通 (P2)**
- 全ページが同一の OG 画像（opengraph-image.tsx）。ページ固有の情報が SNS シェア時に伝わらない

**F-14. sitemap lastModified がビルド時固定 (P2)**
- `new Date()` がビルド時に評価されるため、全ページの lastModified が毎回更新される

**F-15. framer-motion バンドル (P2 — CWV)**
- LandingSectionMotion.tsx で framer-motion を使用（fade-in + translate のみ）
- CSS animation + IntersectionObserver で代替可能。marketing バンドルから 30KB+ 削減可能

## 7. Task Board

### Phase 1: 技術的 SEO 負債解消 (P0)

| Status | Priority | Task | Owner | Acceptance Criteria | Verification | Updated At |
|---|---|---|---|---|---|---|
| Todo | P0 | F-1: title 二重サフィックス修正。`createMarketingMetadata()` の契約を「brand suffix なし」に変更。全 page.tsx から `\| 就活Pass` を除去。ホームは `title.absolute` 使用 | nextjs-developer | 全ページの `<title>` が `〇〇 \| 就活Pass` 形式（一重）。ホームは `就活Pass \| ...` 形式 | `curl -s <url> \| grep '<title>'` で全 21 ページ確認 | 2026-05-05 |
| Todo | P0 | F-1b: marketing-metadata テスト更新 | nextjs-developer | テスト pass。brand suffix なし契約が検証されている | `npm run test:unit -- marketing-metadata` | 2026-05-05 |
| Todo | P0 | F-2: 内部リンク追加。LandingFooter に「機能」カテゴリ追加（es-tensaku-ai, shiboudouki-ai, gakuchika-ai, ai-mensetsu, shukatsu-ai, shukatsu-kanri, checklists）。data-source-policy を「規約」に追加 | ui-designer | 全 10 ページがフッターからリンクされている | grep で FOOTER_COLUMNS 確認 | 2026-05-05 |
| Todo | P0 | F-3: checklists を (marketing) 移動。UI 統合方針決定含む | nextjs-developer | `/checklists` で Organization JSON-LD + GA4 出力 | DevTools で JSON-LD + GA4 Realtime | 2026-05-05 |
| Todo | P0 | F-6: robots trailing slash 整理 + `trailingSlash: false` 明示 | nextjs-developer | robots.txt に trailing slash 付きエントリなし | `curl /robots.txt` 確認 | 2026-05-05 |

### Phase 2: CWV + a11y + 計測基盤 (P1)

| Status | Priority | Task | Owner | Acceptance Criteria | Verification | Updated At |
|---|---|---|---|---|---|---|
| Todo | P1 | F-9: next/font 導入（Noto Sans JP, display:swap, weight:400-900）。インライン fontFamily 全廃 | ui-designer | Web Font ロード確認。インライン fontFamily なし | DevTools Network + visual regression | 2026-05-05 |
| Todo | P1 | F-10: features 画像最適化。5 枚を next/image 化（width/height/sizes/lazy） | ui-designer | WebP 配信。合計転送量 5 MB 以下 | DevTools Network | 2026-05-05 |
| Todo | P1 | F-10b: フッター装飾画像に loading="lazy" + width/height | ui-designer | 属性あり | grep 確認 | 2026-05-05 |
| Todo | P1 | F-11: preconnect 追加（googletagmanager.com + google-analytics.com） | nextjs-developer | head に preconnect タグ出力 | DevTools Elements | 2026-05-05 |
| Todo | P1 | F-4: CTA color コントラスト修正 + ハードコード棚卸し | ui-designer | 全テキスト on white が 4.5:1+ | WebAIM Checker | 2026-05-05 |
| Todo | P1 | F-12: skip-to-content + nav aria-label + ContactForm role="alert" | ui-designer | Tab で skip link 最初。nav に aria-label あり | 手動キーボードテスト | 2026-05-05 |
| Todo | P1 | F-7: GA4 CTA クリック追跡。trackMarketingCtaClick wrapper 作成。PII 禁止 | nextjs-developer | GA4 DebugView で cta_click 確認 | GA4 DebugView | 2026-05-05 |
| Todo | P1 | F-8: marketing 404 ページ新設 + 404_hit イベント | nextjs-developer + ui-designer | `/nonexistent` で 404 + ブランドページ | curl -I + ブラウザ | 2026-05-05 |
| Todo | P1 | Search Console 設定確認 + sitemap 送信 | nextjs-developer | 21 ページインデックス | Search Console レポート | 2026-05-05 |

### Phase 3: コンテンツ最適化 (P1)

| Status | Priority | Task | Owner | Acceptance Criteria | Verification | Updated At |
|---|---|---|---|---|---|---|
| Todo | P1 | F-5: description 拡充（7 ページを 80-120 文字に） | product-strategist + nextjs-developer | 全ページ 80 文字以上 | grep で文字数確認 | 2026-05-05 |
| Todo | P1 | title 最適化。長い title 短縮 + 「無料」追加 | product-strategist + nextjs-developer | 全 title 60 文字以内 | curl で確認 | 2026-05-05 |
| Todo | P1 | F-13: ページ別 OG 画像。public/ 資産活用、本 LP 同等品質 | ui-designer + nextjs-developer | 主要 10 ページで固有 OG 画像出力 | SNS デバッガー | 2026-05-05 |

### Phase 4: 新規 LP 展開 (P1-P2)

| Status | Priority | Task | Owner | Acceptance Criteria | Verification | Updated At |
|---|---|---|---|---|---|---|
| Todo | P1 | `/jikopr-ai` — 自己PR AI LP（KW: 自己PR AI, 自己PR 作成 AI） | nextjs-developer + ui-designer + product-strategist | LP チェックリスト 8 項目クリア | Lighthouse SEO 90+, Rich Results Test | 2026-05-05 |
| Todo | P1 | `/shukatsu-ai-hikaku` — 就活 AI 比較 LP（KW: 就活AI比較, ES添削AI比較） | nextjs-developer + ui-designer + product-strategist | LP チェックリスト 8 項目クリア | Lighthouse SEO 90+, Rich Results Test | 2026-05-05 |
| Todo | P1 | `/es-kakikata` — ES 書き方ガイド LP（KW: ES書き方, エントリーシート書き方） | nextjs-developer + ui-designer + product-strategist | LP チェックリスト 8 項目クリア | Lighthouse SEO 90+, Rich Results Test | 2026-05-05 |
| Todo | P2 | `/jikobuseki-ai` — 自己分析 AI LP | nextjs-developer + ui-designer | LP チェックリスト 8 項目クリア | Lighthouse SEO 90+ | 2026-05-05 |
| Todo | P2 | `/chatgpt-shukatsu` — ChatGPT 就活比較 LP | nextjs-developer + ui-designer | LP チェックリスト 8 項目クリア | Lighthouse SEO 90+ | 2026-05-05 |
| Todo | P2 | `/mensetsu-shitsumon` — 面接質問一覧 LP | nextjs-developer + ui-designer | LP チェックリスト 8 項目クリア | Lighthouse SEO 90+ | 2026-05-05 |
| Todo | P2 | `/shukatsu-junbi-checklist` — 就活準備チェックリスト LP | nextjs-developer + ui-designer | LP チェックリスト 8 項目クリア | Lighthouse SEO 90+ | 2026-05-05 |
| Todo | P2 | `/templates/jikopr` — 自己PR テンプレート（BreadcrumbJsonLd 付き） | nextjs-developer + ui-designer | LP チェックリスト 8 項目クリア | Lighthouse SEO 90+ | 2026-05-05 |

### Phase 5: 継続的改善 (P2)

| Status | Priority | Task | Owner | Acceptance Criteria | Verification | Updated At |
|---|---|---|---|---|---|---|
| Todo | P2 | F-14: sitemap lastModified 改善（SITEMAP_DATES 定数テーブル） | nextjs-developer | lastModified がページ別実日付 | sitemap.xml 確認 | 2026-05-05 |
| Todo | P2 | F-15: framer-motion 代替（CSS animation + IntersectionObserver） | ui-designer | marketing バンドルから framer-motion 削除 | bundle-analyzer | 2026-05-05 |
| Todo | P2 | SoftwareApplication Offer に url + priceValidUntil 追加 | nextjs-developer | Offer に /pricing url と有効期限 | Rich Results Test | 2026-05-05 |
| Todo | P2 | FaqJsonLd / BreadcrumbJsonLd に nonce prop 追加 | nextjs-developer | script タグに nonce 属性 | DevTools | 2026-05-05 |
| Todo | P2 | sitemap changeFrequency 微調整（tools/templates → monthly） | nextjs-developer | 更新頻度と一致 | sitemap 確認 | 2026-05-05 |
| Todo | P2 | www/non-www 正規化確認（Vercel/DNS） | nextjs-developer | 一方が 301 redirect | curl -I | 2026-05-05 |
| Todo | P2 | GA4 スクロール深度追跡（IntersectionObserver, 25/50/75/100%） | nextjs-developer | scroll_depth イベント記録 | GA4 DebugView | 2026-05-05 |
| Todo | P2 | GA4 FAQ インタラクション追跡 | nextjs-developer | faq_toggle イベント記録 | GA4 DebugView | 2026-05-05 |
| Todo | P2 | GA4 登録ファンネル追跡（registration_start → complete → onboarding） | nextjs-developer | ファンネル Explore 構築可能 | GA4 Explore | 2026-05-05 |

## 8. 新規 LP 展開ロードマップ

### Phase A (P1 — 最優先、各 2-4 日)

| LP | ルート | ターゲット KW | 概要構成 | カニバリ回避 |
|---|---|---|---|---|
| 自己PR AI | `/jikopr-ai` | 自己PR AI, 自己PR 作成 | Hero + Pain + Feature + FAQ + CTA | /gakuchika-ai と「深掘り」vs「PR 生成」で語彙分離 |
| 就活 AI 比較 | `/shukatsu-ai-hikaku` | 就活 AI 比較, ES添削 AI 比較 | Hero + 比較表 + 差別化 + FAQ + CTA | /es-ai-guide と「選び方ガイド」vs「横断比較」で分離 |

### Phase B (P1 — 次フェーズ、各 3-4 日)

| LP | ルート | ターゲット KW | 概要構成 | カニバリ回避 |
|---|---|---|---|---|
| ES 書き方ガイド | `/es-kakikata` | ES 書き方, エントリーシート 書き方 | Hero + 設問タイプ別書き方 + AI tips + FAQ | /entry-sheet-ai と「ハウツー」vs「サービス紹介」で分離 |
| 自己分析 AI | `/jikobuseki-ai` | 自己分析 AI, 自己分析 やり方 | Hero + Pain + Feature + FAQ | /gakuchika-ai と「分析」vs「ES 化」で分離 |
| ChatGPT 就活 | `/chatgpt-shukatsu` | ChatGPT 就活, ChatGPT ES | Hero + 比較 + FAQ + CTA | /shukatsu-ai-hikaku と「ChatGPT 特化」vs「横断」で分離 |

### Phase C (P2 — 余裕があるとき、各 1-3 日)

| LP | ルート | ターゲット KW |
|---|---|---|
| 面接質問一覧 | `/mensetsu-shitsumon` | 面接 質問 一覧, 面接 頻出質問 |
| 就活準備チェックリスト | `/shukatsu-junbi-checklist` | 就活 準備 チェックリスト |
| 自己PR テンプレート | `/templates/jikopr` | 自己PR テンプレ, 自己PR 例文 |

### 注意事項（景表法・優良誤認回避）

- 内定率・通過率・無制限無料・AggregateRating は書かない（CLAUDE.md 準拠）
- 「無料」訴求は実際の無料枠・クレジット条件と矛盾しない表現に限定
- 比較表は客観的な機能比較に留め、主観的な優劣評価は避ける

### 各 LP 共通タスク（CLAUDE.md Marketing LP チェックリスト 8 項目）

1. `createMarketingMetadata({ path })` で canonical 自己参照 metadata を発行
2. FAQ は `src/lib/marketing/<slug>-faqs.ts` に SSOT 分離し、`FaqJsonLd` で埋め込む
3. `src/app/sitemap.ts` に URL を追加
4. `src/app/robots.ts` の allow に URL を追加
5. `docs/marketing/README.md` のデプロイ後確認 URL 一覧とキーワード戦略テーブルを更新
6. 訴求は実装のみ（景表法 / 優良誤認回避）
7. 既存 LP の primary keyword と食い合わないように title / H1 / 内部リンクの語彙を排他分離
8. 2 階層以上のページは `BreadcrumbJsonLd` を付ける（`/templates/jikopr` のみ該当）

## 9. 検証ゲート

### Phase 1 完了ゲート

- [ ] `curl -s <url> | grep '<title>'` で全 21 ページの title が一重サフィックス
- [ ] `npm run test:unit -- marketing-metadata` pass
- [ ] FOOTER_COLUMNS に 10 ページの href がすべて含まれる
- [ ] `/checklists` で DevTools の Elements に Organization JSON-LD が出力される
- [ ] `curl <url>/robots.txt` に trailing slash 付きエントリなし
- [ ] `npm run lint:ui:guardrails` pass

### Phase 2 完了ゲート

- [ ] DevTools Network で Noto Sans JP Web Font がロードされている
- [ ] features 画像が WebP 配信、合計転送量 5 MB 以下
- [ ] HTML head に preconnect タグが出力されている
- [ ] WebAIM Contrast Checker で全 CTA テキスト on white が 4.5:1+
- [ ] Tab キーで skip-to-content が最初にフォーカスされる
- [ ] GA4 DebugView で cta_click イベントが確認できる
- [ ] `/nonexistent` で 404 ステータス + ブランドデザインページ
- [ ] Search Console で 21 ページがインデックス済み
- [ ] `npm run test:ui:review -- /` pass
- [ ] product UI の visual regression テスト（next/font 導入後）

### Phase 3 完了ゲート

- [ ] 全ページの description が 80 文字以上
- [ ] 全 title が 60 文字以内
- [ ] 主要 10 ページで固有の OG 画像が出力される

### Phase 4 完了ゲート（各 LP ごと）

- [ ] Marketing LP チェックリスト 8 項目クリア
- [ ] Lighthouse SEO スコア 90+
- [ ] Google Rich Results Test pass
- [ ] docs/marketing/README.md 更新済み

### Phase 5 完了ゲート

- [ ] sitemap.xml の lastModified がページ別実日付
- [ ] framer-motion が marketing バンドルから削除
- [ ] GA4 で scroll_depth, faq_toggle, registration funnel イベントが確認可能

## 10. 実行順序と依存関係

```
Phase 1 (P0)
├── F-1: title 二重サフィックス修正 ────────────────┐
├── F-1b: marketing-metadata テスト更新 ──────────┤
├── F-2: 内部リンク追加 ─────────────────────────────┤ 独立
├── F-3: checklists (marketing) 移動 ────────────────┤
└── F-6: robots trailing slash 整理 ─────────────────┘
                    │
                    ▼
Phase 2 (P1) ─── next/font は product UI にも影響
├── F-9: next/font 導入 ─────────────────────────────┐
├── F-10: features 画像最適化 ────────────────────────┤
├── F-10b: フッター画像 lazy + dims ──────────────────┤ 独立
├── F-11: preconnect 追加 ───────────────────────────┤
├── F-4: CTA color コントラスト修正 ──────────────────┤
├── F-12: skip-to-content + nav aria-label ──────────┤
├── F-7: GA4 CTA クリック追跡 ────────────────────────┤
├── F-8: marketing 404 ページ ───────────────────────┤
└── Search Console 確認 ─────────────────────────────┘
                    │
                    ▼
Phase 3 (P1) ─── CTA 追跡データが揃ってから最適化
├── F-5: description 拡充 ───────────────────────────┐
├── title 最適化 ──────────────────────────────────────┤ 独立
└── F-13: ページ別 OG 画像 ──────────────────────────┘
                    │
                    ▼
Phase 4 (P1-P2) ── Phase 1-3 の基盤の上に新規 LP
├── Phase A: /jikopr-ai, /shukatsu-ai-hikaku ────────┐
├── Phase B: /es-kakikata, /jikobuseki-ai, etc. ─────┤ 順次
└── Phase C: /mensetsu-shitsumon, etc. ──────────────┘
                    │
                    ▼
Phase 5 (P2) ─── 効果測定後の継続改善
├── sitemap lastModified 改善 ───────────────────────┐
├── framer-motion 代替 ──────────────────────────────┤ 独立
├── Offer url/priceValidUntil ───────────────────────┤
├── nonce prop 追加 ─────────────────────────────────┤
└── GA4 追加イベント ────────────────────────────────┘
```

## 11. Codex Review 結果

Codex plan review: **PASS_WITH_CONCERNS** (2026-05-05)

反映済みの指摘:
- title 修正方針を明確化: helper の契約変更 + テスト更新
- ホームページの `title.absolute` を受入基準に含めた
- CTA color のハードコード `#2680ff` 棚卸しをタスクに含めた
- GA4 イベントの PII 禁止 + allowlist wrapper 設計を明記
- next/font の product UI visual regression テストを検証ゲートに含めた
- Phase ごとの owner を分離した
- checklists 移動時の UI 統合方針決定をタスクに含めた
- 新規 LP の Marketing LP チェックリスト 8 項目準拠を明記
- 検証ゲートに `npm run lint:ui:guardrails` + `npm run test:ui:review` を含めた
- features 画像サイズを実測値（5 枚 23.2 MB）に修正

## 12. Progress Log

| Date | Actor | Update |
|---|---|---|
| 2026-05-05 | Claude | 計画書作成完了。3 専門エージェント（product-strategist, Plan x2）+ Codex plan review で調査・設計。全 37 タスクを 5 Phase に整理。P0 Critical 5 件、P1 19 件、P2 13 件 |
