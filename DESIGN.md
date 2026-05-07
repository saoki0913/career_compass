# 就活Pass マーケット LP デザインシステム（LP.png 準拠）

> **スコープ**: 公開 LP（`src/components/landing/*`、関連 `(marketing)` ルート）の見た目・トーン・コンポーネント規約の**正本**。  
> **セクション構成・ファイル対応**: [docs/marketing/LP.md](docs/marketing/LP.md)。  
> **モデル**: root LP は `/Users/saoki/work/design/shupass/` のリファレンスデザインを正本にする。白基調、淡いブルー装飾、青CTA、人物/端末/カード素材を活用する。
> **採用しないもの**: テキスト入り画像を主要コピーとして使う実装（PainPoints の worry-card 画像は例外で、sr-only テキストを併置して a11y を維持）。コピー、料金、FAQ、CTA は HTML で実装する。フォントは **Noto Sans JP**（Inter は使用しない）。

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
| `--lp-navy` | `#0b1e3a` | 見出し・強調テキスト・フッター見出し |
| `--lp-cta` | `#2680ff` | 主 CTA 背景・強調青 |
| `--lp-cta-hover` | `#1d6fe8` | CTA ホバー |
| `--lp-surface-page` | `#f6f9ff` | 極淡ブルー地（セクション交互） |
| `--lp-surface-section` | `#ffffff` | 標準白地 |
| `--lp-surface-muted` | `#f6f9fc` | カード内・帯の薄い面 |
| `--lp-surface-faq` | `#f0f4fb` | FAQ セクション背景 |
| `--lp-border-default` | `#e5e7eb` | 標準境界（表・カード・ヘッダー下線） |
| `--lp-border-hairline` | `rgba(0,0,0,0.08)` | 極細区切り |
| `--lp-border-tint` | `rgba(0,6,102,0.12)` | ネイビーティント境界 |
| `--lp-muted-text` | `#4b5563` | 本文補足 |
| `--lp-badge-bg` | `#eef2ff` | ヒーローバッジ（淡いトーン） |
| `--lp-tint-navy-soft` | `#e8eef9` | 表ハイライト列・強調背景 |
| `--lp-tint-cta-soft` | `#e8f1ff` | CTA ティント背景 |
| `--lp-success` | `#168542` | チェック・アクセント |
| `--lp-on-dark-muted` / `--lp-on-dark-fine` | rgba 白 | ダーク CTA 帯の補足 |

---

## 3. タイポグラフィ（Noto Sans JP）

- **フォント**: `'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`。全セクションで `fontFeatureSettings: '"palt"'` を指定する。
- **ヒーロー H1**: desktop では 56px、字重 **800**、`line-height` 1.3。
- **セクション H2**: desktop では `clamp(34px, 5.2vw, 46px)`、字重 **800**。
- **本文**: desktop では 16〜18px、色 `var(--lp-muted-text)`、行間 1.6〜1.95。
- **ボタン**: CTA は 18px、字重 **700**、角丸 12px。

---

## 4. コンポーネント

### ボタン

- **プライマリ**: グラデーション `linear-gradient(180deg, #3a91ff 0%, #1f78ec 100%)`、白文字、**角丸 12px**、`padding: 20px 28px 20px 36px`、矢印アイコン付き。ホバーで矢印が `translateX(4px)`。
- **セカンダリ / ゴースト**: 白背景、`2px solid #2680ff`、同寸法。ホバーで `#f0f6ff` 背景。

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

- Desktop 再現基準は `1672px` viewport。主要コンテナは `1200px`（shupass リファレンス準拠）。
- Hero: 2 カラムグリッド `minmax(420px,500px) minmax(0,1fr)`。
- PainPoints: 4 列グリッド、gap 22px、画像カード（worry-card-{1-4}.png）。
- Features: 6 列グリッド、各カード 2 列、3+3 配置。フロー図は 3 円（78x78px）。
- HowToUse: 7 列 `1fr 28px 1fr 28px 1fr 28px 1fr`、矢印列付き。
- BeforeAfter: 1200x600 固定ステージ + ResizeObserver スケーリング。
- Pricing: 3 列グリッド、Featured カードは `translateY(-12px)`。
- FAQ: 2 列 x 5 行アコーディオン（10 項目）。

---

## 6. ドキュメント記述上の注意

Tailwind のクラス名っぽい **省略記号を Markdown に書かない**（過去にビルド誤検出の原因になった）。例は **具体的な hex または既知トークン名** で示す。

---

## 7. エージェント向け（短い指示）

LP を変更するとき: [LP.md](docs/marketing/LP.md) と本ファイルに従う。色は `var(--lp-*)` と hex。マーケで `bg-blue-50` 等を使わない。変更後は `lint:ui:guardrails` と `test:ui:review -- /` を通す。
