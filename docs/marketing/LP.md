# 就活Pass LP 構成 & 実装リファレンス

> **目的**: LP（ランディングページ）の現行セクション構成、デザイン方針、実装ファイルを一箇所にまとめる。
> **対象読者**: LP の改修・拡張に関わるチーム全員
> **最終更新**: 2026-04-17（内部用語（「辞書とスコア」「8 種」「6 軸」「ハイブリッド検索」）を平易化。`FeatureInterviewSection` を「志望動機・ガクチカ対話」+「企業別 AI 模擬面接」の 2 パート構造に拡張。Comparison 11 行、FAQ 10 問）

**見た目の詳細（トークン・シャドウ・guardrails・エージェント向け規約）の正本はリポジトリルートの [`DESIGN.md`](../../DESIGN.md)。** 本書のトークン表は概要であり、実装では `DESIGN.md` と [`src/app/globals.css`](../../src/app/globals.css) の `--lp-*` を優先する。

---

## 現在のLP構成

```
 1. LandingHeader       — 固定ヘッダー（細めボーダー・ゴーストログイン + 赤CTA）
 2. HeroSection         — lg: 2カラム（左コピー+CTA、右ダッシュボードSS）・グラデ背景
 3. TrustStripSection   — 信頼帯（landing-content の trustPoints：設問タイプ別AI添削 / 成功時のみ消費 / 企業情報反映 / カード登録不要）
 4. PainPointsSection   — 3カラムカード（各カードに「→ ソリューション」ヒント）
 5. BeforeAfterSection  — 表形式の Before/After（5行・AI表現検出含む）
 6. FeatureESSection    — Feature 01（8種設問テンプレ・AI表現辞書検出・文字数構成）+ ES SS
 7. FeatureManagement   — Feature 02 逆配置 + カレンダー SS
 8. FeatureInterview    — Feature 03 を 2 パート（Part 1: 志望動機・ガクチカ対話 + SS / Part 2: 企業別 AI 模擬面接 + 特徴カード）。内部数字（6 軸）は削除し具体名ベースの訴求へ
 9. MidCTASection       — 中間CTA帯（`--lp-tint-navy-soft` 背景）
10. HowItWorksSection   — 3 ステップ（LANDING_STEPS SSOT）
11. QualitySection      — 4 ポイントカード（設問ごとに専用テンプレ / 会社情報反映 / AI っぽい定型文を書き直し / 失敗時クレジットゼロ）
12. ComparisonSection   — 11 行テーブル（面接のフィードバック行を追加）。就活塾料金は「対面指導のため高額」、具体数字を外し景表法回避
13. PricingSection      — 3カラム（各プランに audience サブ、Free に「カード登録不要」バッジ、下部に /pricing リンク）
14. FAQSection          — アコーディオン（landing-faqs 10 問）
15. FinalCTASection     — ダークネイビー帯
16. LandingFooter       — 4列リンク
17. StickyCTABar        — モバイル下部固定 CTA（md:hidden）
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
| `PainPointsSection.tsx` | 悩みカード | lucide アイコン、→ ソリューションヒント付き |
| `BeforeAfterSection.tsx` | Before/After | 表形式レイアウト（5行） |
| `FeatureESSection.tsx` | Feature 01 | ES添削画面SS。設問ごとの専用テンプレ / 定番フレーズ例を用いた書き直し案 / 文字数構成を訴求 |
| `FeatureManagementSection.tsx` | Feature 02 | カレンダー画面SS + 統計数値 |
| `FeatureInterviewSection.tsx` | Feature 03 | 2 パート構造。Part 1 = 志望動機・ガクチカ対話（motivation SS + 観点ベースの 3 項目）、Part 2 = 企業別 AI 模擬面接（icon カード + 4 項目、SS なし） |
| `MidCTASection.tsx` | 中間CTA | `--lp-tint-navy-soft` 背景、600px 中央揃え |
| `HowItWorksSection.tsx` | 3 ステップ | `LANDING_STEPS` SSOT から描画、ドリフト防止テスト付き |
| `QualitySection.tsx` | 仕組み訴求 | 4 ポイント（設問ごとに専用テンプレ / 会社情報反映 / AI っぽい定型文を書き直し / 失敗時0CR） |
| `ComparisonSection.tsx` | 競合比較 | HTML table、11 行（面接対策 + 面接のフィードバック）。就活塾料金は「対面指導のため高額」表記 |
| `PricingSection.tsx` | 料金プラン | 3カラム、pricing-plans.ts からデータ取得 |
| `FAQSection.tsx` | FAQ | "use client"、landing-faqs.ts からデータ取得 |
| `FinalCTASection.tsx` | 最終CTA | ダークネイビー背景 |
| `StickyCTABar.tsx` | モバイルCTA | "use client"、常時表示（md 未満） |
| `landing-media.ts` | メディア定義 | PNG パス + alt テキスト |
| `index.ts` | barrel export | 全セクションの re-export |

### データ（`src/lib/marketing/`）

| ファイル | 内容 |
|---------|------|
| `landing-faqs.ts` | FAQ 10 問（AIバレ / 無料プラン / 就活塾 / スマホ / データ安全 / クレジット / ChatGPT 差分 / 企業別カスタマイズ / 無料で試せる範囲 / 企業ごとの面接対策） |
| `landing-content.ts` | `trustPoints`（信頼帯・4 要素）ほか |
| `landing-steps.ts` | `LANDING_STEPS`（HowItWorks SSOT・3 ステップ） |
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
| 2 | 無料プランでは何ができますか？ | 月50CR、AI添削、企業5社、ガクチカ5件、カレンダー連携 |
| 3 | 就活塾と何が違いますか？ | 月¥0〜2,980 vs 月3〜10万。24時間利用可 |
| 4 | スマホでも利用できますか？ | 全機能レスポンシブ対応 |
| 5 | 入力したデータは安全ですか？ | Google OAuth + 暗号化。AI学習不使用 |
| 6 | クレジットとは何ですか？ | 成功時のみ消費、毎月リセット。添削は6〜20CR/回 |
| 7 | ChatGPT でES添削するのと何が違う？ | 設問ごとの専用テンプレ / AI が使いがちなフレーズを検出 / 企業情報自動反映 |
| 8 | 企業別の志望動機・ガクチカはできる？ | 企業情報を自動で取り込み、企業固有性の薄い言い回しは深掘りへ回す |
| 9 | 就活塾の代わりになる？無料で試せる？ | 対面指導は非提供、Free 50CR で ES 添削約 8 回試せる |
| 10 | 企業ごとの面接対策はできる？ | 企業情報 × 職種 × 面接方式 × 選考段階で AI 面接官が質問。終了後に良かった点・改善点・改善後の回答例・次に準備したい論点まで提示 |

---

## SEO 判断メモ（2026-04-17 LP 改善時）

LP 改善時に以下の JSON-LD / metadata 施策を意図的に見送った。再検討時に同じ議論をしないための記録。

| 項目 | 判断 | 理由 |
|------|------|------|
| HowTo JSON-LD | 見送り | Google が 2023-09 にリッチリザルト終了。構造化データ追加は費用対効果なし |
| BreadcrumbList JSON-LD | 見送り | LP は 1 階層構造で対象外。Search Console 警告源になりうる |
| ItemList JSON-LD（Features） | 見送り | SaaS 機能一覧は Rich Results 対象カテゴリ外 |
| FAQPage 拡張を SEO 目的で正当化 | 見送り | 2023-08 以降 gov/医療限定。既存 FAQPage は内部コンテンツ目的で維持 |
| Comparison 列副題に競合サービス名 | 見送り | 景表法 5 条 / 不競法 2 条 1 項 21 号（信用毀損）回避 |
| 就活塾料金「3〜10万円」表記 | 見送り | 根拠資料未確認、優良誤認リスク。「対面指導のため高額」に後退 |
| meta keywords フィールド | 見送り | Google は 2009 年から無視、スパム兆候 |
| AggregateOffer + Offer 並列 | 見送り | schema.org 非準拠、Rich Results Test で重複警告 |

導入した SEO 施策:
- `Organization` JSON-LD ノード（`src/lib/seo/site-structured-data.ts`）
- LP `/` 専用の `description` SSOT（`getMarketingDescription("/")`）
- LP `/` 用 `export const metadata`（`src/app/(marketing)/page.tsx`）で便益＋対象者型の title

---

## 今後の拡張候補

| 施策 | 優先度 | 依存 |
|------|--------|------|
| ソーシャルプルーフ（ユーザー数、利用者の声） | P1 | ユーザーデータ蓄積 |
| 季節対応アナウンスバー | P2 | 就活シーズンに合わせたコピー |
| インタラクティブデモ | P3 | デモ環境構築 |
| AggregateRating JSON-LD | P3 | レビューデータ |
