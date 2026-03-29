---
name: bugfix-workflow
description: 不具合対応を再現、切り分け、最小修正、回帰確認の順に固定する。
---

# Bugfix Workflow

バグ修正は TDD と最小修正を前提に進める。

## 手順

1. 再現条件を特定する
2. frontend か backend かを切り分ける
3. failing test を先に置く
4. 最小修正で直す
5. 関連 test を回す
6. 変更内容と残るリスクをまとめる

## frontend の回帰確認

- `npm run test:unit -- <target>`
- `npm run test:ui:review -- <route>`

## backend の回帰確認

- 関連 pytest
- `scripts/ci/run-backend-deterministic.sh`
