---
description: 就活Pass の標準 release automation を実行し、develop→staging→main→production→Playwright 検証まで進める。
---

<instructions>
本番デプロイ依頼では、repo 内の標準オーケストレーターだけを使う。

1. 先に `make ops-release-check` を実行する
2. 必要なら release 対象だけを stage する
3. `make deploy` を実行する
4. staging / production の Playwright 検証結果まで確認する
5. 失敗時は途中で止め、どの phase で失敗したかを報告する

禁止:
- `git push origin main`
- `vercel deploy --prod` の直接実行
- `railway up` の直接実行

正本:
- `scripts/release/release-career-compass.sh`
- `scripts/release/post-deploy-playwright.sh`
</instructions>
