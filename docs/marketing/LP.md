# 就活Pass LP 構成 & 実装リファレンス

> **目的**: root LP (`/`) の現行セクション構成、素材利用方針、検証手順をまとめる。
> **最終更新**: 2026-04-30（LP sections アセット正本化 + Header 追加）

見た目の詳細（トークン・シャドウ・guardrails・エージェント向け規約）の正本はリポジトリルートの [`DESIGN.md`](../../DESIGN.md)。root LP の構図参照は `/Users/saoki/work/design/shupass` と [`public/marketing/LP/section_image/`](../../public/marketing/LP/section_image/)、実装素材の正本は [`public/marketing/LP/sections/`](../../public/marketing/LP/sections/)。

## 現在のLP構成

root LP は `src/app/(marketing)/page.tsx` で metadata と `FaqJsonLd` を定義し、表示は `src/components/landing/LandingPage.tsx` に集約する。PC / mobile とも `LP.png` や `section_image` の一枚画像表示は使わず、HTML テキスト、リンク、料金、FAQ と `sections/**` の透過PNGを組み合わせたレスポンシブコンポーネントで再現する。

0. `LandingHeader` — root LPにも表示。ブランド、機能/使い方/料金/FAQナビ、ログイン/無料CTA
1. `HeroSection` — H1、説明文、2 CTA、信頼バッジ、PC/スマホ合成モック（`sections/hero/*`）
2. `PainPointsSection` — 4 列のフルイメージカード（`sections/worries/card-*.png`）。sr-only テキスト併置で a11y 維持。背景 #f5f9ff
3. `FeaturesSection` — 左見出し + 作成/対策/管理フロー図、6 列グリッドで `sections/features/*` 画像カード 6 枚。Google カレンダー連携を含む 6 機能
4. `HowToUseSection` — 4 ステップ合成カード（`sections/how-to/step-*.png`）+ sr-only テキストの PainPointsSection パターン
5. `BeforeAfterSection` — SVG インライン矢印、Before/After比較。人物イラストと端末モックは `sections/before-after/*`
6. `PricingSection` — Free / Standard / Pro。価格・機能は `src/lib/marketing/pricing-plans.ts`。trust pill: 「30秒で簡単スタート」
7. `LPFAQSection` — 2列 x 5行の FAQ アコーディオン（10 項目）。クリックで回答開閉、初期状態は最初の 1 項目が展開。`aria-expanded` / `aria-controls` で a11y 対応。データは `src/lib/marketing/landing-faqs.ts`、JSON-LD と共有。キャラクター: `sections/faq/person-pc.png`
8. `LandingFooter` — ブランド説明、リンク群、cityscape（`sections/footer/cityscape.png`）、カップルイラスト（`sections/footer/couple.png`）

## 素材利用方針

- 人物、端末、UIカード、装飾は `public/marketing/LP/sections/**` を使う。
- 新アセットは `public/marketing/LP/sections/<section>/` に英語 kebab-case で配置する。旧 `shupass-v2/` パスは root LP から廃止済み。
- `public/marketing/LP/section_image/**` はセクション単位の視覚参照としてのみ使い、本番DOMでは描画しない。
- `public/marketing/LP/LP.png` は全体構図の視覚参照としてのみ使い、本番DOMでは描画しない。
- `uploads`, `tmp_uploads`, `refs`, `screenshots` は本番DOMから参照しない。
- 見出し、本文、CTA、料金、FAQはHTMLで実装する。SEOとアクセシビリティを優先し、テキスト入り画像を主要コピーとして使わない。
- 料金は `pricing-plans.ts`、FAQは `landing-faqs.ts` をSSOTとする。使い方ステップは `HowToUseSection.tsx` 内に直接定義する（`landing-steps.ts` は削除済み）。
- 画像は表示サイズを固定し、Hero の主要端末画像は Next.js `Image` で `width` / `height` / `sizes` を明示する。

## デザイン方針

- `/Users/saoki/work/design/shupass` と `section_image/*` を視覚参照にする。白基調、淡いブルー装飾、青CTAで統一する。
- FAQ は `section_image/9a1dc7d3-5891-4ee5-b111-4bdd13a8a00c.png` を参照し、Pricing と Footer の間に残す。
- Standard の表示価格は参照画像の `¥980/月` ではなく、課金SSOTの現行値を正とする。
- 主見出しは `--lp-navy` (`#0b1e3a`)、CTA/強調は `--lp-cta` (`#2680ff`)、本文補足は `--lp-muted-text` (`#4b5563`) を使う。
- ボーダーは `--lp-border-default` (`#e5e7eb`) を全セクションで統一使用する。
- フォントは Noto Sans JP 単体（Inter は使用しない）。全セクションで `fontFeatureSettings: '"palt"'` を指定する。
- desktop は shupass 参照の `1200px` コンテナ密度を主基準にし、`1672px` viewport の section_image は補助参照にする。
- 主要要素の目標誤差は `x/y/w/h ±16px`、見出しベースライン `±12px`、カード幅 `±20px`。mobile `390px` は同じ部品を縦積みして横スクロールなしを優先する。

## 実装ファイル

| ファイル | 役割 |
| --- | --- |
| `src/app/(marketing)/page.tsx` | metadata、FAQ JSON-LD、`LandingPage` 呼び出し |
| `src/components/landing/LandingPage.tsx` | root LP のヘッダーとセクション順 |
| `src/components/landing/sections/*.tsx` | root LP 専用セクション |
| ~~`src/lib/marketing/landing-steps.ts`~~ | 削除済み（データは `HowToUseSection.tsx` に内包） |
| `src/lib/marketing/landing-faqs.ts` | root LP FAQ SSOT |
| `src/lib/marketing/pricing-plans.ts` | 料金表示SSOT |

## 検証

UI変更時は以下を実行する。

```bash
npm run verify:prepare -- / --surface=marketing --auth=none
rg "/marketing/LP/LP.png|/marketing/LP/section_image|section_image/asset|uploads|tmp_uploads|shupass-v2" src/components/landing src/app/'(marketing)' --glob '!*.test.ts'
npm run lint:ui:guardrails
npm run test:unit -- src/app/'(marketing)'/page.test.ts src/components/landing/sections/HeroSection.test.ts src/components/landing/sections/PainPointsSection.test.ts src/components/landing/sections/FeaturesSection.test.ts src/components/landing/sections/BeforeAfterSection.test.ts src/components/landing/sections/HowToUseSection.test.ts src/components/landing/sections/PricingSection.test.ts src/components/landing/sections/LPFAQSection.test.ts src/components/landing/LandingFooter.test.ts
npm run test:ui:review -- /
npx playwright screenshot --viewport-size=1672,941 --full-page http://127.0.0.1:3000/ output/playwright/lp-current-1672-full.png
```

必要に応じて `npm run build` も実行する。
