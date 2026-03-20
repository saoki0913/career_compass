# SEO Rollout

最終更新: 2026-03-20

## 目的

- `https://www.shupass.jp` の指名検索と主要クラスターの indexation を強化する
- `robots.txt` / `sitemap.xml` / metadata / Search Console の整合を取る

## Search Console セットアップ

1. `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` に verification token を設定する
2. 本番デプロイ後にホームの `<meta name="google-site-verification">` を確認する
3. Search Console で `https://www.shupass.jp/` をプロパティ追加する
4. `https://www.shupass.jp/sitemap.xml` を送信する

## デプロイ後の確認URL

- `/`
- `/es-tensaku-ai`
- `/shukatsu-ai`
- `/shukatsu-kanri`
- `/pricing`
- `/tools/es-counter`
- `/templates/shiboudouki`
- `/checklists/deadline-management`

## 確認項目

- 指名検索: `就活Pass`, `就活パス`, `シューパス`
- 機能検索: `ES添削 AI`, `ES AI`, `就活AI`, `就活 締切 管理`
- `site:shupass.jp` で主要公開ページが順次出ること
