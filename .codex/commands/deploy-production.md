---
description: 就活Pass の標準 release automation を実行し、develop→staging→main→production→Playwright 検証まで進める。
---

<instructions>
本番デプロイ依頼では、repo 内の標準オーケストレーターだけを使う。

次のような自然文は同義として扱う:
- `本番にデプロイして`
- `本番反映して`
- `公開して`
- `リリースして`
- `本番に出して`
- `push this live`
- `ship it`
- `deploy to production`

1. 先に `make ops-release-check` を実行する
2. 明示がなければ `make deploy-stage-all` を使う
3. `staged-only` 指定があるときだけ `make deploy` を使う
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
