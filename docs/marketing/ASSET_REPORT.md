# Marketing Asset Report

Updated: 2026-04-27

## Summary

| Area | Files | PNG | Size |
|---|---:|---:|---:|
| `public/marketing/LP/assets/` active正本 | 177 | 177 | 126.6 MB |
| `public/marketing/LP/assets/_archive/` | 267 | 258 | 170.6 MB |
| `public/marketing/LP/LP.png` | 1 | 1 | 1.2 MB |
| `public/marketing/LP/section_image/` | 9 | 7 | 8.1 MB |

`LP.png` と `section_image/` は完成見本。root LPの本番DOMでは使わず、`assets/` の用途別カテゴリを正本として参照する。

## Active Assets

| Folder | Files | PNG | Size | Purpose |
|---|---:|---:|---:|---|
| `branding/` | 4 | 4 | 3.4 MB | ロゴ・cityscape |
| `characters/` | 27 | 27 | 34.1 MB | 人物キャラクター |
| `decorative/` | 19 | 19 | 11.4 MB | 背景装飾・接続線 |
| `faq_generated_assets_transparent/` | 19 | 19 | 6.0 MB | FAQ補助 |
| `flow/` | 1 | 1 | 0.9 MB | 作成・対策・管理フロー |
| `icons-circled/` | 19 | 19 | 15.7 MB | 円形アイコン |
| `icons-line/` | 14 | 14 | 7.2 MB | 線画アイコン |
| `mockups/` | 5 | 5 | 4.7 MB | PC/iPhoneモック |
| `numbers/` | 4 | 4 | 3.4 MB | ステップ番号 |
| `pain-cards/` | 1 | 1 | 0.2 MB | Pain補助 |
| `pricing_assets_transparent/` | 20 | 20 | 13.7 MB | Pricing補助 |
| `shukatsu_pass_transparent_assets/` | 19 | 19 | 3.8 MB | Footer人物・補助 |
| `step-cards/` | 4 | 4 | 3.6 MB | HowToUseカード |
| `ui-cards/` | 17 | 17 | 14.3 MB | 機能カードUI |
| `ui-cards-detail/` | 4 | 4 | 4.1 MB | 詳細画面UI |

## Archived Assets

| Folder | Files | PNG | Size | Reason |
|---|---:|---:|---:|---|
| `_archive/generated/` | 176 | 173 | 126.7 MB | 生成元別フォルダを正本カテゴリへ採用後に退避 |
| `_archive/duplicates/` | 62 | 62 | 23.8 MB | 同一ハッシュ重複 |
| `_archive/text-images/` | 17 | 17 | 14.7 MB | HTML化すべき見出し・ラベル画像 |
| `_archive/unused-ui/` | 6 | 6 | 5.3 MB | root LP実装で未参照のUI部品 |
| `_archive/metadata/` | 6 | 0 | 0.1 MB | `.DS_Store`、manifest、AI検証メタデータ |

## Integrity Checks

- Active PNG duplicate groups: `0`
- Active non-image metadata files: `0`
- Missing asset references in `src/components/landing`, `src/lib/marketing`, `remotion`: `0`
- Newly補完した欠落参照:
  - `branding/compass-icon-navy.png`
  - `decorative/blue-circle-lg.png`
  - `decorative/star-sparkle-1.png`
  - `decorative/dot-pattern-light.png`
  - `decorative/dot-grid-5x5.png`
  - `pain-cards/pain-es-barabara.png`
  - `decorative/connector-arrow-1-to-2.png`
  - `decorative/connector-arrow-2-to-3.png`
  - `decorative/connector-arrow-3-to-4.png`

Detailed usage rules are maintained in [`asset-inventory.md`](./asset-inventory.md).
