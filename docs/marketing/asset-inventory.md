# 就活Pass LP アセットインベントリ

> **目的**: `public/marketing/LP/sections/**` を root LP 実装素材の正本として管理する。
> **最終更新**: 2026-04-30（アセット刷新 — sections 正本化）

`public/marketing/LP/LP.png` と `public/marketing/LP/section_image/**` は完成見本・視覚参照として現位置に残す。本番DOMでは描画せず、`public/marketing/LP/sections/**` の英語 kebab-case 素材を使用する。

## 正本フォルダ

| フォルダ | 点数 | 主用途 | 主な利用箇所 |
|---|---:|---|---|
| `hero/` | 9 | Hero CTA参考、信頼バッジ、装飾、端末モック | HeroSection |
| `worries/` | 10 | 悩み見出し、4カード、装飾 | PainPointsSection |
| `features/` | 8 | 主要機能カード、Googleカレンダー連携 | FeaturesSection |
| `how-to/` | 6 | 使い方ステップ合成カード、下部訴求 | HowToUseSection |
| `before-after/` | 9 | Before/After 人物・カード・矢印・モックアップ | BeforeAfterSection |
| `pricing/` | 10 | 料金セクション装飾・参考素材 | PricingSection |
| `faq/` | 2 | FAQ 見出し・キャラクター | LPFAQSection |
| `footer/` | 3 | ロゴ・都市景観・カップル | LandingFooter |

合計 57 ファイル。正本側はセクション別PNGを管理する。

## アセット一覧

| 正本ファイル | 元素材 | 用途 |
|---|---|---|
| `hero/product-mockup-pc-phone.png` | `section_image/asset/hero/09_mockup_pc_smartphone.png` | Hero 端末モック |
| `worries/card-*.png` | `section_image/asset/2/lp02_02〜05_*` | 悩みカード |
| `features/card-*.png` | `section_image/asset/４/02〜07_*` | 機能カード |
| `how-to/step-*.png` | `section_image/asset/How_use/01〜04_*` | 使い方ステップ |
| `before-after/*` | `section_image/asset/３/*` | Before/After セクション |
| `pricing/*` | `section_image/asset/pricing/*` | 料金装飾・参考素材 |
| `faq/person-pc.png` | `section_image/asset/FAQ/woman_pc_green_transparent.png` | FAQ キャラクター |
| `footer/*.png` | `section_image/asset/Footer/*`, 旧 `assets/branding/compass-icon-navy.png` | Footer ロゴ・装飾 |

## 運用ルール

- 人物、アイコン、装飾は透過PNGを必須にする。
- UIカード、端末モック、料金カードは白いカード面を持つ画像を許容する。
- 見出し、CTA、料金、FAQ本文など主要コピーは画像化せずHTMLで実装する。
- 画像参照の共通ベースは `src/lib/marketing/lp-assets.ts` の `LP_SECTION_ASSET_BASE` / `lpSectionAsset()` を使う。
- 新規 root LP 素材を追加する場合は `sections/<section>/` に英語 kebab-case で置く。

## 検証

整理後に確認すること:

- 実装参照と実ファイルの突き合わせで missing が 0。
- `npm run lint:ui:guardrails`
- `npm run test:unit -- src/components/landing/`
- `npm run test:ui:review -- /`
