---
description: LP デモ動画の収録と再生成を 1 つの入口にまとめる。
---

<instructions>
LP 動画更新では、この入口から `record`, `render`, `record+render` を選ぶ。

record:
- `npm run demo:record -- [--grep '<pattern>']`

render:
- `npm run demo:render`

record+render:
1. 必要セグメントを収録する
2. `npm run demo:render`
3. `public/marketing/videos/product-demo.mp4` を spot check する

注意:
- production guest 制約で安定しない導線は無理に含めない
- Hero の `16:10` を前提に確認する
</instructions>
