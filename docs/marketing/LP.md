# 就活Pass LP 構成 & 実装リファレンス

> **目的**: root LP (`/`) の現行セクション構成、素材利用方針、検証手順をまとめる。
> **最終更新**: 2026-05-07（HowToカード内余白最小化、機能カード白背景、Before/After単色矢印）

見た目の詳細（トークン・シャドウ・guardrails・エージェント向け規約）の正本はリポジトリルートの [`DESIGN.md`](../../DESIGN.md)。root LP の構図参照は `/Users/saoki/work/design/shupass` と [`public/marketing/LP/section_image/`](../../public/marketing/LP/section_image/)、実装素材の正本は [`public/marketing/LP/sections/`](../../public/marketing/LP/sections/)。

## 現在のLP構成

root LP は `src/app/(marketing)/page.tsx` で metadata と `FaqJsonLd` を定義し、表示は `src/components/landing/LandingPage.tsx` に集約する。PC / mobile とも `LP.png` や `section_image` の一枚画像表示は使わず、HTML テキスト、リンク、料金、FAQ と `sections/**` の透過PNGを組み合わせたレスポンシブコンポーネントで再現する。

0. `LandingHeader` — root LPにも表示。ブランド、機能/使い方/料金/FAQナビ、ログイン/無料CTA。高さは 78px に抑える
1. `HeroSection` — H1、説明文、2 CTA、信頼バッジ、PC/スマホ合成モック（`sections/hero/*`）
2. `PainPointsSection` — 4 列の悩みカード（`sections/worries/person-*.png`）。sr-only テキスト併置で a11y 維持
3. `FeaturesSection` — 左見出し + 作成/対策/管理フロー図、3列 x 2段で `sections/features/*` 画像カード 6 枚。Google カレンダー連携を含む 6 機能。フロー図カードと各機能カードの画像面は白背景にする
4. `HowToUseSection` — 4 ステップカード（`sections/how-to/step-*.png`）+ HTML の番号・アイコン・補足ボックス。`xl`(1280px+) で4カード横並び。画像コンテナは desktop 270px / small 300px で、本文・画像・補足ボックス間の余白をカード内部だけほぼなくしたコンパクトレイアウト。透過 PNG はコンテナ内で少し大きめに表示して見かけ上の上下余白を抑える。1列時は縦矢印、4列時は横矢印で接続する
5. `BeforeAfterSection` — Before/After比較。人物イラストは `sections/before-after/*`、中央矢印は `var(--lp-cta)` 単色の太い SVG に軽い影だけを付ける。横版・縦版を `BeforeAfterArrow` で揃える。固定幅ステージは `1360px` 以上だけで使う
6. `PricingSection` — Free / Standard / Pro。価格・機能は `src/lib/marketing/pricing-plans.ts`。trust pill: `無料プランあり` / `必要な分だけ使える` / `あとから変更OK`
7. `LPFAQSection` — 2列 x 5行の FAQ アコーディオン（10 項目）。クリックで回答開閉、初期状態は最初の 1 項目が展開。`aria-expanded` / `aria-controls` で a11y 対応。データは `src/lib/marketing/landing-faqs.ts`、JSON-LD と共有。キャラクター: `sections/faq/person-pc.png`。desktop では FAQ グリッドに `xl:mr-[260px]` でスペース確保し、人物イラストは z-10 コンテナに `absolute right-14 top-[200px]` で固定。アコーディオン開閉時にイラストが動かない。`overflow-clip` で装飾がはみ出さない

全セクション共通: `LpSparkleDecorations` コンポーネント（`src/components/landing/shared/LpSparkleDecorations.tsx`）で4-pointed star と dot の装飾を配置。色は `#b9d8ff` / `#78b5ff` / `#d3e5ff`、opacity 0.2-0.55、size 8-18px
8. `LandingFooter` — ブランド説明、リンク群、cityscape（`sections/footer/cityscape.png`）、カップルイラスト（`sections/footer/couple.png`）。カップルイラストは小さめ・下寄せで、リンク列と被らない

## 素材利用方針

- 人物、端末、UIカード、装飾は `public/marketing/LP/sections/**` を使う。
- 新アセットは `public/marketing/LP/sections/<section>/` に英語 kebab-case で配置する。旧 `shupass-v2/` パスは root LP から廃止済み。
- `public/marketing/LP/section_image/**` と `sections/how-to/section-reference.png` はセクション単位の視覚参照としてのみ使い、本番DOMでは描画しない。
- `public/marketing/LP/LP.png` は全体構図の視覚参照としてのみ使い、本番DOMでは描画しない。
- `uploads`, `tmp_uploads`, `refs`, `screenshots` は本番DOMから参照しない。
- 見出し、本文、CTA、料金、FAQはHTMLで実装する。SEOとアクセシビリティを優先し、テキスト入り画像を主要コピーとして使わない。
- 料金は `pricing-plans.ts`、FAQは `landing-faqs.ts` をSSOTとする。使い方ステップは `HowToUseSection.tsx` 内に直接定義する（`landing-steps.ts` は削除済み）。
- 画像は表示サイズを固定し、Hero の主要端末画像も含めて `lpSectionAsset()` 経由で `sections/**` の実在素材のみを参照する。画像パスは `src/lib/assets/image-registry.ts` の型安全レジストリ（`LP_SECTION_ASSETS` / `LOGO_ASSETS` / `DASHBOARD_ASSETS`）で管理し、`lpSectionAsset(LP_SECTION_ASSETS.howTo.stepRegisterCompany)` のように定数で参照する。ハードコード文字列パスは禁止。

## デザイン方針

- `/Users/saoki/work/design/shupass` と `section_image/*` を視覚参照にする。白基調、淡いブルー装飾、青CTAで統一する。
- FAQ は `section_image/9a1dc7d3-5891-4ee5-b111-4bdd13a8a00c.png` を参照し、Pricing と Footer の間に残す。
- Standard の表示価格は参照画像の `¥980/月` ではなく、課金SSOTの現行値を正とする。
- 主見出しは `--lp-navy` (`#0b1e3a`)、CTA/強調は `--lp-cta` (`#2680ff`)、本文補足は `--lp-muted-text` (`#4b5563`) を使う。
- Hero 以外の root LP セクション見出しは desktop でもヒーロー級にしない。通常セクションは概ね `lg:text-[52px]` までに抑えるが、HowToUseSection のみステップ導入として `lg:text-[56px]` を許容する。本文・CTA・カード内テキストは一段小さい密度にする。
- root LP の主要ラッパーは `px-6 sm:px-10 lg:px-12 xl:px-14` を基本にし、画面端と要素の余白を確保する。
- root LP の metadata / JSON-LD / FAQ / 料金コピーでは、支払い情報が不要と読める no-card 系の断定コピーを使わない。`Freeプラン` と `有料プランへ変更する場合は決済画面で支払い情報を入力` を分けて書く。
- ボーダーは `--lp-border-default` (`#d0d7e2`) を全セクションで統一使用する。
- フォントは Noto Sans JP 単体（Inter は使用しない）。全セクションで `fontFeatureSettings: '"palt"'` を指定する。
- desktop は `section_image` の `1672px x 941px` 構図を主基準にする。mobile は縦積みと縮小模写を併用し、横スクロールなしを優先する。
- 各セクションに `data-section` を付け、Playwright の section screenshot で比較できるようにする。

## 実装ファイル

| ファイル | 役割 |
| --- | --- |
| `src/app/(marketing)/page.tsx` | metadata、FAQ JSON-LD、`LandingPage` 呼び出し |
| `src/components/landing/LandingPage.tsx` | root LP のヘッダーとセクション順 |
| `src/components/landing/sections/*.tsx` | root LP 専用セクション |
| `src/components/landing/shared/LpSparkleDecorations.tsx` | 全セクション共通キラキラ装飾 |
| `src/lib/assets/image-registry.ts` | 型安全な画像パスレジストリ（`LP_SECTION_ASSETS`, `LOGO_ASSETS`, `DASHBOARD_ASSETS`） |
| ~~`src/lib/marketing/lp-assets.ts`~~ | 削除済み（`image-registry.ts` に統合） |
| ~~`src/lib/marketing/landing-steps.ts`~~ | 削除済み（データは `HowToUseSection.tsx` に内包） |
| `src/lib/marketing/landing-faqs.ts` | root LP FAQ SSOT |
| `src/lib/marketing/pricing-plans.ts` | 料金表示SSOT |

## 検証

UI変更時は以下を実行する。

```bash
npm run verify:prepare -- / --surface=marketing --auth=none
rg "/marketing/LP/LP.png|/marketing/LP/section_image|section_image/asset|uploads|tmp_uploads|shupass-v2" src/components/landing src/app/'(marketing)' --glob '!*.test.ts'
npm run lint:ui:guardrails
npm run test:unit -- src/app/'(marketing)'/page.test.ts src/components/landing/sections/*.test.ts src/lib/marketing/landing-faqs.test.ts src/components/landing/LandingHeader.test.ts src/components/landing/LandingFooter.test.ts
npm run test:ui:review -- /
npx playwright screenshot --viewport-size=1672,941 --full-page http://127.0.0.1:3000/ output/playwright/lp-current-1672-full.png
```

必要に応じて `npm run build` も実行する。
