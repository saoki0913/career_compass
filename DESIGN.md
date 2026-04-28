# 就活Pass マーケット LP デザインシステム（LP.png 準拠）

> **スコープ**: 公開 LP（`src/components/landing/*`、関連 `(marketing)` ルート）の見た目・トーン・コンポーネント規約の**正本**。  
> **セクション構成・ファイル対応**: [docs/marketing/LP.md](docs/marketing/LP.md)。  
> **モデル**: root LP は `public/marketing/LP/LP.png` を正本にする。白基調、淡いブルー装飾、青CTA、人物/端末/カード素材を活用する。
> **採用しないもの**: テキスト入り画像を主要コピーとして使う実装。コピー、料金、FAQ、CTA は HTML で実装する。フォントは **Inter + Noto Sans JP**。

---

## 1. ビジュアルテーマ

- **印象**: 白基調、淡いブルーの装飾、就活生向けの親しみと信頼感を両立する SaaS マーケ。
- **トーン**: 煽りすぎない誠実さ（就活生向け）。コピーは成果ベネフィットと事実を並べる。
- **ヒーロー**: 大画面では **2 カラム**（左: コピーと CTA、右: PC/スマホモック）。背景は **極淡のブルーグラデ**（hex / rgba のみ）。
- **モーション**: 控えめな **スクロールイン**（`LandingSectionMotion`）。ヒーロー以外のセクションに限定してよい。

---

## 2. カラー（CSS 変数）

マーケパスでは **chromatic な Tailwind 色ユーティリティ禁止**（[src/lib/ui-guardrails.mjs](src/lib/ui-guardrails.mjs)）。**hex、`var(--lp-*)`、`text-white` とその透明度** を使う。

| トークン | 値 | 役割 |
|----------|-----|------|
| `--lp-navy` | `#000666` | 見出し・強調テキスト・フッター見出し |
| `--lp-cta` | `#2563eb` | 主 CTA 背景・強調青 |
| `--lp-cta-hover` | `#1459d9` | CTA ホバー |
| `--lp-surface-page` | `#f6f9fc` | Stripe 系の極淡ブルーグレー地（セクション交互） |
| `--lp-surface-section` | `#ffffff` | 標準白地 |
| `--lp-surface-muted` | `#f6f9fc` | カード内・帯の薄い面 |
| `--lp-border-default` | `#e8edf5` | Stripe 的な標準境界（表・カード・ヘッダー下線） |
| `--lp-border-hairline` | `rgba(0,0,0,0.08)` | 極細区切り |
| `--lp-border-tint` | `rgba(0,6,102,0.12)` | ネイビーティント境界 |
| `--lp-muted-text` | `#64748b` | 本文補足（slate-500 相当を hex で固定） |
| `--lp-badge-bg` | `#eef2ff` | ヒーローバッジ（淡いトーン） |
| `--lp-tint-navy-soft` | `#e8eef9` | 表ハイライト列・強調背景 |
| `--lp-tint-cta-soft` | `#eef4ff` | CTA ティント背景 |
| `--lp-success` | `#168542` | チェック・アクセント |
| `--lp-on-dark-muted` / `--lp-on-dark-fine` | rgba 白 | ダーク CTA 帯の補足 |

---

## 3. タイポグラフィ（Inter + Noto Sans JP）

- **ヒーロー H1**: desktop では 72〜82px、字重 **800**、`line-height` 1.12 前後。
- **セクション H2**: desktop では 64〜78px、字重 **800**。`section_image` の見出し密度を優先する。
- **機能番号・ステップ番号**: 40px 以上で強く見せる。Feature 01 等は小さな eyebrow にしない。
- **本文**: desktop では 18〜24px、色 `var(--lp-muted-text)`、行間 1.6〜1.8。
- **ナビ・ボタン**: 参照 LP の CTA は高さ 74〜82px、字重 **800**。

---

## 4. コンポーネント

### ボタン

- **プライマリ**: 背景 `var(--lp-cta)`、白文字、**角丸 12px**（`rounded-xl`）、`px-6 py-3` 前後、ホバーは `opacity` または `--lp-cta-hover`。
- **セカンダリ / ゴースト**: 透明または白背景、`1px solid var(--lp-border-default)` または `var(--lp-border-tint)`、ホバーで `var(--lp-surface-muted)`。

### カード

- 白背景、`border: 1px solid var(--lp-border-default)`、`border-radius: 18px`〜`22px`、影は薄い青系の複層シャドウ。

### スクショ

- `var(--lp-shadow-screenshot)`（`rgba(50,50,93,0.25)` 系の複層）＋ `1px solid var(--lp-border-default)`。

### 表（比較）

- 罫線・区切りは `--lp-border-default`。自社列ヘッダーは `--lp-tint-navy-soft` 背景 + 下線 `2px solid var(--lp-navy)`。

### ダーク CTA 帯

- 背景 `var(--lp-navy)`、上端 `inset` の極薄ハイライト可。

---

## 5. レイアウト

- Desktop 再現基準は `1672px` viewport。主要コンテナは `1530px`〜`1600px`。
- Hero / Pain / Features / BeforeAfter / HowToUse / Pricing / FAQ は `900px`〜`960px` 高を目安にする。
- 主要カードの目安: Pain `360x565`、Feature `520x295`、Before/After `668px / 120px / 724px`、HowToUse `360px` x 4、Pricing `436px / 486px / 436px`、FAQ `2 columns x 3 rows`。

---

## 6. ドキュメント記述上の注意

Tailwind のクラス名っぽい **省略記号を Markdown に書かない**（過去にビルド誤検出の原因になった）。例は **具体的な hex または既知トークン名** で示す。

---

## 7. エージェント向け（短い指示）

LP を変更するとき: [LP.md](docs/marketing/LP.md) と本ファイルに従う。色は `var(--lp-*)` と hex。マーケで `bg-blue-50` 等を使わない。変更後は `lint:ui:guardrails` と `test:ui:review -- /` を通す。
