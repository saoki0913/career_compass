# Career Compass Dev

就活Pass repo の日常開発・保守・運用を束ねる repo-local plugin。

## 目的

- UI 変更を `ui:preflight` と Playwright review に乗せる
- release を repo 正本の script / make target に寄せる
- demo 動画、RAG、security、SEO、bugfix、refactor、infra 連携の入口を統一する

## 主要 command

- `ui-start`: UI 実装前後の標準導線
- `quality-check`: bugfix、test、security、SEO、refactor、RAG 回帰の入口
- `release`: staging / production release の標準入口
- `infra`: provider 別の正本 workflow へ接続
- `demo-video`: LP デモ動画更新

## 主要 skill

- `ui-change-check`
- `release-check`
- `demo-video-workflow`
- `rag-change-check`
- `security-change-check`
- `seo-change-check`
- `bugfix-workflow`
- `frontend-refactor-check`
- `backend-refactor-check`
- `infra-integration-check`

## 運用方針

- command は薄い入口に留める
- 実処理は repo 既存の script / make target / docs を正本にする
- hooks は advisory-only で、自動実行はしない

## 依頼から command を選ぶ目安

- UI 崩れ、UI 実装開始、route review: `ui-start`
- バグ、テスト、security、SEO、RAG 回帰、refactor: `quality-check`
- staging / production release: `release`
- Vercel、Railway、Supabase、Cloudflare、Stripe: `infra`
- LP 動画の収録や再生成: `demo-video`
