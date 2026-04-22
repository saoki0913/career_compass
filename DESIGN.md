# 就活Pass マーケット LP デザインシステム（Stripe マーケ準拠）

> **スコープ**: 公開 LP（`src/components/landing/*`、関連 `(marketing)` ルート）の見た目・トーン・コンポーネント規約の**正本**。  
> **セクション構成・ファイル対応**: [docs/marketing/LP.md](docs/marketing/LP.md)。  
> **モデルサイト**: **Stripe（stripe.com のプロダクトマーケページ）** のレイアウト・タイポ階層・境界線・複層シャドウ・セクションリズムを参照。数値の補助として [awesome-design-md の Stripe DESIGN.md](https://github.com/VoltAgent/awesome-design-md) を参照してよい。  
> **採用しないもの**: Stripe のブランド紫（CTA 色）。**就活Pass の `#000666`（見出し・インク）と `#B7131A`（主 CTA）** を維持する。Stripe の Sohne フォントは使わず **Inter + Noto Sans JP**。

---

## 1. ビジュアルテーマ

- **印象**: 白基調、情報密度は高いが **余白で呼吸**、境界とタイポで **信頼・金融グレード**の SaaS マーケ。
- **トーン**: 煽りすぎない誠実さ（就活生向け）。コピーは成果ベネフィットと事実を並べる。
- **ヒーロー**: 大画面では **2 カラム**（左: コピーと CTA、右: プロダクトスクショ）。背景は **極淡のグラデ**（hex / rgba のみ）。
- **モーション**: 控えめな **スクロールイン**（`LandingSectionMotion`）。ヒーロー以外のセクションに限定してよい。

---

## 2. カラー（CSS 変数）

マーケパスでは **chromatic な Tailwind 色ユーティリティ禁止**（[src/lib/ui-guardrails.mjs](src/lib/ui-guardrails.mjs)）。**hex、`var(--lp-*)`、`text-white` とその透明度** を使う。

| トークン | 値 | 役割 |
|----------|-----|------|
| `--lp-navy` | `#000666` | 見出し・強調テキスト・フッター見出し |
| `--lp-cta` | `#b7131a` | 主 CTA 背景 |
| `--lp-cta-hover` | `#951119` | CTA ホバー |
| `--lp-surface-page` | `#f6f9fc` | Stripe 系の極淡ブルーグレー地（セクション交互） |
| `--lp-surface-section` | `#ffffff` | 標準白地 |
| `--lp-surface-muted` | `#f6f9fc` | カード内・帯の薄い面 |
| `--lp-border-default` | `#e5edf5` | Stripe 的な標準境界（表・カード・ヘッダー下線） |
| `--lp-border-hairline` | `rgba(0,0,0,0.08)` | 極細区切り |
| `--lp-border-tint` | `rgba(0,6,102,0.12)` | ネイビーティント境界 |
| `--lp-body-muted` | `#64748d` | 本文補足（slate-600 相当を hex で固定） |
| `--lp-badge-bg` | `#eef2ff` | ヒーローバッジ（淡いトーン） |
| `--lp-tint-navy-soft` | `#e8eef9` | 表ハイライト列・強調背景 |
| `--lp-tint-cta-soft` | `#fceaea` | ネガティブラベル背景 |
| `--lp-success` | `#168542` | チェック・アクセント |
| `--lp-on-dark-muted` / `--lp-on-dark-fine` | rgba 白 | ダーク CTA 帯の補足 |

---

## 3. タイポグラフィ（Inter + Noto Sans JP）

- **ヒーロー H1**: `text-4xl`〜`lg:text-[2.75rem]` 前後、字重 **600〜700**、`tracking-tight`、`line-height` 1.15〜1.2。
- **セクション H2**: `text-2xl`〜`md:text-3xl`、字重 **600〜700**。
- **アイブロー**（Feature 01 等）: `text-xs`〜`text-sm`、`uppercase`、`tracking-widest`、色は `--lp-cta`。
- **本文**: `text-base`〜`text-lg`、色 `var(--lp-body-muted)`、行間 1.65〜1.75。
- **ナビ・ボタン**: `text-sm`、字重 **500〜600**。

---

## 4. コンポーネント

### ボタン

- **プライマリ**: 背景 `var(--lp-cta)`、白文字、**角丸 6px**（`rounded-md`）、`px-6 py-3` 前後、ホバーは `opacity` または `--lp-cta-hover`。
- **セカンダリ / ゴースト**: 透明または白背景、`1px solid var(--lp-border-default)` または `var(--lp-border-tint)`、ホバーで `var(--lp-surface-muted)`。

### カード

- 白背景、`border: 1px solid var(--lp-border-default)`、`border-radius: 12px`（`rounded-xl`）、影は `var(--lp-shadow-card)`（控えめ複層）。

### スクショ

- `var(--lp-shadow-screenshot)`（`rgba(50,50,93,0.25)` 系の複層）＋ `1px solid var(--lp-border-default)`。

### 表（比較）

- 罫線・区切りは `--lp-border-default`。自社列ヘッダーは `--lp-tint-navy-soft` 背景 + 下線 `2px solid var(--lp-navy)`。

### ダーク CTA 帯

- 背景 `var(--lp-navy)`、上端 `inset` の極薄ハイライト可。

---

## 5. レイアウト

- コンテナ `max-w-7xl`、`px-6` / `md:px-8`。
- セクション縦 `py-20`〜`py-28`。
- Feature は `gap-16`〜`gap-20`、`lg:flex-row` で揃える。

---

## 6. ドキュメント記述上の注意

Tailwind のクラス名っぽい **省略記号を Markdown に書かない**（過去にビルド誤検出の原因になった）。例は **具体的な hex または既知トークン名** で示す。

---

## 7. エージェント向け（短い指示）

LP を変更するとき: [LP.md](docs/marketing/LP.md) と本ファイルに従う。色は `var(--lp-*)` と hex。マーケで `bg-blue-50` 等を使わない。変更後は `lint:ui:guardrails` と `build` を通す。
