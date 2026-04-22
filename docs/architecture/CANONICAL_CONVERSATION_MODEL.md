# Canonical Conversation Model

## 目的

会話系 feature の状態表現を `DB row`、`transport payload`、`UI state`、`domain state` に分け、どれを正本として扱うかを明示する。

## 原則

- canonical model の正本は TypeScript の domain type とする。
- DB と transport は canonical model への adapter として扱う。
- legacy 互換吸収は `safeParse*` 系 adapter に閉じ込める。
- canonical model から DB row / transport payload への変換は `serialize*` 系 adapter に閉じ込める。
- `safeParse(serialize(canonical))` は canonical と等価であることを契約テストで保証する。

## Feature 別の扱い

### Motivation

- canonical model: `MotivationConversationContext`
- persisted source: `motivation_conversations.conversation_context`
- owner:
  - Python / FastAPI が `conversation_context` の意味論を主導する
  - TypeScript は readonly な domain projection を持つ
- rule:
  - Python-owned fields は TS 側で readonly として扱う
  - TS は UI 表示と route orchestration のために parse/serialize するが、値の生成責務は持たない

### Interview

- canonical model: `InterviewTurnState`
- persisted source: `interview_conversations.turn_state_json`
- owner:
  - TypeScript が canonical model の正本を持つ
  - 旧列 (`current_stage`, `question_count`, `completed_stages` など) は hydrate fallback としてのみ扱う

### Gakuchika

- canonical model: `ConversationState`
- persisted source: `gakuchika_conversations.star_scores`
- owner:
  - TypeScript が canonical model の正本を持つ
  - `star_scores` という列名は legacy だが、中身は `ConversationState` の serialized JSON として扱う

## Adapter の責務

### `safeParse*`

- DB row / JSON / FastAPI payload から canonical model を生成する
- snake_case / camelCase の差異を吸収する
- legacy field 名と旧 shape を吸収する
- null / undefined / empty object の default 値を決める

### `serialize*`

- canonical model から DB row 用の shape を作る
- route / persistence layer が直接 field mapping を持たないようにする
- 非正規化列が必要な場合は adapter 内でのみ展開する

## 許容する例外

- ES Review は会話 canonical model の対象外
- Motivation の Python-owned fields は、canonical model ではあるが TS から更新しない

## 禁止事項

- route 層で field 名の変換や legacy 吸収を行うこと
- UI hook が DB row shape や FastAPI payload shape を直接知ること
- repository が canonical model の意味論を持つこと

## 契約テスト

- `safeParse(serialize(canonical))` round-trip
- legacy payload -> `safeParse` -> canonical projection
- null / undefined / empty object -> default canonical value
