# 就活Pass LP 構成 & 実装リファレンス

> **目的**: LP（ランディングページ）の現行セクション構成、デザイン方針、コピーテキスト、コンバージョン戦略、実装ファイルを一箇所にまとめる。
> **対象読者**: LP の改修・拡張に関わるチーム全員
> **最終更新**: 2026-04-18（コンバージョンジャーニー、セクション別コピー & デザイン意図、コピースタイルガイド、モバイル固有挙動、コンテンツ依存関係、A/B テスト候補を追加。Claude Design 入力用 SPEC への相互リンクを追加）

**見た目の詳細（トークン・シャドウ・guardrails・エージェント向け規約）の正本はリポジトリルートの [`DESIGN.md`](../../DESIGN.md)。** 本書のトークン表は概要であり、実装では `DESIGN.md` と [`src/app/globals.css`](../../src/app/globals.css) の `--lp-*` を優先する。

**デザインモック生成用ブリーフ**: [`docs/marketing/CLAUDE_DESIGN_SPEC.md`](./CLAUDE_DESIGN_SPEC.md) — Claude Design に渡す自己完結型のプロダクト & デザイン仕様書。hex 値と日本語コピーで完結し、コードを含まない。

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
| `shared/LandingCheckList.tsx` | Check 行リスト | navy 丸背景 + 白 Check アイコン。Feature 系セクションで共通利用 |
| `shared/LandingFeatureCard.tsx` | 機能カード | icon + title + description + 任意 arrow。PainPoints 系で共通利用 |
| `ai-mensetsu/*.tsx` | AI 模擬面接 LP 専用 | Hero / PainPoints / FeatureFormats / FeatureScoring / FeatureFlow の 5 component |
| `shiboudouki-ai/*.tsx` | 志望動機 AI LP 専用 | Hero / PainPoints / FeatureSlots / FeatureMode / FeatureDraft の 5 component |
| `gakuchika-ai/*.tsx` | ガクチカ AI LP 専用 | Hero / PainPoints / FeaturePhase / FeatureStar / FeatureInterviewReady の 5 component |
| `es-tensaku-ai/*.tsx` | ES 添削 AI LP 専用 | Hero / PainPoints / FeatureTemplate / FeatureCompany / FeatureRewrite の 5 component |

### データ（`src/lib/marketing/`）

| ファイル | 内容 |
|---------|------|
| `landing-faqs.ts` | FAQ 10 問（AIバレ / 無料プラン / 就活塾 / スマホ / データ安全 / クレジット / ChatGPT 差分 / 企業別カスタマイズ / 無料で試せる範囲 / 企業ごとの面接対策） |
| `ai-mensetsu-faqs.ts` | `/ai-mensetsu` FAQ 6 問 |
| `shiboudouki-ai-faqs.ts` | `/shiboudouki-ai` FAQ 6 問 |
| `gakuchika-ai-faqs.ts` | `/gakuchika-ai` FAQ 6 問 |
| `es-tensaku-ai-faqs.ts` | `/es-tensaku-ai` FAQ 6 問 |
| `landing-content.ts` | `trustPoints`（信頼帯・4 要素）ほか |
| `landing-steps.ts` | `LANDING_STEPS`（HowItWorks SSOT・3 ステップ） |
| `pricing-plans.ts` | Free / Standard / Pro の機能リスト・価格 |

### ページ

| ファイル | 内容 |
|---------|------|
| `src/app/(marketing)/page.tsx` | LP ルート。各セクション + インラインフッター |
| `src/app/(marketing)/page.test.ts` | セクション構成の回帰テスト |
| `src/app/(marketing)/es-tensaku-ai/page.tsx` | ES 添削 AI LP。Hero + PainPoints + Feature×3 + MidCTA + FAQ + FinalCTA |
| `src/app/(marketing)/es-tensaku-ai/page.test.ts` | ES 添削 AI LP のセクション構成回帰テスト |

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
| BreadcrumbList JSON-LD（LP 1 階層） | 見送り | LP ルート / 機能 LP は 1 階層で `BreadcrumbList` 対象外 |
| BreadcrumbList JSON-LD（2 階層ページ） | **採用**（2026-04-17） | `/tools/es-counter` `/templates/shiboudouki` `/templates/gakuchika-star` `/checklists/deadline-management` に `BreadcrumbJsonLd` を追加。`src/lib/seo/breadcrumb-jsonld.ts` を SSOT とし、`getAppUrl()` で絶対 URL を生成 |
| ItemList JSON-LD（Features） | 見送り | SaaS 機能一覧は Rich Results 対象カテゴリ外 |
| `SoftwareApplication.featureList` | **採用**（2026-04-17） | `src/lib/seo/site-structured-data.ts` に実装裏付けのある 8 機能を列挙。Rich Results 保証はないが、ナレッジグラフ向けメタデータとして価値あり |
| FAQPage 拡張を Rich Results 目的で正当化 | 見送り | 2023-08 以降 gov/医療限定（Google 2026-04-08 更新で再確認）。FAQPage JSON-LD は「可視 FAQ セクションの構造化データ整理」目的で継続利用、Rich Results は期待しない |
| Comparison 列副題に競合サービス名 | 見送り | 景表法 5 条 / 不競法 2 条 1 項 21 号（信用毀損）回避 |
| 就活塾料金「3〜10万円」表記 | 見送り | 根拠資料未確認、優良誤認リスク。「対面指導のため高額」に後退 |
| meta keywords フィールド | 見送り | Google は 2009 年から無視、スパム兆候 |
| AggregateOffer + Offer 並列 | 見送り | schema.org 非準拠、Rich Results Test で重複警告 |

導入した SEO 施策:
- `Organization` / `SoftwareApplication` / `WebSite` JSON-LD グラフ（`src/lib/seo/site-structured-data.ts`）
- LP `/` 専用の `description` SSOT（`getMarketingDescription("/")`）
- LP `/` 用 `export const metadata`（`src/app/(marketing)/page.tsx`）で便益＋対象者型の title
- SEO 個別 LP 8 枚（`/es-tensaku-ai` `/shukatsu-ai` `/entry-sheet-ai` `/es-ai-guide` `/shukatsu-kanri` `/ai-mensetsu` `/shiboudouki-ai` `/gakuchika-ai`）。各 LP は `createMarketingMetadata` で canonical 自己参照、FAQ は `src/lib/marketing/{slug}-faqs.ts` に SSOT 分離
- 2 階層ページ 4 枚（tools / templates / checklists）に `BreadcrumbJsonLd`
- `/pricing` を Server Component + Client Island（`PricingInteractive`）に分離。metadata / FAQ / 比較表は Server Component で初期 HTML に直接出力、billing toggle / Stripe checkout / useSearchParams は Client Island に閉じ込め
- 新規 LP 追加時のチェックリスト: `src/app/sitemap.ts`、`src/app/robots.ts`、`docs/marketing/README.md` の 3 箇所を必ず更新。FAQ は SSOT 分離し `FaqJsonLd` で埋め込む。訴求は `backend/app/routers/` と `docs/features/` にある実装のみ
- 機能 LP 4 枚は `/pricing` へ誘導で統一。Pricing / Comparison セクションは含めない（root LP に集約）

---

## 機能 LP 4 枚のセクション構成

4 LP 共通: `LandingHeader` → 専用 Hero → 専用 PainPoints → Feature 系 ×3 → `MidCTASection`（props） → `FAQSection`（props + SSOT FAQs） → `FinalCTASection`（props） → `LandingFooter` → `StickyCTABar`

### `/ai-mensetsu`（AI 模擬面接）

| # | Component | 背景色 | 目的 |
|---|---|---|---|
| 1 | `AiMensetsuHeroSection` | グラデ | H1 + 右 AI 面接 UI mock（回答カバー状況 / 面接モード） |
| 2 | `AiMensetsuPainPointsSection` | 白 | 3 カード: 練習相手 / 企業別準備 / 弱点 |
| 3 | `AiMensetsuFeatureFormatsSection` | `--lp-surface-page` | Feature 01: 4 方式（行動面接 / ケース面接 / 技術面接 / 人生史面接） |
| 4 | `AiMensetsuFeatureScoringSection` | 白 | Feature 02: 7 軸講評 + 最も改善が必要な質問 mock |
| 5 | `AiMensetsuFeatureFlowSection` | `--lp-surface-page` | Feature 03: 条件設定 → 深掘り → 7 軸講評の 3 ステップ |

### `/shiboudouki-ai`（志望動機 AI）

| # | Component | 背景色 | 目的 |
|---|---|---|---|
| 1 | `ShiboudoukiAiHeroSection` | グラデ | H1 + 右 6 要素スロット進捗 mock |
| 2 | `ShiboudoukiAiPainPointsSection` | 白 | 3 カード: 何を書くか / 他社通用 / 書き直し |
| 3 | `ShiboudoukiAiFeatureSlotsSection` | `--lp-surface-page` | Feature 01: 6 要素スロット（業界理由 〜 差別化） |
| 4 | `ShiboudoukiAiFeatureModeSection` | 白 | Feature 02: 会話あり / なしの 2 ルート |
| 5 | `ShiboudoukiAiFeatureDraftSection` | `--lp-surface-page` | Feature 03: 材料整理 → ES 下書き → 深掘り補強の 3 ステップ |

### `/gakuchika-ai`（ガクチカ AI）

| # | Component | 背景色 | 目的 |
|---|---|---|---|
| 1 | `GakuchikaAiHeroSection` | グラデ | H1 + 右フェーズ tracker + STAR mock |
| 2 | `GakuchikaAiPainPointsSection` | 白 | 3 カード: エピソード弱い / ES 面接バラバラ / 浅い |
| 3 | `GakuchikaAiFeaturePhaseSection` | `--lp-surface-page` | Feature 01: 4 フェーズ（ES 材料フェーズ 〜 面接準備完了） |
| 4 | `GakuchikaAiFeatureStarSection` | 白 | Feature 02: STAR 4 要素の合格基準 + 因果欠落チェック |
| 5 | `GakuchikaAiFeatureInterviewReadySection` | `--lp-surface-page` | Feature 03: ES 材料 → 面接深掘り → 面接準備パックの 3 ステップ |

### `/es-tensaku-ai`（ES 添削 AI）

| # | Component | 背景色 | 目的 |
|---|---|---|---|
| 1 | `EsTensakuAiHeroSection` | グラデ | H1 + 右 ES エディタ + レビューパネル分割 mock |
| 2 | `EsTensakuAiPainPointsSection` | 白 | 3 カード: 何を直せばいいか / 同じ内容 / AI っぽい |
| 3 | `EsTensakuAiFeatureTemplateSection` | `--lp-surface-page` | Feature 01: 設問タイプ別添削（8 種テンプレ） |
| 4 | `EsTensakuAiFeatureCompanySection` | 白 | Feature 02: 企業情報反映（出典リンク + grounding） |
| 5 | `EsTensakuAiFeatureRewriteSection` | `--lp-surface-page` | Feature 03: AI 表現検出 + Before/After 改善提案 |

---

---

## コンバージョンジャーニー（AIDA マッピング）

17 セクションの意図的な配置と、各セクションがユーザーの心理状態をどう動かすかの設計図。

| # | セクション | AIDA | 心理状態の変化 | 感情目標 |
|---|-----------|------|---------------|---------|
| 1 | LandingHeader | — | ナビゲーション提供 | 安心感（迷わない導線） |
| 2 | HeroSection | **Attention** | 「自分の悩みを解決できそう」 | 興味喚起 + 信頼の第一印象 |
| 3 | TrustStripSection | Attention→Interest | 「ちゃんとしたサービスだ」 | 信頼の裏付け |
| 4 | PainPointsSection | **Interest** | 「まさに自分の悩みだ」 | 共感・課題認識 |
| 5 | BeforeAfterSection | Interest | 「改善後の自分が想像できる」 | 変化のビジュアライズ |
| 6 | FeatureESSection | Interest→Desire | 「これなら具体的に ES が良くなる」 | 機能理解 |
| 7 | FeatureManagementSection | Desire | 「締切を落とさなくて済む」 | 安心感 |
| 8 | FeatureInterviewSection | Desire | 「面接も一人で練習できる」 | 可能性の拡大 |
| 9 | MidCTASection | **Action（1回目）** | 「今すぐ試してみよう」 | 行動喚起（ファースト離脱防止） |
| 10 | HowItWorksSection | Action（摩擦低減） | 「簡単に始められる」 | ハードル低減 |
| 11 | QualitySection | Desire（深化） | 「品質に信頼が持てる」 | 信頼の深化 |
| 12 | ComparisonSection | Desire（差別化） | 「この価格でこの機能なら十分」 | 競合排除 |
| 13 | PricingSection | Desire→Action | 「Free で試してから決めればいい」 | 価格正当化 |
| 14 | FAQSection | Action（異議処理） | 「懸念が解消された」 | 残った疑問の解消 |
| 15 | FinalCTASection | **Action（最終）** | 「今すぐ始めよう」 | 最終コンバージョン |
| 16 | LandingFooter | — | 情報・リーガル | — |
| 17 | StickyCTABar | Action（常時） | モバイルでの常時導線 | 離脱防止 |

**設計意図**: MidCTA（#9）で「機能を見た直後の衝動」を拾い、HowItWorks〜FAQ で「理性的な確認」を経て、FinalCTA で最終決断を促す二段構成。

---

## セクション別コピー & デザイン意図

> **注**: コピーの正本はコンポーネント TSX ファイル。以下は便宜的なスナップショットであり、実装と齟齬がある場合は TSX を優先する。

### 2. HeroSection

**ファイル**: `src/components/landing/HeroSection.tsx`

| 要素 | テキスト |
|------|---------|
| バッジ | ES添削から企業別AI模擬面接まで、就活AIで一括サポート |
| H1 | 就活を、AIと一緒に<br/>迷わず進める。 |
| サブテキスト | 志望動機・自己PR・ガクチカから、企業別の AI 模擬面接まで。会社に合わせた添削と対話を、カード登録なしで。 |
| 主 CTA | 無料で試す → |
| 副 CTA | 機能を見る |
| マイクロコピー | カード登録不要 / 成功時のみクレジット消費 / 面接対策までAI と一緒に |

**デザイン意図**: 2カラム（テキスト+スクリーンショット）で「何ができるか」と「実際の画面」を同時に見せる。グラデーション背景で視覚的な入口を作りつつ、白基調の信頼感を維持。バッジのパルスドットで「生きたサービス」感を演出。
**コンバージョン役割**: Attention — 第一印象で「自分に関係ある」と感じさせ、CTA で即座の行動を促す。マイクロコピーで「リスクゼロ」を伝えて摩擦低減。

### 3. TrustStripSection

**ファイル**: `src/components/landing/TrustStripSection.tsx`
**データ**: `src/lib/marketing/landing-content.ts` → `trustPoints`

| # | テキスト |
|---|---------|
| 1 | 設問ごとに専用テンプレで添削 |
| 2 | 成功した時だけクレジット消費 |
| 3 | 企業情報を踏まえたフィードバック |
| 4 | カード登録不要・すぐに試せる |

**デザイン意図**: Hero 直下に最小限のテキストで信頼シグナルを並べ、スクロール前の離脱を防ぐ。
**コンバージョン役割**: Attention→Interest — 「成功時のみ消費」「カード不要」でゼロリスクを即座に伝達。

### 4. PainPointsSection

**ファイル**: `src/components/landing/PainPointsSection.tsx`

| 要素 | テキスト |
|------|---------|
| H2 | こんなお悩み、ありませんか？ |
| サブ | 多くの就活生が抱える課題を、ひとつずつ解消するために設計されています。 |
| カード1 タイトル | ESが書けない |
| カード1 本文 | 何をアピールすればいいか分からない。→ 設問タイプ別のAI添削で、具体的な改善点を指摘します。 |
| カード2 タイトル | 志望動機が浮かばない |
| カード2 本文 | 企業のどこが良いか言語化できない。→ 企業情報を踏まえた対話で、固有の志望動機を整理します。 |
| カード3 タイトル | 締切を忘れそう |
| カード3 本文 | 複数社の選考が重なって管理しきれない。→ 選考日程の自動管理とカレンダー連携で漏れを防ぎます。 |

**デザイン意図**: 各カードに「課題→ソリューションヒント」を含め、次セクションの機能詳細への橋渡し。
**コンバージョン役割**: Interest — 課題を言語化して「自分のことだ」と感じさせる共感フック。

### 5. BeforeAfterSection

**ファイル**: `src/components/landing/BeforeAfterSection.tsx`

| 要素 | テキスト |
|------|---------|
| H2 | 就活Passを使うと、何が変わる？ |
| サブ | よくある「困った」を、具体的な体験の変化に置き換えます。 |

| # | これまで | 就活Passで |
|---|---------|-----------|
| 1 | ESを何度書き直しても、何が足りないか分からない | AIが具体的な改善点を指摘し、書き換え案もその場で確認 |
| 2 | 企業ごとの締切をスプレッドシートで追いきれない | 企業・締切・選考状況がひとつの画面で一覧管理 |
| 3 | 志望動機を聞かれると、頭が真っ白になる | AIとの対話で自分の考えが言語化され、ES下書きも自動生成 |
| 4 | 面接練習の相手がいない | 企業ごとの AI 模擬面接で、面接後に改善点と改善後の回答例まで確認できる |
| 5 | AIらしい定型文が残って、ES が「それっぽい」だけで終わる | 「幅広い視野」「新たな価値」など AI が使いがちな言い回しを見つけて、自分の言葉への書き直し案を提示 |

**デザイン意図**: 左右対比の表形式で「変化」を直感的に伝える。右列はネイビーティント背景で「ポジティブ」を視覚的に強調。
**コンバージョン役割**: Interest — 具体的な変化を 5 つのシナリオで示し、自分の状況に当てはめさせる。

### 6. FeatureESSection（Feature 01）

**ファイル**: `src/components/landing/FeatureESSection.tsx`

| 要素 | テキスト |
|------|---------|
| 親 H2（中央） | 就活に必要な機能を、ひとつに |
| 親サブ | ES・志望動機・スケジュール管理をまとめて対応。ツールを行き来する必要はもうありません。 |
| Eyebrow | ES添削 |
| H3 | ES添削AIが設問ごとに改善案を提示。 |
| 本文 | ESの下書きを貼り付けるだけで、AIが設問タイプに合わせた改善点を提示。書き換え案を見ながらその場で修正できるので、何度でもブラッシュアップできます。 |
| チェック1 | 志望動機・自己PR・ガクチカ・入社後やりたいこと・研究内容など、設問ごとに専用テンプレートで添削 |
| チェック2 | 「幅広い視野」「新たな価値」など AI が使いがちな定番フレーズを見つけて、あなたの言葉への書き直し案を提示 |
| チェック3 | 指定文字数に合わせた構成・改善ポイントを提案 |

**デザイン意図**: 最も使用頻度の高い ES 添削を Feature 01 として最初に配置。スクリーンショットで実画面を見せ、チェックリストで具体的な差別化ポイントを列挙。
**コンバージョン役割**: Interest→Desire — 「8種テンプレート」「AI フレーズ検出」など具体性で信頼を獲得。

### 7. FeatureManagementSection（Feature 02）

**ファイル**: `src/components/landing/FeatureManagementSection.tsx`

| 要素 | テキスト |
|------|---------|
| Eyebrow | 進捗・スケジュール管理 |
| H3 | 進捗と締切を、一目で把握。 |
| 本文 | 企業一覧、締切、応募状況、Googleカレンダー連携まで。情報が散らばらないから、やるべきことに集中できます。 |
| チェック1 | 企業ごとの選考状況をカンバンで一覧管理 |
| チェック2 | 締切をカレンダーで可視化、通知でリマインド |
| チェック3 | Googleカレンダーとワンクリック同期 |

**デザイン意図**: レイアウトを逆配置（左スクショ、右テキスト）にして Feature 01 とのリズム変化を作る。
**コンバージョン役割**: Desire — 「締切管理」という実用的ベネフィットで AI 以外の価値も示す。

### 8. FeatureInterviewSection（Feature 03）

**ファイル**: `src/components/landing/FeatureInterviewSection.tsx`

**Part 1: 志望動機・ガクチカ作成**

| 要素 | テキスト |
|------|---------|
| Eyebrow | 志望動機・ガクチカ作成 |
| H3 | 志望動機もガクチカも、AI との対話で自分の言葉に。 |
| 本文 | 志望動機やガクチカを、AIとの会話で言語化。頭の中の曖昧な考えが、ESに書ける材料に変わります。 |
| チェック1 | 「なぜその業界か／なぜその会社か／そこで何をしたいか」など、志望動機に必要な観点を会話で順に整理 |
| チェック2 | 会社の事業内容や採用ページの情報を踏まえて、あなたらしい志望動機に近づける |
| チェック3 | 「成長できる」「学べる」など、どの会社でも言えそうな表現は追加質問で具体化を促す |

**Part 2: 企業別 AI 模擬面接**

| 要素 | テキスト |
|------|---------|
| Eyebrow | 企業別 AI 模擬面接 |
| H3 | その会社に合わせて、AI 面接官が 1 問ずつ深掘り。 |
| 本文 | 登録した企業情報をふまえて、AI 面接官が質問。あなたの回答を受けて、さらに深掘るか次の論点に移るかを判断します。終了後には、良かった点と改善点、改善後の回答例まで提示。 |
| チェック1 | 会社の事業や採用ページの情報をふまえて質問を生成 |
| チェック2 | あなたの回答に応じて、深掘り質問 or 次の論点へ自動で切り替え |
| チェック3 | 終了後に、良かった点・改善点・改善後の回答例・次に準備したい論点を提示 |
| チェック4 | 職種や面接方式（技術／ケース／人生史 など）、選考段階に合わせた質問 |

**デザイン意図**: 2パート構造で「対話 AI」と「模擬面接 AI」を分離。Part2 はスクリーンショットの代わりにカード型 UI モックで差別化。
**コンバージョン役割**: Desire — 「面接も一人で練習できる」という新しい可能性を提示。

### 9. MidCTASection

**ファイル**: `src/components/landing/MidCTASection.tsx`

| 要素 | テキスト |
|------|---------|
| H2 | まずは無料で、ES添削AIを試す |
| サブ | カード登録不要。ES を貼り付けるだけで始められます。 |
| CTA | 無料で試す → |

**デザイン意図**: 機能説明 3 セクション直後に配置し、「十分理解した」ユーザーの衝動を拾う。ネイビーティント背景で視覚的な区切りとしても機能。
**コンバージョン役割**: Action（1回目） — ファーストスクロール離脱防止。ここで離脱するユーザーには十分な情報を提供済み。

### 10. HowItWorksSection

**ファイル**: `src/components/landing/HowItWorksSection.tsx`
**データ**: `src/lib/marketing/landing-steps.ts` → `LANDING_STEPS`

| 要素 | テキスト |
|------|---------|
| H2 | 3ステップでES添削AIを始める |
| サブ | 登録なしで AI 添削を試してから、続けて使うアカウント作成に進めます。 |
| Step 1 | ESを貼り付ける — 下書きやメモを貼り付けて、設問タイプを選ぶだけ。 |
| Step 2 | AIが改善案を提示 — 設問に合わせた添削結果をすぐに確認。 |
| Step 3 | 気に入ったら保存・継続 — Googleアカウントで保存すれば、企業管理やカレンダー連携も。 |

**デザイン意図**: 3ステップで「簡単さ」を示す。ネイビー背景のアイコンコンテナ + ステップ番号 + コネクターラインで視覚的な進行感。
**コンバージョン役割**: Action（摩擦低減） — 「登録なしで試せる → 気に入ったら保存」の二段階で心理的ハードルを下げる。

### 11. QualitySection

**ファイル**: `src/components/landing/QualitySection.tsx`

| 要素 | テキスト |
|------|---------|
| H2 | その会社・その設問にしっかり寄せる仕組み |
| サブ | 設問ごとの専用テンプレと、会社情報をふまえたチェック。AI まかせで終わらせない添削を目指しています。 |
| カード1 | 設問ごとに専用テンプレート — 志望動機・自己PR・ガクチカ・入社後やりたいこと・研究内容など、設問の種類ごとに評価観点と書き方のお手本を切り替えて添削します。 |
| カード2 | 会社情報を添削にそのまま反映 — 企業の採用ページや公開情報を読み込んで、会話や添削の根拠として引用。毎回ユーザーがペーストする手間を省きます。 |
| カード3 | AI っぽい定型文を、自分の言葉へ — 「幅広い視野」「新たな価値」など AI が使いがちなフレーズを自動で見つけて、別の表現への書き直しを提案します。 |
| カード4 | 失敗時はクレジットゼロ — AI 処理が失敗したときはクレジットを消費しません。Free プランの範囲で試してから、有料プランを検討できます。 |

**デザイン意図**: 2×2 グリッドで「品質の裏付け」を 4 観点で示す。Feature セクションの主張を別角度から補強。
**コンバージョン役割**: Desire（深化） — 「AI まかせで終わらない」ことを示し、品質への懸念を解消。

### 12. ComparisonSection

**ファイル**: `src/components/landing/ComparisonSection.tsx`

| 要素 | テキスト |
|------|---------|
| H2 | 他サービスとの違い |
| サブ | 汎用AIサービスの万能さでも就活塾の高額サポートでもない、就活に特化したAIアシスタントです。 |

11行比較表の内容は本書「現在のLP構成」セクションの ComparisonSection 注記を参照。

**デザイン意図**: 3カテゴリ比較でポジショニングを明確化。就活Pass 列をネイビーティント背景でハイライト。
**コンバージョン役割**: Desire（差別化） — 「汎用 AI でもなく就活塾でもない」独自のポジションを確立。アンカリング効果（就活塾の高額 vs 就活Pass の低価格）。

### 13. PricingSection

**ファイル**: `src/components/landing/PricingSection.tsx`
**データ**: `src/lib/marketing/pricing-plans.ts` → `getMarketingPricingPlans`

| 要素 | テキスト |
|------|---------|
| H2 | シンプルな料金プラン |
| サブ | 用途に合わせて選べる3プラン。いつでもアップグレード・ダウングレード可能です。 |
| Free 対象 | まず試したい方 |
| Standard 対象 | 本格的に就活対策したい方 |
| Pro 対象 | 複数企業を並行で対策したい方 |
| 下部リンク | 料金の詳細を見る → |

**デザイン意図**: Standard をネイビー背景 + Popular バッジで視覚的に推奨。Free に「カード登録不要」バッジで敷居を下げる。
**コンバージョン役割**: Desire→Action — Free の存在で「まず試す」選択肢を示し、Standard の日割り「¥49」で価格正当化。

### 14. FAQSection

**ファイル**: `src/components/landing/FAQSection.tsx`
**データ**: `src/lib/marketing/landing-faqs.ts` → `LANDING_PAGE_FAQS`

10問の全文は本書「FAQ 内容一覧」セクションを参照。

**デザイン意図**: アコーディオン形式で情報量を制御。最も多い懸念（AI バレ・無料範囲・就活塾比較）を上位に配置。
**コンバージョン役割**: Action（異議処理） — 残った疑問を解消し、最終 CTA への導線をスムーズにする。

### 15. FinalCTASection

**ファイル**: `src/components/landing/FinalCTASection.tsx`

| 要素 | テキスト |
|------|---------|
| H2 | さあ、就活を<br/>スムーズに進めよう。 |
| サブ | ESを貼り付けるだけで、AIが改善案を提示します。 |
| CTA | 無料で試す → |
| 細字 | クレジットカード登録不要 ・ いつでも解約可能 |

**デザイン意図**: ダークネイビー背景で視覚的なクライマックスを作り、白 CTA ボタンを際立たせる。上部のブラーグローで「光の先」感を演出。
**コンバージョン役割**: Action（最終） — 全情報を読んだ上での最終決断ポイント。「カード不要」「いつでも解約」でリスクゼロを再度強調。

---

## コピースタイルガイド

LP のコピーを書く・修正する際の共通ルール。

### トーンと姿勢

- **煽らない誠実さ**: 就活生の不安につけこまない。成果を約束しない
- **事実ベネフィット**: 「内定率 XX% 向上」「通過率アップ」は書かない（景表法 / 優良誤認回避）
- **具体数字優先**: 「多数のテンプレート」ではなく「8種の専用テンプレート」
- **ユーザー主語**: 「AIが添削します」ではなく「設問ごとに改善案を確認できます」

### 禁止事項

- 特定の競合サービス名を挙げない（信用毀損回避）
- 就活塾の具体的な金額（「月3〜10万円」）は根拠資料未確認のため「対面指導のため高額」に留める
- AI 検出率や内定率を主張しない
- AggregateRating や実績数値を裏付けなく使わない
- 「無制限」「完全無料」など誤解を招く表現を使わない（Free は月 50 クレジット制限あり）

### 訴求の裏付けルール

- LP で訴求する機能は `backend/app/routers/` と `docs/features/*.md` にある実装のみ
- 未実装の機能・将来計画を訴求しない

### 言語

- 本文は日本語
- 技術用語・数値・パス名は英語のまま保つ
- 「ガクチカ」「ES」「志望動機」など就活用語はそのまま使用（読者にとって自然）

---

## モバイル固有の挙動

| ブレークポイント | 変化 |
|---------------|------|
| < md（768px） | Feature 2カラム → 1カラム（テキスト上、スクリーンショット下） |
| < md | ComparisonSection テーブル → カードスタック（項目ごとに 3 サービスを縦並び） |
| < md | HeroSection 2カラム → 縦積み（テキスト上、スクリーンショット下） |
| < md | PricingSection 3カラム → 縦積み |
| < md | BeforeAfterSection 2カラム表 → 1行ごとにカード化（「これまで」→「就活Passで」の縦並び） |
| < md | StickyCTABar **表示**（画面下部に赤 CTA ボタンを固定） |
| >= md | StickyCTABar **非表示** |
| >= lg（1024px） | Feature セクション 2カラム復帰 |

---

## コンテンツ依存関係（SSOT データ → セクション）

| データファイル | SSOT 内容 | 使用セクション |
|--------------|----------|--------------|
| `src/lib/marketing/landing-content.ts` | `trustPoints`（信頼帯 4 要素） | TrustStripSection |
| `src/lib/marketing/landing-steps.ts` | `LANDING_STEPS`（3 ステップ） | HowItWorksSection |
| `src/lib/marketing/landing-faqs.ts` | `LANDING_PAGE_FAQS`（10 問） | FAQSection + FaqJsonLd |
| `src/lib/marketing/pricing-plans.ts` | `getMarketingPricingPlans`（3 プラン） | PricingSection |
| `src/components/landing/landing-media.ts` | `landingMedia`（4 スクリーンショット + ロゴ） | HeroSection / FeatureESSection / FeatureManagementSection / FeatureInterviewSection |
| `src/lib/marketing/*-faqs.ts`（4 ファイル） | 機能 LP 別 FAQ（各 6 問） | 機能 LP の FAQSection |

コピーテキスト変更時は、上記の SSOT ファイルを**先に**変更し、コンポーネント TSX のハードコードテキストと齟齬が生じないようにする。

---

## A/B テスト候補

将来的にテストを行う場合の候補一覧。実装優先度は決めていない。

| セクション | テスト対象 | バリアント案 | 仮説 |
|-----------|----------|------------|------|
| HeroSection | H1 コピー | A: 「就活を、AIと一緒に迷わず進める。」 / B: 「ES添削から面接対策まで、就活AIでまとめて対策。」 | 感情訴求 vs 機能訴求で CTR が変わるか |
| HeroSection | CTA ラベル | A: 「無料で試す」 / B: 「今すぐ始める」 | 「無料」の明示が CTR を上げるか |
| PainPointsSection | カード数 | A: 3 カード / B: 4 カード（「面接練習の相手がいない」追加） | 追加カードがスクロール深度に影響するか |
| PricingSection | デフォルト表示 | A: 月額表示 / B: 年額表示 | 年額表示で Standard/Pro の CVR が上がるか |
| FinalCTASection | CTA 色 | A: 白ボタン on ネイビー / B: 赤ボタン on ネイビー | ブランド CTA 色の方がクリックされるか |
| MidCTASection | 配置位置 | A: Feature 03 直後 / B: HowItWorks 直後 | 情報量が多い方が CTA 効果が高いか |

---

## 今後の拡張候補

| 施策 | 優先度 | 依存 |
|------|--------|------|
| ソーシャルプルーフ（ユーザー数、利用者の声） | P1 | ユーザーデータ蓄積 |
| 季節対応アナウンスバー | P2 | 就活シーズンに合わせたコピー |
| インタラクティブデモ | P3 | デモ環境構築 |
| AggregateRating JSON-LD | P3 | レビューデータ |
