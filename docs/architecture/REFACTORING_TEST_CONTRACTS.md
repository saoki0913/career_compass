# Refactoring Test Contracts

## 目的

大きな Phase 完了後の総合テストだけに依存せず、各 Phase で守るべき契約を小さなテストで固定する。

## Phase 1

- conversation adapter round-trip
- legacy payload の canonical 変換
- null / undefined / empty object の default 値

## Phase 2

- 分割した hook の初期 state
- 主要 action の state update
- optimistic message rollback
- pending complete の delayed commit

## Phase 3

- SSE event sequence
- billing failure matrix
- feature-specific event forwarding
- timeout / stream error / save error の課金不変条件

## Phase 4

- UI regression は Playwright で確認
- page が local component / local effect / local state を持たないことをレビュー対象にする

## Phase 5

- repository idempotency
- persistence save -> read round-trip
- context-builder が canonical type に適合すること

## Phase 6

- FastAPI module split 後の import contract
- streaming helper の正本が単一であること
- 既存 pytest の green 維持
