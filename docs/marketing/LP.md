# 就活Pass LP 構成 & 実装リファレンス

> **目的**: root LP (`/`) の現行セクション構成、素材利用方針、検証手順をまとめる。
> **最終更新**: 2026-04-27（Hero 見出しサイズ DESIGN.md 準拠化、FAQ アコーディオン化、1672px pixel-perfect 検証）

見た目の詳細（トークン・シャドウ・guardrails・エージェント向け規約）の正本はリポジトリルートの [`DESIGN.md`](../../DESIGN.md)。root LP の構図参照は [`public/marketing/LP/LP.png`](../../public/marketing/LP/LP.png) と [`public/marketing/LP/section_image/`](../../public/marketing/LP/section_image/)、実装素材の正本は [`public/marketing/LP/assets/`](../../public/marketing/LP/assets/)。

## 現在のLP構成

root LP は `src/app/(marketing)/page.tsx` で metadata と `FaqJsonLd` を定義し、表示は `src/components/landing/LandingPage.tsx` に集約する。PC / mobile とも `LP.png` や `section_image` の一枚画像表示は使わず、HTML テキスト、リンク、料金、FAQ と `assets/**` の透過PNGを組み合わせたレスポンシブコンポーネントで再現する。

1. `HeroSection` — ロゴ、H1、説明文、2 CTA、信頼バッジ、PC/スマホモック
2. `PainPointsSection` — 4カード構成。人物・丸アイコン・下部コピーをHTML + 透過PNGで再現
3. `FeaturesSection` — 左見出し、作成/対策/管理フロー、2x3機能カード
4. `BeforeAfterSection` — 中央矢印、Before/After比較、人物・端末モック
5. `HowToUseSection` — 4ステップ横並び。データは `src/lib/marketing/landing-steps.ts`
6. `PricingSection` — Free / Standard / Pro。価格・機能は `src/lib/marketing/pricing-plans.ts`
7. `LPFAQSection` — 2列 x 3行の FAQ アコーディオン。クリックで回答開閉、初期状態は最初の 1 項目が展開。`aria-expanded` / `aria-controls` で a11y 対応。データは `src/lib/marketing/landing-faqs.ts`、JSON-LD と共有
8. `LandingFooter` — ブランド説明、リンク群、cityscape、男女キャラペア（`08_male_character.png` + `09_female_character.png`、高さ330px）

## 素材利用方針

- 人物、端末、UIカード、装飾は `public/marketing/LP/assets/**` を使う。
- `public/marketing/LP/section_image/**` はセクション単位の視覚参照としてのみ使い、本番DOMでは描画しない。
- `public/marketing/LP/LP.png` は全体構図の視覚参照としてのみ使い、本番DOMでは描画しない。
- 見出し、本文、CTA、料金、FAQはHTMLで実装する。SEOとアクセシビリティを優先し、テキスト入り画像を主要コピーとして使わない。
- 料金は `pricing-plans.ts`、FAQは `landing-faqs.ts`、使い方ステップは `landing-steps.ts` をSSOTとする。
- 画像は表示サイズを固定し、Hero の主要端末画像は Next.js `Image` で `width` / `height` / `sizes` を明示する。

## デザイン方針

- `LP.png` と `section_image/*` を視覚参照にする。白基調、淡いブルー装飾、青CTAで統一する。
- FAQ は `section_image/9a1dc7d3-5891-4ee5-b111-4bdd13a8a00c.png` を参照し、Pricing と Footer の間に残す。
- Standard の表示価格は参照画像の `¥980/月` ではなく、課金SSOTの現行値を正とする。
- 主見出しは `--lp-navy`、CTA/強調は `--lp-cta`、本文補足は `--lp-muted-text`（旧 `--lp-body-muted` は廃止済み）を使う。
- ボーダーは `--lp-border-default` (`#e8edf5`) を全セクションで統一使用する。
- desktop は `1672px` viewport の section_image を主基準にし、主要コンテナは `1530px`〜`1600px`、各 section は `900px`〜`960px` の高さを目安にする。
- 主要要素の目標誤差は `x/y/w/h ±16px`、見出しベースライン `±12px`、カード幅 `±20px`。mobile `390px` は同じ部品を縦積みして横スクロールなしを優先する。

## 実装ファイル

| ファイル | 役割 |
| --- | --- |
| `src/app/(marketing)/page.tsx` | metadata、FAQ JSON-LD、`LandingPage` 呼び出し |
| `src/components/landing/LandingPage.tsx` | root LP のセクション順 |
| `src/components/landing/sections/*.tsx` | root LP 専用セクション |
| `src/lib/marketing/landing-steps.ts` | 4ステップSSOT |
| `src/lib/marketing/landing-faqs.ts` | root LP FAQ SSOT |
| `src/lib/marketing/pricing-plans.ts` | 料金表示SSOT |

## 検証

UI変更時は以下を実行する。

```bash
npm run verify:prepare -- / --surface=marketing --auth=none
rg "/marketing/LP/LP.png|/marketing/LP/section_image" src/components/landing src/app/'(marketing)' --glob '!*.test.ts'
npm run lint:ui:guardrails
npm run test:unit -- src/app/'(marketing)'/page.test.ts src/components/landing/sections/HeroSection.test.ts src/components/landing/sections/PainPointsSection.test.ts src/components/landing/sections/FeaturesSection.test.ts src/components/landing/sections/BeforeAfterSection.test.ts src/components/landing/sections/HowToUseSection.test.ts src/components/landing/sections/PricingSection.test.ts src/components/landing/sections/LPFAQSection.test.ts src/components/landing/LandingFooter.test.ts
npm run test:ui:review -- /
npx playwright screenshot --viewport-size=1672,941 --full-page http://127.0.0.1:3000/ output/playwright/lp-current-1672-full.png
```

必要に応じて `npm run build` も実行する。
