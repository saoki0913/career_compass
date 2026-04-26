# 就活Pass LP 構成 & 実装リファレンス

> **目的**: root LP (`/`) の現行セクション構成、素材利用方針、検証手順をまとめる。
> **最終更新**: 2026-04-26（section_image 準拠のピクセル一致改修、CSS トークン SSOT 統一）

見た目の詳細（トークン・シャドウ・guardrails・エージェント向け規約）の正本はリポジトリルートの [`DESIGN.md`](../../DESIGN.md)。root LP の構図と素材の正本は [`public/marketing/LP/section_image/`](../../public/marketing/LP/section_image/) と [`public/marketing/LP/assets/`](../../public/marketing/LP/assets/)。

## 現在のLP構成

root LP は `src/app/(marketing)/page.tsx` で metadata と `FaqJsonLd` を定義し、表示は `src/components/landing/LandingPage.tsx` に集約する。

1. `LandingHeader` — 固定ヘッダー、ロゴ、ナビ、ログイン/無料CTA、モバイルメニュー
2. `HeroSection` — H1、説明文、2 CTA、信頼バッジ、PC/スマホモック
3. `PainPointsSection` — 4つの悩み（カード枠なし・キャラ200px・フローティングアイコン付き）
4. `FeaturesSection` — 6つの主要機能、作成/対策/管理フロー、UIカード
5. `BeforeAfterSection` — Before/After の変化訴求
6. `HowToUseSection` — 4ステップ + 個別カーブ矢印コネクタ。データは `src/lib/marketing/landing-steps.ts`
7. `PricingSection` — Free / Standard / Pro + 左側装飾（クレジットカード・シールド）。データは `src/lib/marketing/pricing-plans.ts`
8. `LPFAQSection` — root LP FAQ + 装飾（ドットグリッド・スパークル）。データは `src/lib/marketing/landing-faqs.ts`、JSON-LD と共有
9. `LandingFooter` — ブランド説明、リンク群、cityscape、男女キャラペア（`08_male_character.png` + `09_female_character.png`、高さ320px）
10. `StickyCTABar` — モバイル下部固定 CTA

## 素材利用方針

- 人物、端末、UIカード、装飾は `public/marketing/LP/assets/**` を使う。
- 見出し、本文、CTA、料金、FAQはHTMLで実装する。SEOとアクセシビリティを優先し、テキスト入り画像を主要コピーとして使わない。
- 料金は `pricing-plans.ts`、FAQは `landing-faqs.ts`、使い方ステップは `landing-steps.ts` をSSOTとする。
- 画像は表示サイズを固定し、Hero の主要端末画像は Next.js `Image` で `width` / `height` / `sizes` を明示する。

## デザイン方針

- `LP.png` 優先。白基調、淡いブルー装飾、青CTAで統一する。
- 主見出しは `--lp-navy`、CTA/強調は `--lp-cta`、本文補足は `--lp-muted-text`（旧 `--lp-body-muted` は廃止済み）を使う。
- ボーダーは `--lp-border-default` (`#e8edf5`) を全セクションで統一使用する。
- 主要幅は desktop `1440px` と mobile `390px` で視覚近似を確認する。全viewportの画像差分厳密一致ではなく、HTML実装の保守性を優先する。

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
npm run lint:ui:guardrails
npm run test:unit -- src/app/'(marketing)'/page.test.ts src/components/landing/HowItWorksSection.test.ts src/components/landing/LandingFooter.test.ts
npm run test:ui:review -- /
```

必要に応じて `npm run build` も実行する。
