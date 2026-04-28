# 就活Pass LP アセットインベントリ

> **目的**: `public/marketing/LP/assets/**` を root LP 実装素材の正本として管理する。
> **最終更新**: 2026-04-27

`public/marketing/LP/LP.png` と `public/marketing/LP/section_image/**` は完成見本として現位置に残す。本番DOMでは描画せず、下記の用途別カテゴリにある透過PNGを組み合わせて再現する。

## 正本フォルダ

| フォルダ | 点数 | 主用途 | 主な利用箇所 |
|---|---:|---|---|
| `branding/` | 4 | ロゴ、cityscape | Hero / Footer |
| `characters/` | 27 | 人物キャラクター | Pain / BeforeAfter / HowToUse / FAQ |
| `decorative/` | 19 | dot, sparkle, wave, connector | 全セクション背景・接続線 |
| `icons-circled/` | 19 | 円形塗りアイコン | Hero / Features / Pricing / HowToUse |
| `icons-line/` | 14 | 線画アイコン | Pain / BeforeAfter |
| `mockups/` | 5 | PC/iPhone モック | Hero / BeforeAfter / Remotion |
| `ui-cards/` | 17 | アプリUIカード | Features |
| `ui-cards-detail/` | 4 | 詳細画面UI | SEO LP補助 |
| `numbers/` | 4 | ステップ番号 | HowToUse |
| `step-cards/` | 4 | ステップ別UIカード | HowToUse |
| `flow/` | 1 | 作成・対策・管理フロー | Remotion |
| `pain-cards/` | 1 | Pain訴求補助 | Remotion |
| `pricing_assets_transparent/` | 20 | Pricing専用装飾 | Pricing |
| `faq_generated_assets_transparent/` | 19 | FAQ専用装飾 | FAQ |
| `shukatsu_pass_transparent_assets/` | 19 | Footer人物・補助素材 | Footer |

正本側は画像177点。`.DS_Store`、manifest、検証メタデータは正本側に置かない。

## 退避済み

`public/marketing/LP/assets/_archive/` は削除前の安全退避先。復元が必要な場合のみ参照する。

| フォルダ | 点数 | 内容 |
|---|---:|---|
| `_archive/generated/` | 176 | 生成元別フォルダを用途別正本へ採用後に退避 |
| `_archive/duplicates/` | 62 | 同一ハッシュ重複。正本側には重複なし |
| `_archive/text-images/` | 17 | 見出し、ラベル、feature pill などHTML化すべきテキスト入り画像 |
| `_archive/unused-ui/` | 6 | root LP実装で未参照のUI部品候補 |
| `_archive/metadata/` | 6 | `.DS_Store`、manifest、AI検証メタデータ |

## 採用・補完した素材

欠落していた実装参照は、既存の透過PNGから同名の正本ファイルとして補完した。

| 正本ファイル | 元素材 | 用途 |
|---|---|---|
| `branding/compass-icon-navy.png` | `shukatsu_pass_transparent_assets/01_logo_icon_nautical_compass_grid.png` | Hero / Footer ロゴアイコン |
| `decorative/blue-circle-lg.png` | `generated_transparent_assets/soft_blue_circle_on_transparent_background_transparent.png` | Hero背景 |
| `decorative/star-sparkle-1.png` | `generated_assets_transparent/blue_sparkle_icon_on_checkerboard_background_transparent.png` | Footer装飾 |
| `decorative/dot-pattern-light.png` | `faq_generated_assets_transparent/15_dotted_grid_decoration.png` | Pain / Features / FAQ背景 |
| `decorative/dot-grid-5x5.png` | `transparent_assets/26_minimal_blue_dot_grid_on_transparency_transparent.png` | Features背景 |
| `pain-cards/pain-es-barabara.png` | `job_hunting_assets_transparent_png/28_struggling_with_writing_es_ideas_transparent.png` | Remotion Pain補助 |
| `decorative/connector-arrow-1-to-2.png` | `generated_assets_transparent/06_connector_arrow_1_to_2.png` | HowToUse接続線 |
| `decorative/connector-arrow-2-to-3.png` | `generated_assets_transparent/11_connector_arrow_2_to_3.png` | HowToUse接続線 |
| `decorative/connector-arrow-3-to-4.png` | `generated_assets_transparent/17_connector_arrow_3_to_4.png` | HowToUse接続線 |

元素材が正本側に重複して残る場合は `_archive/duplicates/` へ退避済み。

## 運用ルール

- 人物、アイコン、装飾は透過PNGを必須にする。
- UIカード、端末モック、料金カードは白いカード面を持つ画像を許容する。
- 見出し、CTA、料金、FAQ本文など主要コピーは画像化せずHTMLで実装する。
- 画像参照の共通ベースは `src/lib/marketing/lp-assets.ts` の `LP_ASSET_BASE` / `lpAsset()` を使う。
- 新規素材を追加する場合は用途別カテゴリに置き、生成元フォルダ名を正本にしない。

## 検証

整理後に確認すること:

- 実装参照と実ファイルの突き合わせで missing が 0。
- 正本側のPNGハッシュ重複が 0。
- 正本側に `.DS_Store`、manifest、AI検証メタデータがない。
- `npm run lint:ui:guardrails`
- `npm run test:ui:review -- /`
