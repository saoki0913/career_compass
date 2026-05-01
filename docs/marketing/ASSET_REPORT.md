# Marketing Asset Report

Updated: 2026-04-30

## Summary

| Area | Files | PNG | Size |
|---|---:|---:|---:|
| `public/marketing/LP/sections/` root LP正本 | 57 | 57 | 67 MB |
| `public/marketing/LP/assets/` Remotion 補助 | 4 | 4 | 3.1 MB |
| `public/marketing/LP/assets/_archive/` | Git 管理対象外 | Git 管理対象外 | local only |
| `public/marketing/LP/LP.png` | 1 | 1 | 1.2 MB |
| `public/marketing/LP/section_image/` | 9 | 7 | 8.1 MB |

`LP.png` と `section_image/` は完成見本。root LPの本番DOMでは使わず、`sections/` のセクション別カテゴリを正本として参照する。`assets/` は既存の Remotion 動画が参照している最小限の互換素材だけ維持する。

## Root LP Section Assets

| Folder | Files | PNG | Size | Purpose |
|---|---:|---:|---:|---|
| `hero/` | 9 | 9 | - | Hero モック・装飾・参考バッジ |
| `worries/` | 10 | 10 | - | 悩みカード・装飾 |
| `features/` | 8 | 8 | - | 機能カード・Google カレンダー連携 |
| `how-to/` | 6 | 6 | - | 使い方ステップカード |
| `before-after/` | 9 | 9 | - | Before/After 人物・矢印・モック |
| `pricing/` | 10 | 10 | - | 料金セクション参考・装飾 |
| `faq/` | 2 | 2 | - | FAQ 見出し・人物 |
| `footer/` | 3 | 3 | - | ロゴ・都市景観・人物 |

## Remotion Compatibility Assets

| Folder | Files | PNG | Size | Purpose |
|---|---:|---:|---:|---|
| `flow/` | 1 | 1 | 0.9 MB | 作成・対策・管理フロー |
| `mockups/` | 2 | 2 | 2.2 MB | PC/iPhoneモック |
| `pain-cards/` | 1 | 1 | 0.2 MB | Pain補助 |

## Local Archived Assets

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
- Root LP の新規参照は `src/lib/marketing/lp-assets.ts` の `lpSectionAsset()` 経由に統一。
- Footer ロゴも `sections/footer/compass-icon-navy.png` に複製し、root LP 正本側で完結。

Detailed usage rules are maintained in [`asset-inventory.md`](./asset-inventory.md).

`_archive/` は Git 管理対象外のローカル退避領域です。復元が必要な場合のみ一時作成し、採用する素材は用途別の active 正本フォルダへ昇格させます。
