# Billing State Machine

## 目的

AI stream route における課金契約を統一し、二重消費・未消費完了・予約取り残しを防ぐ。

## 基本方針

- 会話系 feature の正本モデルは `precheck -> stream -> DB save -> consume` とする。
- `consumeCredits` は `complete` 受信直後ではなく、永続化成功後にのみ呼ぶ。
- `consumeCredits` 失敗時は DB を巻き戻さず、未課金完了としてログと監視で補足する。
- `reserve -> confirm / cancel` は ES Review のみで維持する。

## 共通状態遷移

| 状態 | 課金 | 永続化 | 応答 |
| --- | --- | --- | --- |
| 開始前 | `precheck` | なし | 不足なら 402 |
| FastAPI fetch 開始 | なし | なし | progress |
| ストリーム中 | なし | なし | progress / chunk |
| `complete` 受信 | なし | save 試行 | 待機 |
| save 成功 | `consumeCredits` | 完了 | enriched `complete` |
| save 失敗 | なし | rollback / no-op | `error` |
| timeout / fetch 例外 | なし | なし | 504 / 502 |
| stream error | なし | なし | `error` |
| client disconnect | なし | なし | 到達不能 |
| `consumeCredits` 失敗 | 失敗ログのみ | save 済み | `complete` + 監視対象 |

## Feature 別

### Motivation

- 現在のモデルを基準にする
- save 後に `consumeCredits`
- `consumeCredits` 失敗は監視対象にする

### Gakuchika

- `consumeCredits` を save 前に呼ばない
- Motivation と同じ順序へ寄せる
- 独自 stream 実装でも課金順序は共通契約に従う

### ES Review

- `reserve` を維持する
- `reserve` は fetch 前に成功していること
- `complete` で `confirm`
- 失敗系はすべて `cancel`
- `fetch` 例外でも `cancel` が必ず走るよう `try/finally` を使う

## 監視対象

- save success + consume failure
- reserve success + confirm/cancel 未達
- 同一 request での重複 consume

## 契約テスト

- precheck 失敗時に consume / reserve が走らない
- fetch 例外で ES reservation が cancel される
- save 失敗時に consume が走らない
- stream error 時に consume が走らない
- consume failure 時に save 結果は残り、監視ログが出る
