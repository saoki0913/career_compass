---
name: demo-video-workflow
description: LP 用 product demo の収録とレンダリングを既存 workflow に接続する。
---

# Demo Video Workflow

LP 動画更新は既存 script と Playwright capture を使う。

## 収録

- `npm run demo:record -- [--grep '<pattern>']`
- 正本は `e2e/demo-recording.spec.ts`
- 本番 `https://www.shupass.jp/` を正とする
- ローディング、空白、待機時間が長い導線は収録前提で避ける

## 仕上げ

- `npm run demo:render`
- 出力は `public/marketing/videos/product-demo.mp4`
- Hero の `16:10` 前提で最終確認する

## 実務ルール

- production guest 制約で安定しない導線は無理に採用しない
- 新しい編集基盤を増やす前に既存 render script を優先する
