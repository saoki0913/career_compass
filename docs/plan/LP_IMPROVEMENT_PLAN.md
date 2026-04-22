---
topic: lp
plan_date: 2026-04-14
based_on_review: null
status: 未着手
implementation_level: 手順書レベル
---

# 就活Pass LP改善 実装ガイド

## 0. このドキュメントの読み方

- **対象読者**: ジュニアエンジニア（React / Tailwind CSS の基本経験あり）
- **前提知識**: Next.js App Router, Tailwind CSS, lucide-react アイコン
- **用語集**: 末尾「8. 用語集」を参照
- **関連ドキュメント**:
  - デザインシステム: `DESIGN.md`（CSS 変数、rounded-xl/2xl 制約）
  - UI ガイドライン: `docs/architecture/FRONTEND_UI_GUIDELINES.md`
  - LP ドキュメント: `docs/marketing/LP.md`
  - コンポーネント配置: `src/components/landing/`
  - データファイル: `src/lib/marketing/landing-content.ts`, `landing-faqs.ts`

### コピーのトーンルール（全タスク共通）

- 使ってよい表現: 「設問タイプ別に添削」「企業データを活用」「月0円から」「カード登録不要」
- **使ってはいけない表現**: 「通るESに仕上げる」「高品質」「プロレベル」「大幅に低コスト」「就活塾の1/30」
- 理由: 利用実績がない段階で成果を保証する表現は誇張に見える

---

## 1. 背景と目的

### なぜ必要か

就活Passには8つの技術的差別化要素が実装済みだが、LPで訴求されていない:

| 機能 | 実装ファイル | LPでの掲載 |
|------|-----------|:---:|
| 設問タイプ別の8種テンプレート | `backend/app/prompts/es_templates.py` | **未掲載** |
| AI臭検出・修正 | `backend/app/routers/es_review_validation.py` | **未掲載** |
| 企業データに基づくフィードバック | `backend/app/utils/vector_store.py` | **未掲載** |
| 6要素フレームワーク | `backend/app/prompts/motivation_prompts.py` | **未掲載** |
| 企業固有性チェック | `backend/app/routers/motivation_context.py` | **未掲載** |
| STAR構造 + 因果関係チェック | `backend/app/prompts/gakuchika_prompts.py` | **未掲載** |

### 完了後の期待状態

- Hero が差別化要素を伝えている
- 信頼帯が品質の仕組みを訴求している
- Feature セクションが技術的優位性を示している
- 中間 CTA で離脱を防いでいる
- 比較表が品質面の差別化を含んでいる
- Lighthouse Performance >= 90 を維持

### スコープ外

- `/login` ページのゲスト導線強化（別タスク）
- ソーシャルプルーフセクション（利用実績蓄積後）
- A/Bテスト基盤構築

---

## 2. 事前準備チェックリスト

- [ ] ブランチ作成: `feature/lp-improvement-p0`（Phase ごとに別ブランチ推奨）
- [ ] `npm run build` が PASS すること
- [ ] `npm run test:unit` が PASS すること
- [ ] UI ベースライン取得: `npm run ui:preflight -- / --surface=marketing --auth=none`
- [ ] `docs/marketing/LP.md:112` の「HowItWorks 削除済み」の誤記を修正（`page.tsx:11` で import 使用中）

---

## 3. タスク一覧

| Phase | ID | タスク名 | 対象ファイル | 推定工数 | 依存 | blast radius |
|-------|-----|---------|-------------|---------|------|-------------|
| P0 | LP-01 | Hero コピー更新 | `HeroSection.tsx` | 30min | なし | 低 |
| P0 | LP-02 | TrustStrip データ+ラベル更新 | `landing-content.ts`, `TrustStripSection.tsx` | 15min | なし | 低 |
| P0 | LP-03 | CTA 統一 ("無料で試す") | `FinalCTASection.tsx`, `StickyCTABar.tsx` | 15min | なし | 低 |
| P1 | LP-04 | FeatureES チェックポイント書換え | `FeatureESSection.tsx` | 45min | なし | 低 |
| P1 | LP-05 | FeatureInterview チェックポイント書換え | `FeatureInterviewSection.tsx` | 45min | なし | 低 |
| P1 | LP-06 | MidCTASection 新規作成 | 新規 + `page.tsx` | 1h | なし | 低 |
| P2 | LP-07 | QualitySection 新規作成 | 新規 + `page.tsx` | 1.5h | なし | 低 |
| P2 | LP-08 | Comparison 3行追加 + 料金修正 | `ComparisonSection.tsx` | 30min | なし | 低 |
| P2 | LP-09 | HowItWorks ステップ順序変更 | `HowItWorksSection.tsx` | 20min | なし | 低 |
| P2 | LP-10 | PainPoints ソリューションヒント追加 | `PainPointsSection.tsx` | 20min | なし | 低 |
| P2 | LP-11 | Pricing ラベル + FAQ 3問追加 | `PricingSection.tsx`, `landing-faqs.ts` | 30min | なし | 低 |

---

## 4. 各タスクの詳細手順

### Task LP-01: Hero コピー更新

#### 4.01.1 目的

Hero セクションのコピーを差別化要素が伝わる内容に更新する。

#### 4.01.2 対象ファイル

| ファイル | 操作 | 概要 |
|---------|------|------|
| `src/components/landing/HeroSection.tsx` | 変更 | eyebrow, H1, サブテキスト, CTA, バッジ |

#### 4.01.3 手順

**Step 1: UI プリフライト実行**
```bash
npm run ui:preflight -- / --surface=marketing --auth=none
```
出力を保存しておく（変更後との比較用）。

**Step 2: アイブロー（eyebrow）を変更**
- ファイル: `HeroSection.tsx` L23-26
- 現在: 「AI就活エージェント「就活Pass」」
- **変更後**: 「ES添削から企業管理まで、就活をAIで一括サポート」
- 理由: eyebrow の役割は「何ができるサービスか」を0.5秒で伝えること。機能範囲を短く示す

**Step 3: 見出し H1 を変更**
- ファイル: `HeroSection.tsx` L29-36
- 現在: 「就活を、AIと一緒に / 迷わず進める。」
- **変更後**: 「就活を、AIと一緒に / 迷わず進める。」（**現状維持**）
- 理由: 競合分析の結果、H1 は感情ベネフィットを短く打つのが主流。具体的スペックは Feature セクションで深掘りする

**Step 4: サブテキストを変更**
- ファイル: `HeroSection.tsx` L38-43
- 現在: 「ES添削、志望動機、ガクチカ、面接対策、締切管理。バラバラだった準備をひとつのアプリにまとめ、AIと一緒に前に進めます。」
- **変更後**: 「志望動機・自己PR・ガクチカ。設問タイプ別のAI添削と、企業データを活用したフィードバック。カード登録なしで、今すぐ試せます。」
- 理由: 機能訴求（8種テンプレ・企業データ活用）と行動障壁除去（カード不要）のハイブリッド

**Step 5: 主 CTA を変更**
- ファイル: `HeroSection.tsx` L46-53
- 現在: 「今すぐ無料で体験する」
- **変更後**: 「無料で試す」

**Step 6: Hero 下バッジを変更**
- ファイル: `HeroSection.tsx` L63-73
- 現在: `["Stripeで安心決済", "成功時のみクレジット消費", "すぐにスタート"]`
- **変更後**: `["カード登録不要", "成功時のみクレジット消費", "設問タイプ別に添削"]`

**Step 7: UI ガードレール + テスト**
```bash
npm run lint:ui:guardrails
npm run test:ui:review -- /
```

#### 4.01.4 受入基準

- [ ] AC-1: eyebrow テキストが「ES添削から企業管理まで、就活をAIで一括サポート」である
- [ ] AC-2: 主 CTA テキストが「無料で試す」である
- [ ] AC-3: バッジ配列に「カード登録不要」「成功時のみクレジット消費」「設問タイプ別に添削」の 3 要素がある
- [ ] AC-4: `npm run lint:ui:guardrails` が PASS
- [ ] AC-5: `npm run build` がエラー 0

#### 4.01.5 テスト仕様

| テスト種別 | コマンド / 手順 | 期待結果 |
|-----------|----------------|---------|
| ガードレール | `npm run lint:ui:guardrails` | PASS |
| ビルド | `npm run build` | エラー 0 |
| ユニット | `npm run test:unit` | PASS |
| 目視 (PC) | ブラウザで `/` を開き Hero を確認 | コピーが正しい |
| 目視 (モバイル) | DevTools でモバイル幅に設定 | レイアウト崩れなし |

#### 4.01.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|--------|-------|---------|------|
| コピーが長すぎて2行になる | 低 | 中 | eyebrow は max-width 内で折り返し確認 |
| バッジ 3 要素が横並びで収まらない | 低 | 低 | 既存のレスポンシブ対応で sm 以下は縦並び |

#### 4.01.7 ロールバック手順

```bash
git checkout -- src/components/landing/HeroSection.tsx
```

---

### Task LP-02: TrustStrip データ + ラベル更新

#### 4.02.1 目的

信頼帯を決済寄りの内容から品質・低摩擦の訴求に切り替える。

#### 4.02.2 対象ファイル

| ファイル | 操作 | 概要 |
|---------|------|------|
| `src/lib/marketing/landing-content.ts` | 変更 | `trustPoints` 配列を差し替え |
| `src/components/landing/TrustStripSection.tsx` | 変更 | ラベルテキスト変更 |

#### 4.02.3 手順

**Step 1: `landing-content.ts` の trustPoints 配列を差し替え**
- ファイル: `src/lib/marketing/landing-content.ts` L4-8
- 現在: `["Stripe決済で安心", "成功時のみクレジット消費", "Googleカレンダー連携"]`
- **変更後**: `["設問タイプ別の専用AI添削", "成功した時だけクレジット消費", "企業データを活用したフィードバック", "カード登録不要・すぐに試せる"]`

**Step 2: `TrustStripSection.tsx` のラベルを変更**
- ファイル: `src/components/landing/TrustStripSection.tsx` L9
- 現在: 「運営・決済まわりの信頼性」
- **変更後**: 「就活Passの特長」

**Step 3: 4 要素に増えるため、レイアウトを確認**
- 3→4 要素に増える。既存の flexbox + `sm:divide-x` が 4 要素で崩れないか目視確認
- 崩れる場合は `gap-4` に調整

#### 4.02.4 受入基準

- [ ] AC-1: trustPoints 配列に 4 要素がある
- [ ] AC-2: ラベルが「就活Passの特長」である
- [ ] AC-3: PC/モバイルでレイアウト崩れがない

#### 4.02.5 テスト仕様

| テスト種別 | コマンド / 手順 | 期待結果 |
|-----------|----------------|---------|
| ビルド | `npm run build` | エラー 0 |
| 目視 (PC) | `/` の TrustStrip セクション | 4 要素が横並び |
| 目視 (モバイル) | 同上 | 縦並びまたはラップ |

#### 4.02.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|--------|-------|---------|------|
| 4 要素で横幅が溢れる | 低 | 中 | flex-wrap でラップ対応 |

#### 4.02.7 ロールバック手順

```bash
git checkout -- src/lib/marketing/landing-content.ts src/components/landing/TrustStripSection.tsx
```

---

### Task LP-03: CTA 統一 ("無料で試す")

#### 4.03.1 目的

LP 全体の CTA テキストを「無料で試す」に統一する。

#### 4.03.2 対象ファイル

| ファイル | 操作 | 概要 |
|---------|------|------|
| `src/components/landing/FinalCTASection.tsx` | 変更 | CTA + サブコピー |
| `src/components/landing/StickyCTABar.tsx` | 変更 | CTA テキスト |

#### 4.03.3 手順

**Step 1: FinalCTASection のサブコピーを変更**
- ファイル: `FinalCTASection.tsx` L24
- 現在: 「今なら会員登録で、ES対策チェックリストをプレゼント中。」
- **変更後**: 「ESを貼り付けるだけで、AIが改善案を提示します。」

**Step 2: FinalCTASection の CTA テキストを変更**
- ファイル: `FinalCTASection.tsx` L30
- 現在: 「無料で今すぐ始める」
- **変更後**: 「無料で試す」

**Step 3: StickyCTABar の CTA テキストを変更**
- ファイル: `StickyCTABar.tsx` L25
- 現在: 「無料で始める」
- **変更後**: 「無料で試す」

#### 4.03.4 受入基準

- [ ] AC-1: FinalCTA のサブコピーが「ESを貼り付けるだけで、AIが改善案を提示します。」
- [ ] AC-2: FinalCTA のボタンが「無料で試す」
- [ ] AC-3: StickyCTABar のボタンが「無料で試す」
- [ ] AC-4: 全 CTA が `/login` に遷移する（変更しないこと）

#### 4.03.5 テスト仕様

| テスト種別 | コマンド / 手順 | 期待結果 |
|-----------|----------------|---------|
| ビルド | `npm run build` | エラー 0 |
| 目視 | ページ最下部の FinalCTA を確認 | テキスト一致 |
| 目視 | スクロール 600px 以降の StickyCTABar を確認 | テキスト一致 |
| E2E | CTA クリック → `/login` に遷移 | 遷移成功 |

#### 4.03.6 リスク評価

リスクなし（テキスト変更のみ）。

#### 4.03.7 ロールバック手順

```bash
git checkout -- src/components/landing/FinalCTASection.tsx src/components/landing/StickyCTABar.tsx
```

---

### Task LP-04: FeatureES チェックポイント書換え

#### 4.04.1 目的

ES 添削の Feature セクションに技術的差別化（8種テンプレ、AI臭検出、文字数対応）を反映する。

#### 4.04.2 対象ファイル

| ファイル | 操作 | 概要 |
|---------|------|------|
| `src/components/landing/FeatureESSection.tsx` | 変更 | チェックポイント差替 + Before/After 例追加 |

#### 4.04.3 手順

**Step 1: チェックポイントの差し替え**
- ファイル: `FeatureESSection.tsx` L42-46
- 現在の 3 項目を以下に差し替え:
  1. 「志望動機・自己PR・ガクチカ等 8種の設問テンプレートで添削」
  2. 「AI生成特有の不自然な表現を検出し、修正案を提示」
  3. 「指定文字数に合わせた構成を提案」

**Step 2: Before/After 添削例カードを追加**
- チェックポイントの下に、小さなカード (`rounded-xl border border-slate-100 bg-white p-6`) で添削例を追加:
  ```
  Before:
  「大学時代にサークルのリーダーとして
   さまざまな課題に取り組みました。
   この経験を活かし、御社で活躍したいです。」

  ↓ AI添削

  After:
  「50名のテニスサークルで代表を務め、
   退会率30%の課題に月1回の個別面談を導入。
   半年で退会率を12%に改善しました。」

  → 具体性を上げ、AI特有の定型表現を除去
  ```
- デザインシステム準拠: `rounded-xl`, `border-slate-100`, `text-[var(--lp-navy)]`

#### 4.04.4 受入基準

- [ ] AC-1: チェックポイント 3 項目が差し替えられている
- [ ] AC-2: Before/After カードが表示される
- [ ] AC-3: カードが `rounded-xl border-slate-100` を使用している
- [ ] AC-4: `npm run lint:ui:guardrails` が PASS

#### 4.04.5 テスト仕様

| テスト種別 | コマンド / 手順 | 期待結果 |
|-----------|----------------|---------|
| ガードレール | `npm run lint:ui:guardrails` | PASS |
| ビルド | `npm run build` | エラー 0 |
| 目視 (PC) | Feature ES セクションを確認 | 新チェックポイント + Before/After カード |
| 目視 (モバイル) | 同上 | レイアウト崩れなし |

#### 4.04.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|--------|-------|---------|------|
| Before/After カードでセクション高さが増大 | 低 | 中 | コンパクトな padding (p-4) で調整 |

#### 4.04.7 ロールバック手順

```bash
git checkout -- src/components/landing/FeatureESSection.tsx
```

---

### Task LP-05: FeatureInterview チェックポイント書換え

#### 4.05.1 目的

志望動機の Feature セクションに 6要素フレームワークと企業固有性チェックを反映する。

#### 4.05.2 対象ファイル

| ファイル | 操作 | 概要 |
|---------|------|------|
| `src/components/landing/FeatureInterviewSection.tsx` | 変更 | チェックポイント差替 + 6要素表示追加 |

#### 4.05.3 手順

**Step 1: チェックポイントの差し替え**
- ファイル: `FeatureInterviewSection.tsx` L25-29
- 現在の 3 項目を以下に差し替え:
  1. 「業界理由・企業理由・自分との接点など6軸で整理」
  2. 「企業の事業内容に基づいた対話で固有の志望動機を構築」
  3. 「『他社でも通じる理由』を検出して警告」

**Step 2: 6要素の軽量可視化を追加**
- チェックポイントの上 or 下に、テキストベースのステップ表示を追加:
  ```
  業界理由 → 企業理由 → 自分との接点 → やりたい仕事 → 貢献方向 → 差別化
  ```
- 実装: flexbox + gap + thin separator (`→` or `border-r`)
- **カード化やアイコン列は使わない**（UI ガイドライン準拠: Reduce clutter）

#### 4.05.4 受入基準

- [ ] AC-1: チェックポイント 3 項目が差し替えられている
- [ ] AC-2: 6 要素のテキスト表示が存在する
- [ ] AC-3: `npm run lint:ui:guardrails` が PASS

#### 4.05.5〜4.05.7 テスト・リスク・ロールバック

LP-04 と同パターン。ロールバック: `git checkout -- src/components/landing/FeatureInterviewSection.tsx`

---

### Task LP-06: MidCTASection 新規作成

#### 4.06.1 目的

Feature 群の直後に中間 CTA を配置し、興味を持ったユーザーの離脱を防ぐ。

#### 4.06.2 対象ファイル

| ファイル | 操作 | 概要 |
|---------|------|------|
| `src/components/landing/MidCTASection.tsx` | **新規** | 中間 CTA コンポーネント |
| `src/app/(marketing)/page.tsx` | 変更 | import + JSX 挿入 |
| `src/app/(marketing)/page.test.ts` | 変更 | MidCTASection のアサーション追加 |

#### 4.06.3 手順

**Step 1: 新規ファイル作成**
- パス: `src/components/landing/MidCTASection.tsx`
- コンテンツ:
  - コピー: 「まずは無料で試してみる」
  - サブ: 「カード登録不要。ESを貼り付けるだけで始められます。」
  - CTA ボタン: 「無料で試す」→ `/login`
- デザイン仕様:
  - 背景: `bg-[var(--lp-tint-navy-soft)]`
  - 余白: `px-6 py-16 md:py-20`
  - テキスト: 中央揃え、`max-w-[600px] mx-auto`
  - CTA ボタン: Hero 主 CTA と同じスタイル (`rounded-xl`, `bg-[var(--lp-cta)]`, `text-white`)
- export: `export function MidCTASection()`

**Step 2: page.tsx に追加**
- ファイル: `src/app/(marketing)/page.tsx`
- import: `import { MidCTASection } from "@/components/landing/MidCTASection";`
- 配置: `<FeatureInterviewSection />` の直後、`<HowItWorksSection />` の前
- `<LandingSectionMotion>` でラップする（他セクションと同様）

**Step 3: page.test.ts を更新**
- `MidCTASection` が `page.tsx` のソースに含まれることをアサーション追加

#### 4.06.4 受入基準

- [ ] AC-1: `MidCTASection.tsx` が存在し、`MidCTASection` をエクスポートしている
- [ ] AC-2: `page.tsx` で `FeatureInterviewSection` の後に配置されている
- [ ] AC-3: CTA ボタンが `/login` に遷移する
- [ ] AC-4: `npm run test:unit` が PASS（page.test.ts 含む）

#### 4.06.5〜4.06.7 テスト・リスク・ロールバック

ロールバック: ファイル削除 + `git checkout -- src/app/(marketing)/page.tsx src/app/(marketing)/page.test.ts`

---

### Task LP-07: QualitySection 新規作成

#### 4.07.1 目的

利用実績がない段階で「品質を上げるための仕組み」を見せることで信頼を構築する。

#### 4.07.2 対象ファイル

| ファイル | 操作 | 概要 |
|---------|------|------|
| `src/components/landing/QualitySection.tsx` | **新規** | 技術的信頼セクション |
| `src/app/(marketing)/page.tsx` | 変更 | import + JSX 挿入 |
| `src/app/(marketing)/page.test.ts` | 変更 | QualitySection のアサーション追加 |

#### 4.07.3 手順

**Step 1: 新規ファイル作成**
- パス: `src/components/landing/QualitySection.tsx`
- 見出し: 「AIの仕組みで、添削の精度を上げる」
- 4 ポイント:
  1. 「設問タイプを理解する」— 志望動機・自己PR・ガクチカ等、設問ごとに専用テンプレートで改善案を出します
  2. 「企業データを踏まえる」— 企業の事業内容や求める人物像を自動取得し、その企業に合った表現を提案します
  3. 「AIっぽさを検出する」— AI生成特有の定型表現を自動検出し、修正案を提示します
  4. 「成功した時だけ消費」— AI処理が成功した時だけクレジットを消費。失敗時はゼロです
- デザイン: 2x2 グリッド (`grid grid-cols-1 gap-5 md:grid-cols-2`), 各ポイントに lucide-react アイコン
- 背景: `bg-white`
- アイコン候補: `FileSearch`, `Building2`, `Shield`, `Coins` (lucide-react)

**Step 2: page.tsx に追加**
- 配置: `<HowItWorksSection />` の後、`<ComparisonSection />` の前

**Step 3: page.test.ts を更新**

#### 4.07.4 受入基準

- [ ] AC-1: QualitySection に 4 ポイントが表示される
- [ ] AC-2: 2x2 グリッド（PC）/ 1カラム（モバイル）のレスポンシブ対応
- [ ] AC-3: `npm run lint:ui:guardrails` が PASS
- [ ] AC-4: `npm run test:unit` が PASS

#### 4.07.5〜4.07.7 テスト・リスク・ロールバック

LP-06 と同パターン。

---

### Task LP-08: Comparison 3行追加 + 料金修正

#### 4.08.1 目的

比較表に品質面の差別化行を追加し、就活塾の料金表記を「総額相場」に修正する。

#### 4.08.2 対象ファイル

| ファイル | 操作 | 概要 |
|---------|------|------|
| `src/components/landing/ComparisonSection.tsx` | 変更 | rows 配列に 3 行追加 + 料金修正 |

#### 4.08.3 手順

**Step 1: 3 行を追加**
- ファイル: `ComparisonSection.tsx` の `rows` 配列
- 挿入位置: 「ES添削」行の直後
- 追加行:
  1. 「設問タイプ別添削」: 就活Pass=「8種の専用テンプレート」(good), 汎用AI=「汎用的な回答」(bad), 就活塾=「講師の判断による」(neutral)
  2. 「AI臭対策」: 就活Pass=「不自然な表現を自動検出」(good), 汎用AI=「対策なし」(bad), 就活塾=「講師が確認」(neutral)
  3. 「企業データ活用」: 就活Pass=「企業情報を自動取得・反映」(good), 汎用AI=「ユーザーが入力」(bad), 就活塾=「講師の知見による」(neutral)

**Step 2: 料金行を修正**
- 就活塾列: 「3万〜10万円以上」→「総額15〜40万円が相場」

#### 4.08.4 受入基準

- [ ] AC-1: 比較表に 10 行（既存7 + 追加3）がある
- [ ] AC-2: 就活塾料金が「総額15〜40万円が相場」になっている
- [ ] AC-3: テーブルがモバイルで横スクロールまたはレスポンシブ対応

#### 4.08.5〜4.08.7 テスト・リスク・ロールバック

ロールバック: `git checkout -- src/components/landing/ComparisonSection.tsx`

---

### Task LP-09: HowItWorks ステップ順序変更

#### 4.09.3 手順

**Step 1: steps 配列を差し替え**
- ファイル: `HowItWorksSection.tsx` L4-23
- 変更後:
  1. 「ESを貼り付ける」(FileText) — 「下書きやメモを貼り付けて、設問タイプを選ぶだけ。」
  2. 「AIが改善案を提示」(Sparkles) — 「設問に合わせた添削結果をすぐに確認できます。」
  3. 「気に入ったら保存・継続」(UserPlus) — 「Googleアカウントで保存すれば、企業管理やカレンダー連携も。」
- **注意**: `Sparkles` アイコンを lucide-react から import する必要あり

#### 4.09.4 受入基準

- [ ] AC-1: Step 1 が「ESを貼り付ける」で始まる（登録ではなくアクション起点）
- [ ] AC-2: `Sparkles` が正しく import されている

#### 4.09.7 ロールバック

`git checkout -- src/components/landing/HowItWorksSection.tsx`

---

### Task LP-10: PainPoints ソリューションヒント追加

#### 4.10.3 手順

**Step 1: painPoints 配列の description を差し替え**
- ファイル: `PainPointsSection.tsx`
- 変更後:
  1. 「ESが書けない」→ 「何をアピールすればいいか分からない。→ 設問タイプ別のAI添削で、具体的な改善案を提示します。」
  2. 「志望動機が浮かばない」（title も変更）→ 「企業のどこが良いか言語化できない。→ 企業データに基づく対話で、固有の志望動機を整理します。」
  3. 「締切を忘れそう」（title も変更）→ 「複数社の選考が重なって管理しきれない。→ 選考日程の自動管理とカレンダー連携で漏れを防ぎます。」

#### 4.10.4 受入基準

- [ ] AC-1: 各 PainPoint に「→」で始まるソリューションヒントが含まれる

#### 4.10.7 ロールバック

`git checkout -- src/components/landing/PainPointsSection.tsx`

---

### Task LP-11: Pricing ラベル + FAQ 3問追加

#### 4.11.3 手順

**Step 1: PricingSection にプランサブタイトルを追加**
- ファイル: `PricingSection.tsx`
- 各プランの見出し下に:
  - Free: 「まず試したい方」
  - Standard: 「本格的に就活対策したい方」
  - Pro: 「複数企業を並行で対策したい方」
- Free プランに「カード登録不要」バッジ追加
- セクション下部に `/pricing` へのリンク追加

**Step 2: landing-faqs.ts に 3 問追加**
- ファイル: `src/lib/marketing/landing-faqs.ts`
- 既存 6 問の後に追加:
  1. 「ChatGPTで直接添削するのと何が違いますか？」— 設問タイプ別テンプレート、企業情報照合、AI臭検出を説明
  2. 「企業ごとにカスタマイズされますか？」— 企業データ自動取得、企業固有性チェックを説明
  3. 「無料プランだけでどこまでできますか？」— 月50クレジット、約8回ES添削、カード不要を説明

**Step 3: JSON-LD の確認**
- `layout.tsx` の FAQ schema が動的に生成されている場合、9 問が含まれることを確認

#### 4.11.4 受入基準

- [ ] AC-1: FAQ に 9 問が表示される（既存6 + 新規3）
- [ ] AC-2: 各プランにサブタイトルが表示される
- [ ] AC-3: JSON-LD FAQPage に 9 問が含まれる

#### 4.11.7 ロールバック

```bash
git checkout -- src/components/landing/PricingSection.tsx src/lib/marketing/landing-faqs.ts
```

---

## 5. 実行順序と依存関係図

```
Phase 0 (1 PR):
  LP-01 (Hero) → LP-02 (TrustStrip) → LP-03 (CTA統一)
  ※ 順序は推奨。並行実施可

Phase 1 (1 PR):
  LP-04 (FeatureES) → LP-05 (FeatureInterview) → LP-06 (MidCTA新設)
  ※ LP-06 は page.tsx 変更を含むため最後に

Phase 2 (1 PR):
  LP-09 (HowItWorks) → LP-10 (PainPoints) → LP-07 (Quality新設)
  → LP-08 (Comparison) → LP-11 (Pricing+FAQ)
  ※ LP-07 は page.tsx 変更を含む

各 Phase は独立。P0 → P1 → P2 の順序推奨だが必須ではない。
```

---

## 6. 全体の完了条件

- [ ] 全 11 タスクの受入基準が満たされている
- [ ] `npm run build` が PASS
- [ ] `npm run test:unit` が PASS
- [ ] `npm run lint:ui:guardrails` が PASS
- [ ] `npm run test:ui:review -- /` で視覚的な問題がない
- [ ] Lighthouse Performance >= 90
- [ ] 全 CTA が `/login` に遷移する
- [ ] JSON-LD FAQPage に 9 問が含まれる
- [ ] `docs/marketing/LP.md` を改善後の状態に同期
- [ ] コードレビュー完了

---

## 7. 全体リスク評価とロールバック戦略

### リスク総評

全タスクがコンテンツ/UI 変更のみ。DB マイグレーションなし。バックエンド変更なし。blast radius は LP のみ。

### ロールバック戦略

- **Phase 単位**: 各 Phase は独立 PR のため、`git revert` で Phase 単位で取り消し可能
- **タスク単位**: 各コンポーネントファイルは独立のため、個別に `git checkout` 可能
- **新規セクション**: MidCTASection / QualitySection は `page.tsx` から import 行を削除するだけで無効化

### Lighthouse Performance リスク

- 新規セクション 2 つ追加でページサイズが増加する
- 対策: 画像は追加しない（テキストのみ）。framer-motion の `LandingSectionMotion` で lazy loading
- 基準: Lighthouse Performance >= 90 を各 Phase 完了時に確認

---

## 8. 用語集

| 用語 | 意味 |
|------|------|
| **LP** | Landing Page。ユーザーが最初に見るページ。就活Passでは `/` |
| **CTA** | Call To Action。「無料で試す」等のアクションボタン |
| **Hero** | ページ最上部のメインビジュアル+コピーのセクション |
| **信頼帯（TrustStrip）** | ヒーロー直下の、信頼要素を並べた帯セクション |
| **RAG** | Retrieval-Augmented Generation。企業データをAIの回答に組み込む仕組み |
| **AI臭** | AI生成特有の不自然な表現（「多角的な視点」「包括的な理解」等） |
| **設問テンプレート** | 志望動機/自己PR/ガクチカ等、設問タイプごとの専用プロンプト |
| **6要素フレームワーク** | 志望動機を6軸で整理する仕組み（業界理由・企業理由・自分との接点・やりたい仕事・貢献方向・差別化） |
| **eyebrow** | H1 の上に配置される小さなテキスト。カテゴリ認識を助ける |
| **blast radius** | 変更が影響する範囲 |
