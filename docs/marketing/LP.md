# 就活Pass LP 構成 & 実装リファレンス

> **目的**: LP（ランディングページ）の現行セクション構成、デザイン方針、実装ファイルを一箇所にまとめる。
> **対象読者**: LP の改修・拡張に関わるチーム全員
> **最終更新**: 2026-04-05（Stripe マーケ準拠の全面刷新。見た目のモデルは Stripe、ブランド色は就活Pass のまま）

**見た目の詳細（トークン・シャドウ・guardrails・エージェント向け規約）の正本はリポジトリルートの [`DESIGN.md`](../../DESIGN.md)。** 本書のトークン表は概要であり、実装では `DESIGN.md` と [`src/app/globals.css`](../../src/app/globals.css) の `--lp-*` を優先する。

---

## 現在のLP構成

```
 1. LandingHeader       — 固定ヘッダー（細めボーダー・ゴーストログイン + 赤CTA）
 2. HeroSection         — lg: 2カラム（左コピー+CTA、右ダッシュボードSS）・グラデ背景
 3. TrustStripSection   — 信頼帯（landing-content の trustPoints：決済・クレカ・カレンダー）
 4. PainPointsSection   — 3カラムカード（細境界・Stripe風）
 5. BeforeAfterSection  — 表形式に近い Before/After（4行）
 6. FeatureESSection    — Feature 01 + ES SS
 7. FeatureManagement   — Feature 02 逆配置 + カレンダー SS
 8. FeatureInterview    — Feature 03 + 志望動機 SS
 9. ComparisonSection   — 就活塾比較テーブル
10. PricingSection      — 3カラム（推奨はネイビー地）
11. FAQSection          — アコーディオン（白カード内）
12. FinalCTASection     — ダークネイビー帯
13. LandingFooter       — 4列リンク
14. StickyCTABar        — モバイル下部固定 CTA（md:hidden）
```

---

## デザインシステム（LP限定・概要）

詳細はルート [`DESIGN.md`](../../DESIGN.md) を参照。

| 用途 | 値 | 備考 |
|------|-----|------|
| テキスト主色 | `--lp-navy`（`#000666`） | ダークネイビー |
| CTAボタン | `--lp-cta`（`#B7131A`） | 赤、白テキスト |
| Feature ラベル | CTA 色 + uppercase tracking-widest | "Feature 01" 等 |
| セクション背景 | 白 / オフホワイト（`--lp-surface-page`）等 | コントラスト確保 |
| FinalCTA 背景 | `--lp-navy` | ダークネイビー |
| Pricing ハイライト | ネイビー背景 + 白テキスト | Standard プラン |
| フォント | Inter + Noto Sans JP | 見出しは 600 前後を基準（DESIGN.md） |
| 境界 | `--lp-border-default`（`#e5edf5`） | Stripe 的な標準罫線 |
| 画像 | `/marketing/screenshots/*.png` | プロダクト SS |
| シャドウ | `--lp-shadow-card` / `--lp-shadow-screenshot` | Stripe 系複層 |

---

## ファイル一覧

### コンポーネント（`src/components/landing/`）

| ファイル | セクション | 備考 |
|---------|-----------|------|
| `LandingHeader.tsx` | ヘッダー | ナビ + ゴーストログイン + 赤CTA |
| `HeroSection.tsx` | ヒーロー | 2カラム（lg）、グラデ背景、バッジ |
| `TrustStripSection.tsx` | 信頼帯 | `landing-content.ts` の trustPoints |
| `LandingSectionMotion.tsx` | モーション | framer-motion whileInView（クライアント） |
| `PainPointsSection.tsx` | 悩みカード | lucide アイコン |
| `BeforeAfterSection.tsx` | Before/After | 表形式レイアウト |
| `FeatureESSection.tsx` | Feature 01 | ES添削画面SS |
| `FeatureManagementSection.tsx` | Feature 02 | カレンダー画面SS + 統計数値 |
| `FeatureInterviewSection.tsx` | Feature 03 | 志望動機画面SS |
| `ComparisonSection.tsx` | 競合比較 | HTML table、就活塾との比較 |
| `PricingSection.tsx` | 料金プラン | 3カラム、pricing-plans.ts からデータ取得 |
| `FAQSection.tsx` | FAQ | "use client"、landing-faqs.ts からデータ取得 |
| `FinalCTASection.tsx` | 最終CTA | ダークネイビー背景 |
| `StickyCTABar.tsx` | モバイルCTA | "use client"、常時表示（md 未満） |
| `landing-media.ts` | メディア定義 | PNG パス + alt テキスト |
| `index.ts` | barrel export | 全セクションの re-export |

### データ（`src/lib/marketing/`）

| ファイル | 内容 |
|---------|------|
| `landing-faqs.ts` | FAQ 6問（AIバレ / 無料プラン / 就活塾 / スマホ / データ安全 / クレジット） |
| `landing-content.ts` | `trustPoints`（信頼帯）ほか |
| `pricing-plans.ts` | Free / Standard / Pro の機能リスト・価格 |

### ページ

| ファイル | 内容 |
|---------|------|
| `src/app/(marketing)/page.tsx` | LP ルート。各セクション + インラインフッター |
| `src/app/(marketing)/page.test.ts` | セクション構成の回帰テスト |

### アセット（`public/marketing/screenshots/`）

| ファイル | 用途 |
|---------|------|
| `hero-dashboard.png` | Hero セクション |
| `es-review.png` | Feature 01 |
| `calendar.png` | Feature 02 |
| `motivation.png` | Feature 03 |
| `logo-icon.png` | ロゴアイコン |

---

## 削除済みファイル（2026-04-05 リデザイン時）

```
src/components/landing/variants/          — ディレクトリごと削除
  HeroSectionA.tsx, HeroSectionB.tsx, HeroSectionC.tsx
  ProductShowcaseA.tsx, ProductShowcaseB.tsx, ProductShowcaseC.tsx
  LaptopFrame.tsx, CTASectionVariant.tsx
src/components/landing/FloatingOrbs.tsx
src/components/landing/GlassScreenPreview.tsx
src/components/landing/GradientBlobBackground.tsx
src/components/landing/ProductShowcase.tsx
src/components/landing/HowItWorksSection.tsx
src/components/landing/CTASection.tsx
src/components/landing/ScreenPreview.tsx
src/components/landing/ScrollReveal.tsx
src/components/landing/LandingPrimaryAction.tsx
```

---

## FAQ 内容一覧

| # | 質問 | 回答要約 |
|---|------|---------|
| 1 | AIが作成したESは選考でバレませんか？ | 自動生成ではなく原体験ベース。最終調整はユーザー |
| 2 | 無料プランでは何ができますか？ | 月30CR、AI添削、企業5社、ガクチカ3件、カレンダー連携 |
| 3 | 就活塾と何が違いますか？ | 月¥0〜2,980 vs 月3〜10万。24時間利用可 |
| 4 | スマホでも利用できますか？ | 全機能レスポンシブ対応 |
| 5 | 入力したデータは安全ですか？ | Google OAuth + 暗号化。AI学習不使用 |
| 6 | クレジットとは何ですか？ | 成功時のみ消費、毎月リセット。添削は6〜20CR/回 |

---

## 今後の拡張候補

| 施策 | 優先度 | 依存 |
|------|--------|------|
| ソーシャルプルーフ（ユーザー数、利用者の声） | P1 | ユーザーデータ蓄積 |
| 季節対応アナウンスバー | P2 | 就活シーズンに合わせたコピー |
| 中間CTA（Feature後） | P2 | なし |
| HowTo JSON-LD | P2 | なし |
| インタラクティブデモ | P3 | デモ環境構築 |
| AggregateRating JSON-LD | P3 | レビューデータ |
